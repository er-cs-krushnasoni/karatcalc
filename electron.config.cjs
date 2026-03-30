const { app, BrowserWindow, ipcMain, protocol, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let stockFrontendProcess;
let karatCalcViteProcess;
let serversStarted = false;
let serversStarting = false;

// ── MUST be called before app is ready ────────────────────────────────────
protocol.registerSchemesAsPrivileged([{
  scheme: 'calculator-secure',
  privileges: { secure: true, standard: true, supportFetchAPI: true }
}]);

// ── Spawn a server ────────────────────────────────────────────────────────
function spawnServer(label, cwd, args) {
  const proc = spawn('npm', args, {
    cwd, shell: true, stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'development' }
  });
  proc.stdout?.on('data', d => process.stdout.write(`[${label}] ${d}`));
  proc.stderr?.on('data', d => process.stderr.write(`[${label}] ${d}`));
  proc.on('error', err => console.error(`[${label}] error:`, err.message));
  return proc;
}

// ── Wait for server ───────────────────────────────────────────────────────
function waitForServer(url, retries = 40, delay = 1000) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(url, () => resolve());
      req.on('error', () => {
        if (attempts >= retries) reject(new Error(`${url} not ready`));
        else setTimeout(check, delay);
      });
      req.end();
    };
    check();
  });
}

// ── Start Stock + KaratCalc Vite servers on demand ────────────────────────
async function startStockServers() {
  if (serversStarted) return true;
  if (serversStarting) {
    // Wait for ongoing startup
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (serversStarted) { clearInterval(check); resolve(true); }
        if (!serversStarting) { clearInterval(check); resolve(false); }
      }, 500);
    });
  }
  serversStarting = true;

  const stockRoot = path.join(__dirname, '..', 'jewellery-stock-management-app');

  backendProcess       = spawnServer('Backend',   path.join(stockRoot, 'backend'),  ['run', 'dev']);
  stockFrontendProcess = spawnServer('StockFront', path.join(stockRoot, 'frontend'), ['run', 'dev']);
  karatCalcViteProcess = spawnServer('KaratCalc', __dirname,                         ['run', 'dev']);

  try {
    await Promise.all([
      waitForServer('http://localhost:5000', 40, 1000),
      waitForServer('http://localhost:5173', 40, 1000),
      waitForServer('http://localhost:8080', 40, 1000),
    ]);
    serversStarted = true;
    serversStarting = false;
    console.log('✅ All servers ready');
    return true;
  } catch (err) {
    serversStarting = false;
    console.error('❌ Servers failed:', err.message);
    return false;
  }
}

function enableAdvancedSecurity() {
  if (process.env.NODE_ENV === 'production') {
    app.on('web-contents-created', (event, contents) => {
      contents.on('devtools-opened', () => contents.closeDevTools());
    });
  }
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(['notifications', 'media'].includes(permission));
  });
}

function createMainWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, 'assets', 'icon.ico')
    : path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    icon: iconPath, title: 'KaratCalc',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: false
    },
    titleBarStyle: 'default', show: false
  });

  if (process.env.NODE_ENV === 'development') {
    // Dev: all servers started manually
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load built static files (offline capable)
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    console.log('📦 Loading:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = ['http://localhost:8080', 'http://localhost:5173',
                     'http://localhost:5000', 'file://'];
    if (!allowed.some(a => url.startsWith(a))) {
      console.warn('🚫 Blocked:', url);
      event.preventDefault();
    }
  });

  // ── Only modify headers for local requests ────────────────────────────
  // Do NOT touch external CDN responses (Google Fonts etc.)
  // — adding * to a response that already has * causes "*, *" CORS error
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || '';
    const isLocal = url.includes('localhost') || url.startsWith('file://');
    const headers = { ...details.responseHeaders };

    if (isLocal) {
      headers['Content-Security-Policy'] = ["default-src * 'unsafe-inline' 'unsafe-eval' data: blob:"];
      headers['X-Frame-Options'] = ['ALLOWALL'];
      headers['Access-Control-Allow-Origin'] = ['*'];
    }

    callback({ responseHeaders: headers });
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // ── IPC: check if a server is reachable (Node.js http, reliable) ─────
  ipcMain.handle('check-server', (event, url) => {
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.get(url, () => { resolve(true); });
      req.on('error', () => { resolve(false); });
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
      req.end();
    });
  });

  // ── IPC: start servers on demand (called when 0+0= triggered) ────────
  ipcMain.handle('start-stock-servers', async () => {
    const ok = await startStockServers();
    return { success: ok };
  });

  ipcMain.handle('servers-ready', () => serversStarted);

  ipcMain.handle('encrypt-data', (event, data) => {
    const crypto = require('crypto');
    const key = Buffer.from('secure-key-2024-calculator-pro!!').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + enc.toString('hex');
  });

  ipcMain.handle('decrypt-data', (event, encryptedData) => {
    const crypto = require('crypto');
    const [ivHex, encHex] = encryptedData.split(':');
    const key = Buffer.from('secure-key-2024-calculator-pro!!').slice(0, 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  });
}

function killAll() {
  [backendProcess, stockFrontendProcess, karatCalcViteProcess].forEach(proc => {
    if (!proc) return;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid, '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch (e) {}
  });
}

app.whenReady().then(() => {
  enableAdvancedSecurity();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => { killAll(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => killAll());

if (process.env.NODE_ENV === 'production') {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on('update-available', () => mainWindow.webContents.send('update-available'));
    autoUpdater.on('update-downloaded', () => mainWindow.webContents.send('update-downloaded'));
    ipcMain.handle('restart-app', () => autoUpdater.quitAndInstall());
  } catch (e) { console.log('Auto-updater:', e.message); }
}
