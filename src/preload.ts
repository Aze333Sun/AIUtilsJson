import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (options: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }) => ipcRenderer.invoke('open-file-dialog', options),

  saveFileDialog: (options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }) => ipcRenderer.invoke('save-file-dialog', options),

  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readFileAsBuffer: (filePath: string) => ipcRenderer.invoke('read-file-as-buffer', filePath),

  onFileOpened: (callback: (data: { content: string; fileName: string }) => void) => {
    ipcRenderer.on('file-opened', (_event, data) => callback(data));
  },

  onExcelOpened: (callback: (data: { buffer: string; fileName: string }) => void) => {
    ipcRenderer.on('excel-opened', (_event, data) => callback(data));
  },

  onRequestMarkdownContent: (callback: (data: { saveAs: boolean }) => void) => {
    ipcRenderer.on('request-markdown-content', (_event, data) => callback(data));
  },

  sendMarkdownContent: (content: string, saveAs: boolean) => {
    ipcRenderer.send('save-markdown-reply', { content, saveAs });
  },

  onSaveComplete: (callback: (data: { success: boolean; filePath?: string; error?: string }) => void) => {
    ipcRenderer.on('save-complete', (_event, data) => callback(data));
  },
});
