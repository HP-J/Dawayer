var { copySync } = require('fs-extra');
var { join } = require('path');

exports.default = async function(context)
{
  var projectDir = context.packager.projectDir;
  var outputDir = join(context.appOutDir, '/resources/app');

  // copy the compiled files as is
  copySync(join(projectDir, '/compiled'), join(outputDir, '/compiled'));
  
  console.log('  • copied all compiled files into output directory successfully.');
}

