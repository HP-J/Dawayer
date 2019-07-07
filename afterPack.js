var { copySync } = require('fs-extra');
var { join } = require('path');

exports.default = async function(context)
{
  var projectDir = context.packager.projectDir;
  var outputDir = join(context.appOutDir, '/resources/app');

  // copy the build files as is
  copySync(join(projectDir, '/build'), join(outputDir, '/build'));
  
  console.log('  • copied all build files into output directory successfully.');
}

