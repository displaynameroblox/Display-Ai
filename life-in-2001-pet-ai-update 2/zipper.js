const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

function zipViewsFolder() {
  const output = fs.createWriteStream("moderation-portal-views.zip");
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(`✅ Zipped ${archive.pointer()} bytes to moderation-portal-views.zip`);
  });

  archive.on("error", err => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(path.join(__dirname, "views"), "views");
  archive.finalize();
}

module.exports = zipViewsFolder;
