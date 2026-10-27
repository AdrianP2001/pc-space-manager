const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const system = require('./core/system');
const cleaner = require('./core/cleaner');
const scanner = require('./core/scanner');
const duplicates = require('./core/duplicates');
const emptyFolders = require('./core/emptyFolders');
const android = require('./core/android');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, relativePath);

  // Seguridad contra Directory Traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Manejo de CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // Rutas de API REST
  try {
    if (pathname === '/api/system/drives' && method === 'GET') {
      const drives = await system.getDrives();
      const sysInfo = system.getSystemInfo();
      return sendJson(res, 200, { success: true, drives, system: sysInfo });
    }

    if (pathname === '/api/system/quick-paths' && method === 'GET') {
      const home = os.homedir();
      const quickPaths = [
        { label: 'Unidad C: (Sistema)', path: 'C:\\' },
        { label: 'Unidad D: (Datos)', path: 'D:\\' },
        { label: 'Carpeta de Usuario', path: home },
        { label: 'Descargas', path: path.join(home, 'Downloads') },
        { label: 'Documentos', path: path.join(home, 'Documents') },
        { label: 'Escritorio', path: path.join(home, 'Desktop') },
        { label: 'Imágenes', path: path.join(home, 'Pictures') },
        { label: 'Videos', path: path.join(home, 'Videos') },
        { label: 'Archivos Temporales', path: os.tmpdir() }
      ].filter(p => fs.existsSync(p.path));

      return sendJson(res, 200, { success: true, quickPaths });
    }
    if (pathname === '/api/system/cloud-paths' && method === 'GET') {
      const home = os.homedir();
      const detected = [];
      const oneDrive = path.join(home, 'OneDrive');
      if (fs.existsSync(oneDrive)) {
        detected.push({ id: 'onedrive', name: 'OneDrive', path: oneDrive, badge: '☁️ OneDrive', color: '#0078d4' });
      }
      const gDrive = fs.existsSync('G:\\Mi unidad') ? 'G:\\Mi unidad' : (fs.existsSync('G:\\') ? 'G:\\' : null);
      if (gDrive) {
        detected.push({ id: 'gdrive', name: 'Google Drive / Fotos', path: gDrive, badge: '☁️ Google Drive', color: '#34a853' });
      }
      const megaCandidates = [path.join(home, 'MEGAsync'), 'D:\\MEGAsync', path.join(home, 'MEGA')];
      const megaFound = megaCandidates.find(p => fs.existsSync(p));
      if (megaFound) {
        detected.push({ id: 'mega', name: 'MEGA', path: megaFound, badge: '☁️ MEGA', color: '#d9272e' });
      }
      const picCandidates = [path.join(home, 'OneDrive', 'Imágenes'), path.join(home, 'Pictures')];
      const picFound = picCandidates.find(p => fs.existsSync(p));
      if (picFound) {
        detected.push({ id: 'pictures', name: 'Imágenes / Fotos', path: picFound, badge: '📸 Fotos', color: '#8b5cf6' });
      }
      const downloads = path.join(home, 'Downloads');
      if (fs.existsSync(downloads)) {
        detected.push({ id: 'downloads', name: 'Descargas', path: downloads, badge: '📥 Descargas', color: '#06b6d4' });
      }
      return sendJson(res, 200, { success: true, cloudPaths: detected });
    }

    // Endpoint de streaming seguro para previsualizar fotos y comparar visualmente
    if (pathname === '/api/media/preview' && method === 'GET') {
      const filePath = parsedUrl.query.path;
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Archivo no encontrado');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm'
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (pathname === '/api/system/reveal' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.path) return sendJson(res, 400, { success: false, error: 'Ruta no especificada' });
      const result = await system.revealInExplorer(body.path);
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/system/recycle-bin' && method === 'GET') {
      const info = await system.getRecycleBinInfo();
      return sendJson(res, 200, { success: true, ...info });
    }

    if (pathname === '/api/system/empty-recycle-bin' && method === 'POST') {
      const result = await system.emptyRecycleBin();
      return sendJson(res, 200, result);
    }

    // Limpiador Inteligente
    if (pathname === '/api/cleaner/scan' && method === 'GET') {
      const scanData = await cleaner.scanAllJunkCategories();
      return sendJson(res, 200, { success: true, ...scanData });
    }

    if (pathname === '/api/cleaner/clean' && method === 'POST') {
      const body = await parseJsonBody(req);
      const selected = body.categories || [];
      const dryRun = Boolean(body.dryRun);
      const cleanData = await cleaner.cleanSelectedCategories(selected, dryRun);
      return sendJson(res, 200, { success: true, ...cleanData });
    }

    // Analizador de Espacio en Disco
    if (pathname === '/api/analyzer/scan' && method === 'POST') {
      const body = await parseJsonBody(req);
      const targetPath = body.path || os.homedir();
      const maxDepth = Number(body.maxDepth) || 5;
      const result = scanner.analyzeDirectory(targetPath, { maxDepth });
      return sendJson(res, 200, { success: true, ...result });
    }

    // Buscador de Archivos Duplicados
    if (pathname === '/api/duplicates/scan' && method === 'POST') {
      const body = await parseJsonBody(req);
      const targetPath = body.path || path.join(os.homedir(), 'Downloads');
      const minSize = Number(body.minSizeBytes) || 10240; // 10 KB mínimo por defecto
      const mode = body.mode || 'exact';
      const result = await duplicates.scanDuplicates(targetPath, { minSizeBytes: minSize, mode });
      return sendJson(res, 200, { success: true, ...result });
    }

    if (pathname === '/api/duplicates/clean' && method === 'POST') {
      const body = await parseJsonBody(req);
      const files = body.files || [];
      const dryRun = Boolean(body.dryRun);
      const result = duplicates.deleteDuplicateFiles(files, dryRun);
      return sendJson(res, 200, { success: true, ...result });
    }

    // Carpetas Vacías
    if (pathname === '/api/empty-folders/scan' && method === 'POST') {
      const body = await parseJsonBody(req);
      const targetPath = body.path || os.homedir();
      const result = emptyFolders.scanEmptyFolders(targetPath);
      return sendJson(res, 200, { success: true, ...result });
    }

    if (pathname === '/api/empty-folders/clean' && method === 'POST') {
      const body = await parseJsonBody(req);
      const folders = body.folders || [];
      const dryRun = Boolean(body.dryRun);
      const result = emptyFolders.cleanEmptyFolders(folders, dryRun);
      return sendJson(res, 200, { success: true, ...result });
    }


    // Módulo Móvil (Android / Samsung vía ADB)
    if (pathname === '/api/mobile/status' && method === 'GET') {
      const status = await android.getDeviceStatus();
      return sendJson(res, 200, { success: true, ...status });
    }

    if (pathname === '/api/mobile/scan' && method === 'POST') {
      const body = await parseJsonBody(req);
      const scanData = await android.scanMobileStorage(body.serial);
      return sendJson(res, 200, { success: true, ...scanData });
    }

    if (pathname === '/api/mobile/clean' && method === 'POST') {
      const body = await parseJsonBody(req);
      const cleanData = await android.cleanMobileCategory(body.serial, body.categories || [], Boolean(body.dryRun));
      return sendJson(res, 200, { success: true, ...cleanData });
    }

    if (pathname === '/api/mobile/backup' && method === 'POST') {
      const body = await parseJsonBody(req);
      const backupDir = body.localDir || 'D:\\Backup_Samsung';
      const result = await android.backupAndClean(body.serial, body.remotePath, backupDir, Boolean(body.dryRun));
      return sendJson(res, 200, result);
    }

    // Archivos estáticos del frontend
    serveStatic(req, res, pathname);

  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 PC Space Manager iniciado en: http://localhost:${PORT}`);
  console.log(`Inspirado en la arquitectura de Glary Utilities`);
  console.log(`====================================================`);
});
