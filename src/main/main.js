import { BrowserWindow, app, screen, ipcMain, dialog, Menu } from 'electron';

import path from 'path';
import url from 'url';

import * as settings from '../settings.js';

import { setWindow, setApp, focus, isDebug } from './window.js';
import { loadOptions } from './options.js';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
/** @type { BrowserWindow }
*/
let mainWindow;

const menuTemplate = Menu.buildFromTemplate([
  {
    label: 'Window',
    submenu:
  [
    {
      label: 'Reload', accelerator: 'CmdOrCtrl+R', click()
      {
        mainWindow.reload();
      }
    },
    {
      label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomin'
    },
    {
      label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomout'
    },
    {
      label: 'Reset Zoom', accelerator: 'CmdOrCtrl+Shift+=', role: 'resetzoom'
    },
    {
      label: 'Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click()
      {
        mainWindow.webContents.toggleDevTools();
      }
    },
    {
      label: 'Quit', accelerator: 'CmdOrCtrl+Q', click()
      {
        app.quit();
      }
    },
  ]
  }
]);

function createWindow()
{
  const screenSize = screen.getPrimaryDisplay().workAreaSize;

  // Create the browser window.

  // set the electron window size
  // window's width is 70% of the screen's width
  // window's height is 85% of the screen's height

  // set the electron window location
  // to the center of the screen

  const minWidth = 350;
  const minHeight = 510;

  const savedSize = settings.get('size');

  let width;
  let height;

  width = (!savedSize || isDebug()) ? Math.round(screenSize.width * 0.7) : savedSize[0];
  height = (!savedSize || isDebug()) ? Math.round(screenSize.height * 0.82) : savedSize[1];

  if (minWidth > width)
    width = minWidth;

  if (minHeight > height)
    height = minHeight;

  const savedPosition = settings.get('position');

  const x = (!savedPosition || isDebug()) ? Math.round((screenSize.width - width) / 2) : savedPosition[0];
  const y =  (!savedPosition || isDebug()) ? Math.round((screenSize.height - height) / 2) : savedPosition[1];

  // replace the default menu
  Menu.setApplicationMenu(menuTemplate);

  mainWindow = new BrowserWindow(
    {
      title: 'Dawayer',
      show: true,
      frame: true,
      skipTaskbar: false,
      resizable: true,
      width: width,
      height: height,
      minWidth: minWidth,
      minHeight: minHeight,
      x: x,
      y: y
    }
  );

  setWindow(mainWindow);
  setApp(app);

  loadOptions();

  // and load the index.html of the app
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, '../index.html'),
    protocol: 'file:',
    slashes: true
  }));

  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', () =>
  {
    settings.set('size', mainWindow.getSize());
    settings.set('position', mainWindow.getPosition());
  });

  // emits when the window is closed
  mainWindow.on('closed', () =>
  {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock())
{
  app.quit();
}
else
{
  // workaround color issues
  app.commandLine.appendSwitch('--force-color-profile', 'sRBG');

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow);

  app.on('second-instance', () =>
  {
    if (mainWindow)
      focus();
  });

  // handle any errors at the renderer process
  ipcMain.on('rendererError', (event, data) =>
  {
    dialog.showErrorBox('A Javascript error occurred in the renderer process', data);

    app.quit();
  });

  // Quit when all windows are closed.
  app.on('window-all-closed', () =>
  {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin')
      app.quit();
  });

  app.on('activate', () =>
  {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null)
      createWindow();
  });
}
