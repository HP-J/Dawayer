import { remote } from 'electron';

import { join, dirname, basename, extname } from 'path';
import { readJSON, existsSync } from 'fs-extra';
import { homedir, tmpdir, platform } from 'os';

import request from 'request-promise-native';

import { createElement } from './renderer.js';
import { addNewDirectories, removeDirectory, scanCacheAudioFiles } from './storage.js';

/** @typedef { Object } BuildData
* @property { string } branch
* @property { string } commit
* @property { string } date
* @property { string } package
*/

/** @type {{ download: (win: Electron.BrowserWindow, url: string, options: { saveAs: boolean, directory: string, filename: string, openFolderWhenDone: boolean, showBadge: boolean, onStarted: (item: Electron.DownloadItem) => void, onProgress: (percentage: number) => void, onCancel: () => void }) => Promise<Electron.DownloadItem> }}
*/
const { download: dl  } = remote.require('electron-dl');

/**  @type { BuildData }
*/
let localData;

/**  @type { HTMLDivElement }
*/
let checkElement;

/**  @type { HTMLDivElement }
*/
const directoriesContainer = document.body.querySelector('.optionsItem.container.directories');

/**  @type { HTMLDivElement }
*/
const aboutContainer = document.body.querySelector('.optionsItem.container.about');

export const mainWindow = remote.getCurrentWindow();

/** initialize options, like the storage/cache system that loads local albums and tracks
*/
export function initOptions()
{
  const buildDataPath = join(__dirname, '../../build.json');

  // read build.json
  // then append about section in the options page
  if (existsSync(buildDataPath))
  {
    readJSON(buildDataPath).then((data) =>
    {
      localData = data;

      appendAbout();
    });
  }
  else
  {
    appendAbout();
  }
}

/** initialize the events for the options elements, like the add button in the audio directories panel
*/
export function initOptionsEvents()
{
  document.body.querySelector('.option.directories.add').onclick = () =>
  {
    remote.dialog.showOpenDialog(
      mainWindow, {
        title: 'Choose the directory where your audio files exists',
        properties: [ 'openDirectory', 'multiSelections' ]
      },
      addNewDirectories
    );
  };

  document.body.querySelector('.option.directories.rescan').onclick = () =>
  {
    // ADD re-scan button functionality
    // scanCacheAudioFiles();
  };
}

/** appends a directory element in the options, allowing the user to see
* and remove it when/if they want
* @param { string } directory
*/
export function appendDirectoryNode(directory)
{
  const container = createElement('.option.container.directories');

  const directoryText = createElement('.option.directories.directory');
  directoryText.innerText = directory;

  const removeButton = createElement('.option.directories.remove');
  removeButton.innerText = 'Remove';

  removeButton.onclick = () =>
  {
    // remove from dom
    directoriesContainer.removeChild(container);

    // remove it from the save file
    removeDirectory(directory);
  };

  container.appendChild(directoryText);
  container.appendChild(removeButton);

  // append to dom
  directoriesContainer.insertBefore(
    container,
    directoriesContainer.children[1]);

  return container;
}

/** @param  { string } text
*/
function createAboutText(text)
{
  const element = document.createElement('div');

  element.innerText = text;

  element.classList.add('option', 'about', 'text');

  return element;
}

function appendAbout()
{
  // create the check for updates button
  checkElement = createElement('.option.about.check');

  if (localData)
  {
    if (localData.branch)
      aboutContainer.appendChild(createAboutText('Branch: ' + localData.branch));

    if (localData.commit)
      aboutContainer.appendChild(createAboutText('Commit: ' + localData.commit));

    if (localData.package)
      aboutContainer.appendChild(createAboutText(`Package (${localData.package})`));

    if (localData.date)
      aboutContainer.appendChild(createAboutText('Release Date: ' + localData.date));
  }

  if (process.versions.electron)
    aboutContainer.appendChild(createAboutText('Electron: ' + process.versions.electron));

  if (process.versions.chrome)
    aboutContainer.appendChild(createAboutText('Chrome: ' + process.versions.chrome));

  if (process.versions.node)
    aboutContainer.appendChild(createAboutText('Node.js: ' + process.versions.node));

  if (process.versions.v8)
    aboutContainer.appendChild(createAboutText('V8: ' + process.versions.v8));

  if (localData && localData.branch && localData.commit && localData.package)
  {
    checkElement.innerText = 'Check for Updates';

    aboutContainer.appendChild(checkElement);

    checkElement.onclick = checkForUpdates;
  }
}

function checkForUpdates()
{
  checkElement.innerText = 'Checking...';

  checkElement.classList.add('blocked');

  // request the server's build.json, can fail silently
  request('https://gitlab.com/herpproject/Dawayer/-/jobs/artifacts/' + localData.branch + '/raw/build.json?job=build', {  json: true })
    .then((remoteData) =>
    {
      // if commit id is different, and there's an available package for this platform
      if (remoteData.commit !== localData.commit && remoteData[localData.package])
        updateDownload(remoteData[localData.package]);
      else
        checkElement.innerText = 'Up-to-date';
    })
    .catch(updateError);
}

/** @param { number } percentage
*/
function updateProgress(percentage)
{
  percentage = Math.floor(percentage * 100);

  checkElement.innerText = `Downloading ${percentage}%`;
}

function updateError()
{
  checkElement.innerText = 'Check for Updates';

  checkElement.classList.remove('blocked');
}

/** @param { string } path
*/
function updateDownloaded(path)
{
  checkElement.innerText = 'Install Update';

  checkElement.classList.remove('blocked');

  checkElement.onclick = () => remote.shell.openItem(path);
}

/** @param { string } url
*/
function updateDownload(url)
{
  url = new URL(url);

  const filename = 'tmp-' + Date.now() + '-' + url.pathname.substring(url.pathname.lastIndexOf('/') + 1);

  checkElement.innerText = 'Starting Download';

  dl(mainWindow, url.href,
    {
      directory: tmpdir(),
      filename: filename,
      showBadge: false,
      onProgress: updateProgress
    })
    .then(() => updateDownloaded(join(tmpdir(), filename)))
    .catch(updateError);
}