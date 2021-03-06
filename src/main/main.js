import { BrowserWindow, Menu, app, screen, dialog, ipcMain } from 'electron';

import prompt from 'electron-prompt';

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
    label: 'File',
    submenu: [
      {
        label: 'Open File', accelerator: 'CmdOrCtrl+O', click()
        {
          dialog.showOpenDialog(mainWindow, {
            title: 'Choose the audio files',
            properties: [ 'openFile', 'multiSelections' ]
          }, (files) =>
          {
            if (files && files.length > 0)
              mainWindow.webContents.send('queueTracks', ...files);
          });
        }
      },
      {
        label: 'Open Stream', click()
        {
          const mode = settings.get('colorMode', 'default');
          
          let stylePath = path.join(__dirname, '../renderer/styles/prompt.default.css');

          if (mode === 'dark')
            stylePath = path.join(__dirname, '../renderer/styles/prompt.dark.css');
          
          prompt({
            title: 'Choose the audio stream url',
            label: '',
            customStylesheet: stylePath,
            inputAttrs: {
              type: 'url',
              required: true
            }
          }, mainWindow).then((value) =>
          {
            if (value)
              mainWindow.webContents.send('queueTracks', value);
          });
        }
      }
    ]
  },
  {
    label: 'Window',
    submenu: [
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

  mainWindow = new BrowserWindow(
    {
      webPreferences: {
        nodeIntegration: true
      },
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

  // replace the default menu
  mainWindow.setMenu(menuTemplate);

  setWindow(mainWindow);
  setApp(app);

  loadOptions();

  // and load the index.html of the app
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, '../index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // set arguments as a global variable
  global.argv = process.argv;

  if (isDebug())
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

if (!isDebug() && !app.requestSingleInstanceLock())
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

  app.on('second-instance', (event, args) =>
  {
    if (mainWindow)
    {
      focus();

      // sends the args to the renderer to queue them for playback
      mainWindow.webContents.send('queueTracks', ...args);
    }
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
