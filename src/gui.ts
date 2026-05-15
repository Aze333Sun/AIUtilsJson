import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export function launchGui(): void {
  function createWindow() {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'JSON 转 Markdown 转换器',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.loadFile(path.join(__dirname, '../gui.html'));
  }

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

if (require.main === module) {
  launchGui();
}
