let { context, GitHub } = require("@actions/github");
let { constants, createBrotliCompress } = require('zlib');
let fs = require('fs');
let table = require('markdown-table');

const RESULTS_HEADER = [
  "Chunk",
  "Size"
];
const TABLE_HEADING  = '## Size-limit report';

const formatChange = (base, current) => {
  if (!current) return "-100%";

  const value = ((current - base) / current) * 100;
  const formatted = (Math.sign(value) * Math.ceil(Math.abs(value) * 100)) / 100;

  if (value > 0) return `+${formatted}%`;
  return `${formatted}%`;
}

const formatLine = (value, change) => {
  return `${value} (${change})`;
}

const formatSizeResult = (name, base, current) => [
  name,
  formatLine(String(current), formatChange(base, current))
];

const formatResults = (base, current) => {
  const files = [...new Set([...Object.keys(base), ...Object.keys(current)])]
  const header = RESULTS_HEADER
  const fields = files
  .filter((name) => base[name] !== current[name])
  .map((file) => {
    return formatSizeResult(file, base[file] || 0, current[file] || 0);
  });

  if (!fields.length) return [["No change in bundle size"]]
  return [header, ...fields];
}

function brotliSize(path) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let pipe = fs.createReadStream(path).pipe(
      createBrotliCompress({
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
        },
      }),
    );
    pipe.on('error', reject);
    pipe.on('data', buf => {
      size += buf.length;
    });
    pipe.on('end', () => {
      resolve(size);
    });
  });
}
fs.readdir('build/static/js', async (err, files) => {
  if (!err) {
    const fileSizes = {};
    await Promise.all(
      files.map(async filePath => {
        if (filePath.endsWith('.chunk.js')) {
          fileSizes[filePath.split('.')[0]] = await brotliSize(
            `build/static/js/${filePath}`,
          );
        }
      }),
    );

    const pullRequestContext = context.payload.pull_request
    fs.readFile('baseline.json', async (err, data) => {
      if (!err && pullRequestContext) {
        const baseline = JSON.parse(data)
        const { GITHUB_TOKEN } = process.env;
        const octokit = new GitHub(GITHUB_TOKEN);
        const pullNumber = pullRequestContext.number;
        const body = [
          `${TABLE_HEADING} for ${pullRequestContext.head.sha}`,
          table(formatResults(baseline, fileSizes))
        ].join("\r\n")

        const existingCommentId = await getExistingCommentId(octokit, pullNumber)
        if (existingCommentId) {
          octokit.issues.updateComment({
            ...context.repo,
            comment_id: existingCommentId,
            body,
          });
        } else {
          octokit.issues.createComment({
            ...context.repo,
            issue_number: pullNumber,
            body
          });
        }
      }
    });
    console.log(JSON.stringify(fileSizes));
  }
});

const getExistingCommentId = async (octokit, pull_number) => {
  const existingComments = (await octokit.issues.listComments({
    ...context.repo,
    issue_number: pull_number,
  })).data
  .filter(comment =>
    comment.user.login === "github-actions[bot]" &&
    (comment.body.startsWith(TABLE_HEADING)))

  return existingComments.length > 0 ? existingComments[0].id : null
}
