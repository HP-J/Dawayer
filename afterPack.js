var { copySync } = require('fs-extra');
var { join } = require('path');

exports.default = async function(context) {
  var outputDir = join(context.appOutDir, '/resources/app/compiled');
  var projectDir = join(context.packager.projectDir, '/compiled');

  copySync(projectDir, outputDir);
  
  console.log('  • copied all compiled files into output directory successfully.');
}
