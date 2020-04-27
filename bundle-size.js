let { constants, createBrotliCompress } = require('zlib');
let fs = require('fs');
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
    fs.readFile('baseline.json', (err, data) => {
      if (!err) {
        const baseline = JSON.parse(data);
        Object.keys(fileSizes).forEach(file => {
          if (fileSizes[file] === baseline[file]) {
            console.log(file, fileSizes)
          }
        });
      }
    });
    console.log(JSON.stringify(fileSizes));
  }
});
