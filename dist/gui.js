"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchGui = launchGui;
async function launchGui() {
    try {
        const electron = await Promise.resolve().then(() => __importStar(require('electron')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
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
                if (BrowserWindow.getAllWindows().length === 0)
                    createWindow();
            });
        });
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin')
                app.quit();
        });
    }
    catch (error) {
        console.error('Electron is not installed. Please install it first: npm install electron -D');
        process.exit(1);
    }
}
