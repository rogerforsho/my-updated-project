const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createTray } = require('./tray');
const { createDesktopSecurity } = require('./security');
const { checkServerReady } = require('./portal-connection');

const CONNECTION_RETRY_MS = 15000;

let mainWindow = null;
let tray = null;
let webServerProcess = null;
let connectionRetryTimer = null;
let connectionCheckInProgress = false;
let lastConnectionState = { phase: 'checking' };
app.isQuitting = false;

// Ensure single instance lock
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
}

// Load desktop configuration
function getDesktopConfig() {
  const configPath = path.join(__dirname, '..', 'desktop-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading desktop-config.json:', e);
  }
  return {
    productionUrl: 'https://ojt-monitoring-and-management-syste.vercel.app/auth/sign-in',
    developmentUrl: 'http://localhost:3000/auth/sign-in',
  };
}

const config = getDesktopConfig();
const isProd = app.isPackaged || process.env.NODE_ENV === 'production';
const targetUrl = process.env.DESKTOP_TARGET_URL || (isProd ? config.productionUrl : (config.developmentUrl || 'http://localhost:3000/auth/sign-in'));

const desktopSecurity = createDesktopSecurity(() => mainWindow, targetUrl, path.join(__dirname, 'loader.html'));

function autoStartWebServerIfNeeded(url) {
  // Never attempt to spawn local dev server in packaged production or if pointing to remote https
  if (app.isPackaged || url.startsWith('https://')) return;

  checkServerReady(url).then((result) => {
    if (!result.ready) {
      console.log('Local server not detected at ' + url + '. Attempting background startup...');
      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      try {
        const isWindows = process.platform === 'win32';
        const npmCmd = isWindows ? 'npm.cmd' : 'npm';
        webServerProcess = spawn(npmCmd, ['run', 'dev', '-w', 'apps/web'], {
          cwd: projectRoot,
          stdio: 'pipe',
          shell: true,
        });

        webServerProcess.stdout.on('data', (d) => {
          console.log('[Next.js]', d.toString());
        });
      } catch (err) {
        console.error('Could not auto-spawn web server:', err);
      }
    }
  });
}

function loadSplashScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const loaderPath = path.join(__dirname, 'loader.html');
  lastConnectionState = { phase: 'checking' };
  mainWindow.loadFile(loaderPath, {
    query: { url: targetUrl, isProd: isProd ? '1' : '0' },
  }).then(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('portal-connection-state', lastConnectionState);
    void connectToPortal();
  }).catch((error) => {
    console.error('Could not load the portal connection screen:', error);
  });
}

function publishConnectionState(state) {
  lastConnectionState = state;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('portal-connection-state', state);
  }
}

function scheduleConnectionRetry() {
  clearTimeout(connectionRetryTimer);
  connectionRetryTimer = setTimeout(() => {
    connectionRetryTimer = null;
    void connectToPortal();
  }, CONNECTION_RETRY_MS);
}

