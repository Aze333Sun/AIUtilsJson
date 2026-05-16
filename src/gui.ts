import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function loadWindowState(): WindowState {
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { width: 1200, height: 800, isMaximized: false };
  }
}

function saveWindowState(state: WindowState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
  } catch { /* ignore */ }
}

function buildMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开 JSON...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenFile(),
        },
        {
          label: '打开 Excel...',
          click: () => handleOpenExcel(),
        },
        { type: 'separator' },
        {
          label: '保存 Markdown...',
          accelerator: 'CmdOrCtrl+S',
          click: () => handleSaveMarkdown(),
        },
        {
          label: '导出 Markdown 为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => handleSaveMarkdown(true),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBoxSync(mainWindow!, {
              type: 'info',
              title: '关于 Json处理器',
              message: 'Json处理器 v1.0.0',
              detail: 'JSON 转 Markdown 工具\n支持多种 AI 对话格式、Excel 转 JSON、对话记录提取',
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

async function handleOpenFile(): Promise<void> {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开 JSON 文件',
    filters: [
      { name: 'JSON 文件', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return;

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    mainWindow.webContents.send('file-opened', {
      content,
      fileName: path.basename(result.filePaths[0]),
    });
  } catch (err: any) {
    dialog.showErrorBox('打开文件失败', err.message);
  }
}

async function handleOpenExcel(): Promise<void> {
  if (!mainWindow) return;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Excel 文件',
    filters: [
      { name: 'Excel 文件', extensions: ['xlsx', 'xls', 'csv'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return;

  try {
    const buffer = fs.readFileSync(result.filePaths[0]);
    mainWindow.webContents.send('excel-opened', {
      buffer: buffer.toString('base64'),
      fileName: path.basename(result.filePaths[0]),
    });
  } catch (err: any) {
    dialog.showErrorBox('打开文件失败', err.message);
  }
}

async function handleSaveMarkdown(saveAs = false): Promise<void> {
  if (!mainWindow) return;
  mainWindow.webContents.send('request-markdown-content', { saveAs });
}

function setupIpc(): void {
  ipcMain.handle('open-file-dialog', async (_event, options: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }) => {
    if (!mainWindow) return { canceled: true, filePaths: [] };
    return dialog.showOpenDialog(mainWindow, {
      title: options.title || '打开文件',
      filters: options.filters || [{ name: '所有文件', extensions: ['*'] }],
      properties: ['openFile'],
    });
  });

  ipcMain.handle('save-file-dialog', async (_event, options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }) => {
    if (!mainWindow) return { canceled: true, filePath: '' };
    return dialog.showSaveDialog(mainWindow, {
      title: options.title || '保存文件',
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: '所有文件', extensions: ['*'] }],
    });
  });

  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, fileName: path.basename(filePath) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('write-file', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('read-file-as-buffer', async (_event, filePath: string) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return { success: true, buffer: buffer.toString('base64'), fileName: path.basename(filePath) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.on('save-markdown-reply', (_event, { content, saveAs }: { content: string; saveAs: boolean }) => {
    if (!mainWindow || !content) return;

    if (saveAs) {
      dialog.showSaveDialog(mainWindow, {
        title: '导出 Markdown',
        defaultPath: 'output.md',
        filters: [
          { name: 'Markdown 文件', extensions: ['md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled || !result.filePath) return;
        try {
          fs.writeFileSync(result.filePath, content, 'utf-8');
          mainWindow?.webContents.send('save-complete', { success: true, filePath: result.filePath });
        } catch (err: any) {
          mainWindow?.webContents.send('save-complete', { success: false, error: err.message });
        }
      });
    } else {
      const defaultPath = path.join(app.getPath('documents'), 'output.md');
      try {
        fs.writeFileSync(defaultPath, content, 'utf-8');
        mainWindow.webContents.send('save-complete', { success: true, filePath: defaultPath });
      } catch (err: any) {
        mainWindow.webContents.send('save-complete', { success: false, error: err.message });
      }
    }
  });
}

function createWindow(): void {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    title: 'Json处理器',
    icon: path.join(__dirname, '../icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, '../gui.html'));

  mainWindow.on('close', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized(),
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

export function launchGui(): void {
  Menu.setApplicationMenu(buildMenu());
  setupIpc();

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
