import { readdirSync, existsSync, statSync, readFileSync } from 'fs';

import { join } from 'path';
import { homedir, platform } from 'os';

const LINUX_DEFAULT_MUSIC_DIR = join(homedir(), '/Music');

/** @param { string[] } directories
* @returns { string[] }
*/
function walkSync(directories)
{
  let results = [];

  for (let i = 0; i < directories.length; i++)
  {
    const dir = directories[i];

    if (!existsSync(dir))
      continue;

    const list = readdirSync(dir);

    list.forEach((file) =>
    {
      file = join(dir, file);
      
      const stat = statSync(file);
  
      if (stat && stat.isDirectory())
        // Recurs into a subdirectory
        results = results.concat(walkSync([ file ]));
      else
        // Is a file
        results.push(file);
    });
  }

  return results;
}

export function appendCachedAudioFiles()
{
  console.log(LINUX_DEFAULT_MUSIC_DIR);
}