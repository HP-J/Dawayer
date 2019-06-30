import { remote } from 'electron';

import { join } from 'path';
import { readJSON, readFile, pathExists } from 'fs-extra';
import { tmpdir } from 'os';

import * as settings from '../settings.js';
import download from '../dl.js';

import { createElement, removeAllChildren, togglePodcastsPage, rewindTimeText, rewindTimeTooltip, skipTimeText, skipTimeTooltip } from './renderer.js';

import { addNewDirectories, removeDirectory, rescanStorage } from './storage.js';
import { showPodcastCollectionOverlay } from './podcasts.js';

import { getRewindTiming, setRewindTiming, getSkipTiming, setSkipTiming } from './playback.js';

/** @typedef { Object } BuildData
* @property { string } branch
* @property { string } commit
* @property { string } date
* @property { string } package
*/

/**  @type { BuildData }
*/
let localData;

/**  @type { HTMLDivElement }
*/
let checkElement;

/**  @type { HTMLDivElement }
*/
let changeLogElement;

/**  @type { HTMLDivElement }
*/
const optionsPageElement = document.body.querySelector('.page.options');

/**  @type { HTMLDivElement }
*/
const localAudioSection = optionsPageElement.querySelector('.optionsItem.localAudio');

/**  @type { HTMLDivElement }
*/
const localAudioDirectoriesContainer = localAudioSection.querySelector('.option.localAudio.container');

/**  @type { HTMLDivElement }
*/
const aboutSection = optionsPageElement.querySelector('.optionsItem.about');

/**  @type { HTMLDivElement }
*/
const traySection = optionsPageElement.querySelector('.optionsItem.tray');

/**  @type { HTMLDivElement }
*/
const themingSection = optionsPageElement.querySelector('.optionsItem.theming');

/**  @type { HTMLDivElement }
*/
const controlsSection = optionsPageElement.querySelector('.optionsItem.controls');

/**  @type { HTMLDivElement }
*/
const podcastsSection = optionsPageElement.querySelector('.optionsItem.podcasts');

/** @type { HTMLInputElement }
*/
const rewindOptionInput = controlsSection.querySelector('input.rewind');

/** @type { HTMLInputElement }
*/
const skipOptionInput = controlsSection.querySelector('input.skip');

const { mainWindow } = remote.require(join(__dirname, '../main/window.js'));

/** initialize options, like the storage/cache system that loads local albums and tracks
*/
export function initOptions()
{
  const buildDataPath = join(__dirname, '../../build.json');

  // read build.json
  // then append about section in the options page

  pathExists(buildDataPath).then((exists) =>
  {
    if (!exists)
      return;
    
    readJSON(buildDataPath).then((data) =>
    {
      localData = data;

      appendAbout();
    });
  });
  
  appendDirectories();
  appendPodcasts();
  appendControls();
  
  appendTheming();
  appendTray();
  appendAbout();
}

/** appends a directory element in the options, allowing the user to see
* and remove it when/if they want
* @param { string } directory
*/
export function appendDirectoryNode(directory)
{
  const container = createElement('.option.directory.container');

  const directoryText = createElement('.option.directory.text');
  directoryText.innerText = directory;

  const removeButton = createElement('.option.button');
  removeButton.innerText = '✖';

  // don't remove the last directory
  if (localAudioDirectoriesContainer.children.length <= 0)
    removeButton.classList.add('clean');
  // it's not the last directory anymore
  else if (localAudioDirectoriesContainer.children.length === 1)
    localAudioDirectoriesContainer.children[0].querySelector('.option.button').classList.remove('clean');
  
  removeButton.onclick = () =>
  {
    // remove from dom
    localAudioDirectoriesContainer.removeChild(container);

    // don't remove the last directory
    if (localAudioDirectoriesContainer.children.length === 1)
      localAudioDirectoriesContainer.children[0].querySelector('.option.button').classList.add('clean');

    // remove it from the save file
    removeDirectory(directory);
  };

  container.appendChild(directoryText);
  container.appendChild(removeButton);

  localAudioDirectoriesContainer.appendChild(container);

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
  localAudioSection.querySelector('.option.add').onclick = () =>
  {
    remote.dialog.showOpenDialog(
      mainWindow, {
        title: 'Choose the directory where your audio files exists',
        properties: [ 'openDirectory', 'multiSelections' ]
      },
      addNewDirectories
    );
  };

  localAudioSection.querySelector('.option.rescan').onclick = () =>
  {
    rescanStorage();
  };
}

