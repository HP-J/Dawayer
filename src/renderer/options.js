import { remote } from 'electron';

import { join } from 'path';
import { readJSON, existsSync } from 'fs-extra';
import { tmpdir } from 'os';

import * as settings from '../settings.js';

import request from 'request-promise-native';

import { createElement, rewindTimeText, rewindTimeTooltip, skipTimeText, skipTimeTooltip } from './renderer.js';

import { addNewDirectories, removeDirectory, rescanStorage } from './storage.js';
import { getRewindTiming, setRewindTiming, getSkipTiming, setSkipTiming } from './playback.js';

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
const directoriesContainer = document.body.querySelector('.optionsItem.directories');

/**  @type { HTMLDivElement }
*/
const aboutContainer = document.body.querySelector('.optionsItem.about');

/**  @type { HTMLDivElement }
*/
const trayContainer = document.body.querySelector('.optionsItem.tray');

/**  @type { HTMLDivElement }
*/
const controlsContainer = document.body.querySelector('.optionsItem.controls');

/** @type { HTMLInputElement }
*/
const rewindOptionInput = controlsContainer.querySelector('input.rewind');

/** @type { HTMLInputElement }
*/
const skipOptionInput = controlsContainer.querySelector('input.skip');

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

  appendDirectories();

  appendTray();
  appendControls();
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

  const removeButton = createElement('.option.directories.button.remove');
  removeButton.innerText = 'X';

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

  element.classList.add('option', 'text');

  return element;
}

function appendDirectories()
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
    rescanStorage();
  };
}

function appendAbout()
{
  // create the check for updates button
  checkElement = createElement('.option.about.button.check');

  if (localData)
  {
    if (localData.branch)
      aboutContainer.appendChild(createAboutText('Branch: ' + localData.branch));

    if (localData.commit)
      aboutContainer.appendChild(createAboutText('Commit: ' + localData.commit));

    if (localData.pipeline)
      aboutContainer.appendChild(createAboutText('Pipeline: ' + localData.pipeline));

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

  // if there's enough data to support the auto-update system,
  // then add a check for updates button
  if (localData && localData.branch && localData.commit && localData.package)
  {
    checkElement.innerText = 'Check for Updates';

    aboutContainer.appendChild(checkElement);

    checkElement.onclick = checkForUpdates;
  }
}

function appendTray()
{
  const enabled = settings.get('trayIcon', true);
  const color = settings.get('trayIconColor', 'dark');

  trayContainer.querySelector(`.${enabled}`).classList.add('highlight');
  trayContainer.querySelector(`.${color}`).classList.add('highlight');

  trayContainer.querySelector('.true').onclick = () =>
  {
    event.srcElement.classList.add('highlight');
    trayContainer.querySelector('.false').classList.remove('highlight');
    
    settings.set('trayIcon', true);
  };

  trayContainer.querySelector('.false').onclick = (event) =>
  {
    event.srcElement.classList.add('highlight');
    trayContainer.querySelector('.true').classList.remove('highlight');

    settings.set('trayIcon', false);
  };

  trayContainer.querySelector('.dark').onclick = () =>
  {
    event.srcElement.classList.add('highlight');
    trayContainer.querySelector('.light').classList.remove('highlight');

    settings.set('trayIconColor', 'dark');
  };

  trayContainer.querySelector('.light').onclick = () =>
  {
    event.srcElement.classList.add('highlight');
    trayContainer.querySelector('.dark').classList.remove('highlight');

    settings.set('trayIconColor', 'light');
  };
}

function appendControls()
{
  const applyElement = controlsContainer.querySelector('.apply');

  const rewind = getRewindTiming();

  rewindOptionInput.value = rewind;
  rewindTimeText.innerText = rewind;
  rewindTimeTooltip.setContent(`Rewind ${rewind}s`);

  const skip = getSkipTiming();

  skipOptionInput.value = skip;
  skipTimeText.innerText = skip;
  skipTimeTooltip.setContent(`Skip ${skip}s`);

  rewindOptionInput.tabIndex = skipOptionInput.tabIndex = -1;
  
  rewindOptionInput.oninput =
  skipOptionInput.oninput = (event) =>
  {
    if (event.srcElement.value !== '')
    {
      if (event.srcElement.value > 99)
        event.srcElement.value = 99;
    
      if (event.srcElement.value < 1)
        event.srcElement.value = 1;
    }

    if (
      rewindOptionInput.value == '' ||
      skipOptionInput.value == '' ||
      (getRewindTiming() == rewindOptionInput.value && getSkipTiming() == skipOptionInput.value))
    {
      if (!applyElement.classList.contains('clean'))
        applyElement.classList.add('clean');
    }
    else
    {
      if (applyElement.classList.contains('clean'))
        applyElement.classList.remove('clean');
    }
  };

  applyElement.onclick = () =>
  {
    if (getRewindTiming() != rewindOptionInput.value)
      changeRewindTiming(rewindOptionInput.value);

    if (getSkipTiming() != skipOptionInput.value)
      changeSkipTiming(skipOptionInput.value);
    
    applyElement.classList.add('clean');
  };
}

/** @param { number } rewind
*/
function changeRewindTiming(rewind)
{
  if (setRewindTiming(rewind))
  {
    rewindTimeText.innerText = rewind;
    rewindTimeTooltip.setContent(`Rewind ${rewind}s`);
  }
}

/** @param { number } skip
*/
function changeSkipTiming(skip)
{
  if (setSkipTiming(skip))
  {
    skipTimeText.innerText = skip;
    skipTimeTooltip.setContent(`Skip ${skip}s`);
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

  dl(
    mainWindow,
    url.href,
    {
      directory: tmpdir(),
      filename: filename,
      showBadge: false,
      onProgress: updateProgress
    })
    .then(() => updateDownloaded(join(tmpdir(), filename)))
    .catch(updateError);
}