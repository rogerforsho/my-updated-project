const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;

function createTray(mainWindow, targetUrl) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Colegio de Montalban OJT Practicum Portal');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Colegio de Montalban OJT Portal',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Reload Portal (Ctrl+R / F5)',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.reloadIgnoringCache();
        }
      },
    },
    {
      label: 'Pending Queue',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        try {
          const origin = new URL(targetUrl || 'http://localhost:3000').origin;
          mainWindow.loadURL(`${origin}/coordinator/approvals`);
        } catch {
          mainWindow.loadURL('http://localhost:3000/coordinator/approvals');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Application',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });

  return tray;
}

module.exports = { createTray };
