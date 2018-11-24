import { remote } from 'electron';

import { appendCachedAudioFiles, addNewDirectories } from './storage.js';

export const mainWindow = remote.getCurrentWindow();

export function initOptions()
{
  appendCachedAudioFiles();
}

export function initOptionsEvents()
{
  document.body.querySelector('.option.local.add').onclick = () =>
  {
    remote.dialog.showOpenDialog(
      mainWindow, {
        title: 'Choose the directory where your audio files exists',
        properties: [ 'openDirectory', 'multiSelections' ]
      },
      addNewDirectories
    );
  };
}