function appendPodcasts()
{
  const enabled = settings.get('podcasts', false);

  const trueElement = podcastsSection.querySelector('.true');
  const falseElement = podcastsSection.querySelector('.false');
  
  const manageButton = podcastsSection.querySelector('.manage');

  if (!enabled)
  {
    togglePodcastsPage(false);

    manageButton.classList.add('clean');
  }

  podcastsSection.querySelector(`.${enabled}`).classList.add('highlight', 'currentState');

  manageButton.onclick = showPodcastCollectionOverlay;

  trueElement.onclick =
  falseElement.onclick = (event) =>
  {
    podcastsSection.querySelector('.currentState').classList.remove('highlight', 'currentState');

    event.srcElement.classList.add('highlight', 'currentState');
    
    if (event.srcElement.isSameNode(trueElement))
    {
      settings.set('podcasts', true);

      manageButton.classList.remove('clean');
    }
    else
    {
      settings.set('podcasts', false);

      manageButton.classList.add('clean');
    }
  };
}

function appendControls()
{
  const applyElement = controlsSection.querySelector('.apply');

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

function appendTheming()
{
  const mode = settings.get('colorMode', 'default');

  const defaultElement = themingSection.querySelector('.default');
  const darkElement = themingSection.querySelector('.dark');

  themingSection.querySelector(`.${mode}`).classList.add('highlight', 'currentMode');

  document.body.classList.remove('defaultMode');
  document.body.classList.add(`${mode}Mode`);

  defaultElement.onclick =
  darkElement.onclick = (event) =>
  {
    const currentMode = themingSection.querySelector('.currentMode').classList[3];
    const newMode = event.srcElement.classList[3];

    document.body.classList.remove(`${currentMode}Mode`);

    document.body.classList.add(`${newMode}Mode`);

    themingSection.querySelector('.currentMode').classList.remove('highlight', 'currentMode');

    event.srcElement.classList.add('highlight', 'currentMode');
 
    settings.set('colorMode', newMode);
  };
}

function appendTray()
{
  const enabled = settings.get('trayIcon', true);
  const color = settings.get('trayIconColor', 'dark');

  const trueElement = traySection.querySelector('.true');
  const falseElement = traySection.querySelector('.false');

  const darkElement = traySection.querySelector('.dark');
  const blackElement = traySection.querySelector('.black');
  const lightElement = traySection.querySelector('.light');

  traySection.querySelector(`.${enabled}`).classList.add('highlight', 'currentState');
  traySection.querySelector(`.${color}`).classList.add('highlight', 'currentColor');

  trueElement.onclick =
  falseElement.onclick = () =>
  {
    traySection.querySelector('.currentState').classList.remove('highlight', 'currentState');

    event.srcElement.classList.add('highlight', 'currentState');
    
    if (event.srcElement.isSameNode(trueElement))
      settings.set('trayIcon', true);
    else
      settings.set('trayIcon', false);
  };

  darkElement.onclick =
  blackElement.onclick =
  lightElement.onclick = (event) =>
  {
    traySection.querySelector('.currentColor').classList.remove('highlight', 'currentColor');
    
    event.srcElement.classList.add('highlight', 'currentColor');

    settings.set('trayIconColor', event.srcElement.classList[3]);
  };
}

function appendAbout()
{
  const aboutButtonsElement = createElement('.option.about.buttons');
  const changeLogPath = join(__dirname, '../../CHANGELOG.md');

  // clear the about section
  removeAllChildren(aboutSection, 1);

  if (localData)
  {
    if (localData.branch)
      aboutSection.appendChild(createAboutText('Branch: ' + localData.branch));

    if (localData.commit)
      aboutSection.appendChild(createAboutText('Commit: ' + localData.commit));

    if (localData.pipeline)
      aboutSection.appendChild(createAboutText('Pipeline: ' + localData.pipeline));

    if (localData.package)
      aboutSection.appendChild(createAboutText('Package: ' + localData.package));

    if (localData.date)
      aboutSection.appendChild(createAboutText('Release Date: ' + localData.date));
  }

  if (process.versions.electron)
    aboutSection.appendChild(createAboutText('Electron: ' + process.versions.electron));

  if (process.versions.chrome)
    aboutSection.appendChild(createAboutText('Chrome: ' + process.versions.chrome));

  if (process.versions.node)
    aboutSection.appendChild(createAboutText('Node.js: ' + process.versions.node));

  if (process.versions.v8)
    aboutSection.appendChild(createAboutText('V8: ' + process.versions.v8));

  aboutSection.appendChild(aboutButtonsElement);

  pathExists(changeLogPath)
    .then((exists) =>
    {
      if (exists)
        return readFile(changeLogPath, { encoding: 'utf8' });
      else
        return undefined;
    })
    .then((data) =>
    {
      if (data)
      {
        if (!changeLogElement)
        {
          changeLogElement = createElement('.option.about.button.log');

          changeLogElement.innerText = 'Changelog';
    
          changeLogElement.onclick = () =>
          {
            remote.dialog.showMessageBox(mainWindow, {
              type: 'none',
              title: 'Changelog',
              detail: data,
              buttons: [ 'Ok' ]
            });
          };
        }
      
        aboutButtonsElement.appendChild(changeLogElement);
      }
    });

  // if there's enough data to support the auto-update system,
  // then add a check for updates button
  if (localData && localData.branch && localData.commit && localData.package)
  {
    if (!checkElement)
    {
      checkElement = createElement('.option.about.button.check');

      checkElement.innerText = 'Check for Updates';

      checkElement.onclick = checkForUpdates;
    }
    
    aboutButtonsElement.appendChild(checkElement);
  }
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

  checkElement.classList.add('clean');

  window.fetch('https://gitlab.com/hpj/Dawayer/-/jobs/artifacts/' + localData.branch + '/raw/build.json?job=build', {
    keepalive: true,
    cache: 'no-cache',
    redirect: 'follow',
    mode: 'cors'
  })
    .then((res) => res.json())
    .then((remoteData) =>
    {
      // if commit id is different, and there's an available package for this platform
      if (remoteData.commit !== localData.commit)
      {
        if (remoteData[localData.package])
        {
          updateDownload(remoteData[localData.package], remoteData.commit);
        }
        else
        {
          checkElement.innerText = 'An update exists but is not available for your package';

          setTimeout(resetUpdateElement, 4000);
        }
      }
      else
      {
        checkElement.innerText = 'Up-to-date';

        setTimeout(resetUpdateElement, 3000);
      }
    }).catch(resetUpdateElement);
}

function resetUpdateElement()
{
  checkElement.innerText = 'Check for Updates';

  checkElement.classList.remove('clean');
}

/** @param { number } current
* @param { number } total
*/
function updateProgress(current, total)
{
  const percentage = ((current / total) * 100).toFixed(1);

  checkElement.innerText = `Downloading ${percentage}%`;
}

/** @param { string } path
*/
function updateDownloaded(path)
{
  checkElement.innerText = 'Install Update';

  checkElement.classList.remove('clean');

  checkElement.onclick = () => remote.shell.openItem(path);
}

/** @param { string } url
* @param { string } commitID
*/
function updateDownload(url, commitID)
{
  url = new URL(url);

  const filename = `tmp-dawayer-update-${commitID}`;
  const fullPath = join(tmpdir(), filename);

  checkElement.innerText = 'Starting Download';

  // if the update file was already downloaded
  pathExists(fullPath).then((exists) =>
  {
    if (exists)
    {
      updateDownloaded(fullPath);
    }
    else
    {
      download(url.href, {
        dir: tmpdir(),
        filename: filename,
        onProgress: updateProgress,
        onError: resetUpdateElement,
        onDone: () => updateDownloaded(fullPath)
      });
    }
  });
}
