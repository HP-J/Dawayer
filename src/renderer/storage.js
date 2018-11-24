import { join } from 'path';
import { homedir, platform } from 'os';

import { readdirSync, existsSync, statSync } from 'fs';

// import * as settings from 'electron-json-config';

/**  @type { HTMLDivElement }
*/
const localContainer = document.body.querySelector('.optionsItem.container.local');

const AUDIO_EXTENSIONS_REGEX = /.mp3$|.mpeg$|.opus$|.ogg$|.wav$|.acc$|.m4a$|.flac$/;

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

/** @param { string } directory
*/
function appendDirectoryElement(directory)
{
  const container = document.createElement('div');
  container.className = 'option container local';

  const directoryText = document.createElement('div');
  directoryText.className = 'option local directory';
  directoryText.innerText = directory;

  const removeButton = document.createElement('div');
  removeButton.className = 'option local remove';
  removeButton.innerText = 'Remove';

  removeButton.onclick = () =>
  {
    // remove from dom
    localContainer.removeChild(container);

    // remove it from the save file
    removeDirectory(directory);
  };

  container.appendChild(directoryText);
  container.appendChild(removeButton);

  // append to dom
  localContainer.insertBefore(
    container,
    localContainer.children[1]);

  return container;
}

function getDefaultMusicDir()
{
  const currentPlatform = platform();

  if (currentPlatform === 'linux' || currentPlatform === 'win32')
    return join(homedir(), '/Music');
}

/** @param { string[] } directories
*/
export function addNewDirectories(directories)
{
  for (let i = 0; i < directories.length; i++)
  {
    addNewDirectory(directories[i]);
  }
}

/** @param { string } directory
*/
export function addNewDirectory(directory)
{
  // create a new dom element for the directory
  appendDirectoryElement(directory);

  // TODO add new directory to the save file
}

/** @param { string } directory
*/
export function removeDirectory(directory)
{
  // TODO remove directory from the save file
}

export function appendCachedAudioFiles()
{
  // insert the graphics/settings for the audio directories
  appendDirectoryElement(getDefaultMusicDir())

  // walk through all the listed audio directories
  const files = walkSync([ getDefaultMusicDir() ]);

  for (let i = 0; i < files.length; i++)
  {
    const file = files[i];

    // see if the file matches any of those supported audio extensions
    if (file.match(AUDIO_EXTENSIONS_REGEX))
    {
      console.log(file);
    }
  }
}