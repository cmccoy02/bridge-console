import { app, BrowserWindow, shell, ipcMain, dialog, Menu } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawn, fork } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom protocol for OAuth callback
const PROTOCOL = 'bridge';
const PROTOCOL_PREFIX = `${PROTOCOL}://`;

// Register as default protocol handler
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName());
}

let mainWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Get the correct paths for packaged app
function getAppPaths() {
  if (app.isPackaged) {
    return {
      userData: app.getPath('userData'),
      resources: process.resourcesPath,
      server: path.join(process.resourcesPath, 'server'),
    };
  }
  return {
    userData: path.join(__dirname, '..'),
    resources: path.join(__dirname, '..'),
    server: path.join(__dirname, '..', 'server'),
  };
}

// Set up environment for the server
function setupServerEnvironment() {
  const paths = getAppPaths();

  // Database path - use userData for persistence
  const dbPath = path.join(paths.userData, 'bridge.sqlite');
  process.env.DATABASE_PATH = dbPath;
  process.env.BRIDGE_USER_DATA = paths.userData;

  // Temp directories for scans
  const tempScansDir = path.join(paths.userData, 'temp_scans');
  const tempUpdatesDir = path.join(paths.userData, 'temp_updates');

  if (!fs.existsSync(tempScansDir)) {
    fs.mkdirSync(tempScansDir, { recursive: true });
  }
  if (!fs.existsSync(tempUpdatesDir)) {
    fs.mkdirSync(tempUpdatesDir, { recursive: true });
  }

  process.env.TEMP_SCANS_DIR = tempScansDir;
  process.env.TEMP_UPDATES_DIR = tempUpdatesDir;

  return paths;
}

// Check if server is already running (for dev mode)
async function isServerRunning() {
  try {
    const response = await fetch('http://localhost:3001/api/health');
    return response.ok;
  } catch (err) {
    return false;
  }
}

// Start the Express server
async function startServer() {
  // In development, check if server is already running externally
  if (isDev) {
    const running = await isServerRunning();
    if (running) {
      console.log('[Bridge] Server already running (dev mode), skipping startup');
      return;
    }
  }

  const paths = getAppPaths();
  const serverPath = path.join(paths.server, 'index.js');

  console.log('[Bridge] Starting server from:', serverPath);

  return new Promise((resolve, reject) => {
    // Use fork to run the server as a child process
    serverProcess = fork(serverPath, [], {
      cwd: paths.server,
      env: {
        ...process.env,
        PORT: '3001',
        NODE_ENV: isDev ? 'development' : 'production',
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    serverProcess.stdout.on('data', (data) => {
      console.log('[Server]', data.toString().trim());
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString().trim());
    });

    serverProcess.on('error', (err) => {
      console.error('[Bridge] Server failed to start:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.log('[Bridge] Server exited with code:', code);
      serverProcess = null;
    });

    // Wait for server to be ready
    const checkServer = async (attempts = 0) => {
      if (attempts > 30) {
        reject(new Error('Server failed to start within 30 seconds'));
        return;
      }

      try {
        const response = await fetch('http://localhost:3001/api/health');
        if (response.ok) {
          console.log('[Bridge] Server is ready');
          resolve();
          return;
        }
      } catch (err) {
        // Server not ready yet
      }

      setTimeout(() => checkServer(attempts + 1), 1000);
    };

    // Give the server a moment to start before checking
    setTimeout(() => checkServer(), 500);
  });
}

// Stop the server
function stopServer() {
  if (serverProcess) {
    console.log('[Bridge] Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

// Create the main browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#050505',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Set icon if it exists (optional for development)
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
  if (fs.existsSync(iconPath)) {
    mainWindow.setIcon(iconPath);
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Create application menu
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('open-settings');
            }
          }
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Scan',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('new-scan');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Add Repository',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('add-repository');
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [
          { type: 'separator' },
          { role: 'toggleDevTools' }
        ] : [])
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/bridge-console/bridge');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/bridge-console/bridge/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'Open Data Folder',
          click: () => {
            const paths = getAppPaths();
            shell.openPath(paths.userData);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle OAuth callback URL
function handleOAuthCallback(url) {
  if (!url || !url.startsWith(PROTOCOL_PREFIX)) return;

  console.log('[Bridge] Received OAuth callback:', url);

  // Parse the URL to extract the auth code
  try {
    // URL format: bridge://auth/callback?code=xxx
    const urlObj = new URL(url);
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');
    const errorDescription = urlObj.searchParams.get('error_description');

    if (mainWindow) {
      if (error) {
        console.error('[Bridge] OAuth error:', error, errorDescription);
        mainWindow.webContents.send('oauth-error', { error, description: errorDescription });
      } else if (code) {
        console.log('[Bridge] Sending OAuth code to renderer');
        mainWindow.webContents.send('oauth-callback', { code });
      }

      // Bring the window to front
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (err) {
    console.error('[Bridge] Failed to parse OAuth callback URL:', err);
  }
}

// IPC Handlers
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-paths', () => getAppPaths());

// Get the OAuth redirect URI for Electron
// Uses localhost callback that then redirects to bridge:// protocol
ipcMain.handle('get-oauth-redirect-uri', () => {
  return 'http://localhost:3001/api/auth/electron-callback';
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('show-item-in-folder', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('show-error-dialog', (event, title, message) => {
  dialog.showErrorBox(title, message);
});

// Handle protocol URL on macOS (when app is already running)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOAuthCallback(url);
});

// Handle protocol URL on Windows/Linux (second instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle the protocol URL on Windows
    const url = commandLine.find(arg => arg.startsWith(PROTOCOL_PREFIX));
    if (url) {
      handleOAuthCallback(url);
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('[Bridge] App starting...');
  console.log('[Bridge] Is Development:', isDev);
  console.log('[Bridge] Is Packaged:', app.isPackaged);

  // Check if opened via protocol URL (Windows/Linux on first launch)
  const protocolUrl = process.argv.find(arg => arg.startsWith(PROTOCOL_PREFIX));
  if (protocolUrl) {
    // Will handle after window is created
    setTimeout(() => handleOAuthCallback(protocolUrl), 1000);
  }

  // Set up environment
  setupServerEnvironment();

  // Create the application menu
  createMenu();

  // Start the server
  try {
    await startServer();
  } catch (err) {
    console.error('[Bridge] Failed to start server:', err);
    dialog.showErrorBox('Server Error', `Failed to start the Bridge server: ${err.message}`);
    app.quit();
    return;
  }

  // Create the main window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Bridge] Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred: ${error.message}`);
});
