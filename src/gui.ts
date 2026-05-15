export async function launchGui(): Promise<void> {
  try {
    const electron: any = await import('electron');
    const path = await import('path');
    const { app, BrowserWindow } = electron;

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
  } catch (error) {
    console.error('Electron 未安装，请先执行: npm install electron -D');
    process.exit(1);
  }
}
