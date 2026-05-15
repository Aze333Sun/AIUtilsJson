export async function launchGui(): Promise<void> {
  try {
    const electron: any = await import('electron');
    const path = await import('path');
    const { app, BrowserWindow } = electron;

    function createWindow() {
      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'JSON to Markdown Converter',
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
    console.error('Electron is not installed. Please install it first: npm install electron -D');
    process.exit(1);
  }
}
