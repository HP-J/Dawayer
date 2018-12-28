import { Menu, Tray, app, nativeImage } from 'electron';

import { join } from 'path';
import { platform } from 'os';
import { existsSync } from 'fs';

import * as settings from 'electron-json-config';

import { showHide, isDebug } from './window.js';

/** @type { Tray }
*/
export let trayIcon;

const trayMenuTemplate = [
  {
    label: 'Dawayer',
    enabled: false
  },
  {
    type: 'separator'
  },
  {
    label: 'Play/Pause'
  },
  {
    type: 'separator'
  },
  {
    label: 'Show/Hide', click()
    {
      showHide();
    }
  },
  {
    label: 'Quit', click()
    {
      app.quit();
    }
  }
];

export function loadOptions()
{
  if (isDebug())
    return;

  loadTrayIcon();
}

function loadTrayIcon()
{
  if (trayIcon)
    return;

  const enabled = settings.get('trayIcon', true);

  // TODO add option to change dark tray to light

  if (enabled)
  {
    const trayMenu = Menu.buildFromTemplate(trayMenuTemplate);
    const iconPath = join(__dirname, '../../tray-dark.png');

    if (!existsSync(iconPath))
      return;

    trayIcon = new Tray(nativeImage.createFromPath(iconPath));

    trayIcon.on('click', showHide);

    trayIcon.setContextMenu(trayMenu);
  }
}
