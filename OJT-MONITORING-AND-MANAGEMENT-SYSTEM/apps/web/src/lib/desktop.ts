export interface ElectronAPI {
  isDesktop: boolean;
  platform: string;
  showNotification: (title: string, body?: string) => void;
  selectFolder: () => Promise<string | null>;
  saveFileToFolder: (
    folderPath: string,
    fileName: string,
    fileDataBase64: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  minimizeToTray: () => void;
  toggleMiniWidget: (enable: boolean) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.electronAPI?.isDesktop);
}

export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI ?? null;
}

export function sendDesktopNotification(title: string, body?: string) {
  const api = getElectronAPI();
  if (api) {
    api.showNotification(title, body);
  }
}