async function connectToPortal() {
  if (!mainWindow || mainWindow.isDestroyed() || connectionCheckInProgress) return;
  clearTimeout(connectionRetryTimer);
  connectionRetryTimer = null;
  connectionCheckInProgress = true;
  publishConnectionState({ phase: 'checking' });

  try {
    const result = await checkServerReady(targetUrl);
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (result.ready) {
      console.log('Portal is reachable. Loading ' + targetUrl);
      publishConnectionState({ phase: 'connected' });
      await mainWindow.loadURL(targetUrl);
      return;
    }

    console.warn('Portal is unavailable.', result.statusCode ? `HTTP ${result.statusCode}` : result.errorCode);
    publishConnectionState({
      phase: 'unavailable',
      statusCode: result.statusCode || null,
      errorCode: result.errorCode || null,
      retryInSeconds: CONNECTION_RETRY_MS / 1000,
    });
    scheduleConnectionRetry();
  } catch (error) {
    console.error('Portal connection check failed:', error);
    publishConnectionState({
      phase: 'unavailable',
      errorCode: 'NETWORK_ERROR',
      retryInSeconds: CONNECTION_RETRY_MS / 1000,
    });
    scheduleConnectionRetry();
  } finally {
    connectionCheckInProgress = false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#062415',
    title: 'Colegio de Montalban - OJT Monitoring and Management System',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      // Staff devices intentionally retain the portal session across restarts.
      // The web portal's signOut action clears its Supabase session cookies;
      // signing out before switching accounts prevents session reuse.
      partition: 'persist:cdm-ojt-staff-portal',
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load splash screen first
  loadSplashScreen();

  // Auto-spawn dev server if in local dev mode
  autoStartWebServerIfNeeded(targetUrl);

  // Hide default top menu for clean look
  mainWindow.setMenuBarVisibility(false);

  // Enable standard keyboard shortcuts (F5, Ctrl+R to reload, F12 / Ctrl+Shift+I for DevTools)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // Reload: F5, Ctrl+R, Cmd+R
      if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
        if (input.shift) {
          mainWindow.webContents.reloadIgnoringCache();
        } else {
          mainWindow.webContents.reload();
        }
        event.preventDefault();
      }
      // DevTools: F12, Ctrl+Shift+I, Cmd+Option+I
      if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });

  // Graceful handling of network drops / failure to load
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (errorCode === -3 || !isMainFrame) return; // Ignore aborted navigations and failed subresources.
    console.warn(`Portal load failed (${errorCode}: ${errorDescription}). Displaying reconnect screen...`);
    loadSplashScreen();
  });

  // Remote content must never gain access to native IPC through navigation.
  const guardNavigation = (event, url) => {
    desktopSecurity.clearFolder();
    if (!desktopSecurity.allowNavigation(url)) event.preventDefault();
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  mainWindow.webContents.on('did-start-navigation', () => desktopSecurity.clearFolder());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });

  // Close to Tray behavior
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      if (Notification.isSupported()) {
        new Notification({
          title: 'CdM OJT Portal Running in Background',
          body: 'The portal is minimized to the system tray. Double-click the tray icon to restore.',
          icon: path.join(__dirname, '..', 'assets', 'icon.png'),
        }).show();
      }
    }
  });

  tray = createTray(mainWindow, targetUrl);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createMainWindow();

  // IPC: Manual retry connection from loader splash
  ipcMain.on('retry-connection', (event) => {
    if (!desktopSecurity.trusted(event, true)) return;
    connectToPortal();
  });

  // IPC: Hide the window while keeping the existing tray available.
  ipcMain.on('minimize-to-tray', (event) => {
    if (!desktopSecurity.trusted(event)) return;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });

  // IPC: Native OS Notification
  ipcMain.on('show-notification', (event, { title, body } = {}) => {
    if (!desktopSecurity.trusted(event)) return;
    if (Notification.isSupported()) {
      new Notification({
        title: title || 'CdM OJT System Alert',
        body: body || '',
        icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      }).show();
    }
  });

  // IPC: Folder Picker for batch exports
  ipcMain.handle('select-folder', async (event) => {
    if (!desktopSecurity.trusted(event)) throw new Error('Untrusted desktop request.');
    desktopSecurity.clearFolder();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Destination Folder for OJT Archival',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return desktopSecurity.selectFolder(event, result.filePaths[0]);
  });

  // IPC: Save File to local disk
  ipcMain.handle('save-file', async (event, input) => {
    try { return desktopSecurity.saveFile(event, input); }
    catch (err) { return { success: false, error: err.code === 'EEXIST' ? 'This filename already exists. Choose a new name.' : err.message }; }
  });

  // IPC: Toggle Floating WFH Mini Widget
  ipcMain.on('toggle-mini-widget', (event, enable) => {
    if (!desktopSecurity.trusted(event) || typeof enable !== 'boolean') return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (enable) {
      mainWindow.unmaximize();
      mainWindow.setMinimumSize(380, 540);
      mainWindow.setAlwaysOnTop(true, 'floating');
      mainWindow.setSize(380, 540);
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimumSize(980, 640);
      mainWindow.setSize(1280, 840);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  clearTimeout(connectionRetryTimer);
  if (webServerProcess) {
    try {
      webServerProcess.kill();
    } catch {}
  }
});
