const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const request = require('request');
const { autoUpdater } = require('electron-updater');

// Disable warnings for:
// - Disabled webSecurity
// - allowRunningInsecureContent
// - Insecure Content-Security-Policy
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

function asyncRequest(options) {
  return new Promise(function (resolve) {
    request(options, function (error, response, body) {
      resolve({ error, response, body });
    });
  });
}

ipcMain.handle(
  'forward-webhook',
  async (_event, { method, url, headers, body, metadata }) => {
    const {
      error,
      response,
      body: data,
    } = await asyncRequest({
      method,
      url,
      headers,
      body,
      followAllRedirects: true,
      strictSSL: false,
    });
    return {
      metadata,
      statusCode: response ? response.statusCode : null,
      rawHeaders: response ? response.rawHeaders : null,
      data,
      error,
    };
  },
);

let win;

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1600,
    height: 880,
    webPreferences: {
      nodeIntegration: true,
      // contextIsolation became true by default in Electron 12: https://github.com/electron/electron/releases/tag/v12.0.0
      // but it needs to be false for window.require('electron') in useNodeSender.tsx: https://stackoverflow.com/a/66779209/188740
      contextIsolation: false,
      webSecurity: false,
    },
  });

  // In dev, load React app served by create-react-app.
  // In production, load built index.html.
  win.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`,
  );

  // Open the DevTools.
  if (isDev) win.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function sendStatusToWindow(text) {
  win.webContents.send('message', text);
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Checking for update...');
});
autoUpdater.on('update-available', info => {
  sendStatusToWindow('Update available.');
});
autoUpdater.on('update-not-available', info => {
  sendStatusToWindow('Update not available.');
});
autoUpdater.on('error', err => {
  sendStatusToWindow('Error in auto-updater. ' + err);
});
autoUpdater.on('download-progress', progressObj => {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
  log_message =
    log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message =
    log_message +
    ' (' +
    progressObj.transferred +
    '/' +
    progressObj.total +
    ')';
  sendStatusToWindow(log_message);
});
autoUpdater.on('update-downloaded', info => {
  sendStatusToWindow('Update downloaded');
});

app.on('ready', function () {
  sendStatusToWindow('Ready');
  autoUpdater.checkForUpdatesAndNotify();
});

setTimeout(function () {
  sendStatusToWindow('Ping logger');
}, 4000);
