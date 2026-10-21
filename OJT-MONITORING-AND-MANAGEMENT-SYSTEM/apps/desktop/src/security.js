const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function createDesktopSecurity(getWindow, targetUrl, loaderPath, disk = fs) {
  const target = new URL(targetUrl);
  if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Invalid portal URL');
  const loaderUrl = pathToFileURL(loaderPath).href;
  let selectedFolder = null;
  function trusted(event, allowLoader = false) {
    const win = getWindow();
    if (!win || !event || event.sender !== win.webContents || !event.senderFrame ||
        event.senderFrame !== win.webContents.mainFrame) return false;
    try {
      const url = new URL(event.senderFrame.url);
      return url.origin === target.origin && ['http:', 'https:'].includes(url.protocol) ||
        allowLoader && url.href.split('?')[0] === loaderUrl;
    } catch { return false; }
  }
  function assertTrusted(event) {
    if (!trusted(event)) throw new Error('Untrusted desktop request.');
  }
  return {
    trusted,
    allowNavigation(url) {
      try { const parsed = new URL(url); return parsed.origin === target.origin && ['https:', 'http:'].includes(parsed.protocol); }
      catch { return false; }
    },
    clearFolder() { selectedFolder = null; },
    selectFolder(event, folder) {
      assertTrusted(event);
      selectedFolder = folder ? disk.realpathSync(folder) : null;
      return selectedFolder;
    },
    saveFile(event, input) {
      assertTrusted(event);
      const { folderPath, fileName, fileData } = input || {};
      if (!selectedFolder || folderPath !== selectedFolder || typeof fileName !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(fileName) || /[. ]$/.test(fileName) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName) ||
          !/\.(json|csv|pdf|xlsx|docx|jpg|jpeg|png)$/i.test(fileName) ||
          typeof fileData !== 'string' || fileData.length > 14 * 1024 * 1024 ||
          fileData.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(fileData)) {
        throw new Error('Choose a destination folder and a valid export file (maximum 10 MB).');
      }
      if (disk.realpathSync(selectedFolder) !== selectedFolder) throw new Error('Destination changed. Select it again.');
      const fullPath = path.resolve(selectedFolder, fileName);
      if (path.dirname(fullPath) !== selectedFolder) throw new Error('Invalid export path.');
      const buffer = Buffer.from(fileData, 'base64');
      if (buffer.length > 10 * 1024 * 1024) throw new Error('Export exceeds 10 MB.');
      disk.writeFileSync(fullPath, buffer, { flag: 'wx' });
      return { success: true, path: fullPath };
    },
  };
}
module.exports = { createDesktopSecurity };
