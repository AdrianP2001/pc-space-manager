const fs = require('fs');
const path = require('path');
const os = require('os');
const { emptyRecycleBin, getRecycleBinInfo } = require('./system');

// Glary Utilities junk file patterns
const JUNK_EXTENSIONS = new Set([
  '.tmp', '.temp', '.chk', '.old', '.bak', '.gid', '.fts',
  '.$$$', '.---', '.~mp', '._mp', '.dmp', '.prv', '.log'
]);

// Exclusiones críticas de seguridad del sistema (derivadas de empty.dat de Glary)
const PROTECTED_PATHS = [
  'system volume information',
  '$recycle.bin',
  'windows\\system32',
  'windows\\syswow64',
  'windows\\winsxs',
  'boot',
  'recovery'
];

function isProtectedPath(targetPath) {
  const norm = targetPath.toLowerCase().replace(/\\/g, '/');
  return PROTECTED_PATHS.some(p => norm.includes(p.replace(/\\/g, '/')));
}

/**
 * Escanea recursivamente un directorio acumulando archivos basura candidatos
 */
function scanDirectoryForJunk(dirPath, options = {}) {
  const results = [];
  const { maxDepth = 4, filterExtensions = null, matchAllFiles = false, maxAgeHours = 0 } = options;

  if (!fs.existsSync(dirPath) || isProtectedPath(dirPath)) {
    return results;
  }

  const now = Date.now();

  function walk(currentDir, currentDepth) {
    if (currentDepth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      // Ignorar directorios protegidos o sin permiso de lectura
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        let isMatch = false;

        if (matchAllFiles) {
          isMatch = true;
        } else if (filterExtensions) {
          isMatch = filterExtensions.has(ext);
        } else {
          isMatch = JUNK_EXTENSIONS.has(ext) || entry.name.startsWith('~') || entry.name.startsWith('thumbcache_');
        }

        if (isMatch) {
          try {
            const stat = fs.statSync(fullPath);
            if (maxAgeHours > 0) {
              const ageHours = (now - stat.mtimeMs) / (1000 * 60 * 60);
              if (ageHours < maxAgeHours) continue;
            }
            results.push({
              path: fullPath,
              name: entry.name,
              size: stat.size,
              mtime: stat.mtime
            });
          } catch (e) {
            // Ignorar archivos en uso
          }
        }
      }
    }
  }

  walk(dirPath, 0);
  return results;
}

/**
 * Define y escanea las categorías de limpieza
 */
async function scanAllJunkCategories() {
  const homeDir = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';

  const categories = [
    {
      id: 'userTemp',
      name: 'Archivos Temporales de Usuario',
      description: 'Archivos .tmp, .temp y residuos de instaladores en %TEMP%',
      icon: 'file-text',
      items: scanDirectoryForJunk(os.tmpdir(), { maxDepth: 4 })
    },
    {
      id: 'systemTemp',
      name: 'Archivos Temporales de Windows',
      description: 'Caché e instaladores del sistema en C:\\Windows\\Temp',
      icon: 'hard-drive',
      items: scanDirectoryForJunk(path.join(systemRoot, 'Temp'), { maxDepth: 3 })
    },
    {
      id: 'crashDumps',
      name: 'Volcados de Memoria (Crash Dumps)',
      description: 'Archivos .dmp de fallos de aplicaciones y BSOD en Minidump',
      icon: 'alert-triangle',
      items: [
        ...scanDirectoryForJunk(path.join(systemRoot, 'Minidump'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'CrashDumps'), { maxDepth: 2, matchAllFiles: true })
      ]
    },
    {
      id: 'werReports',
      name: 'Informes de Errores de Windows (WER)',
      description: 'Archivos de telemetría y diagnósticos de errores acumulados',
      icon: 'activity',
      items: [
        ...scanDirectoryForJunk(path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportQueue'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), { maxDepth: 3, matchAllFiles: true })
      ]
    },
    {
      id: 'thumbnailCache',
      name: 'Caché de Miniaturas de Windows',
      description: 'Bases de datos thumbcache_*.db que se regeneran automáticamente',
      icon: 'image',
      items: scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Windows', 'Explorer'), {
        maxDepth: 1,
        filterExtensions: new Set(['.db'])
      }).filter(item => item.name.startsWith('thumbcache_') || item.name.startsWith('iconcache_'))
    },
    {
      id: 'browserCache',
      name: 'Caché de Navegadores (Chrome / Edge)',
      description: 'Caché web, Service Workers y GPUCache',
      icon: 'globe',
      items: [
        ...scanDirectoryForJunk(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'GPUCache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Service Worker', 'CacheStorage'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'GPUCache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Service Worker', 'CacheStorage'), { maxDepth: 3, matchAllFiles: true })
      ]
    },
    {
      id: 'devCache',
      name: 'Caché de Desarrollo (Node, VSCode, Pip)',
      description: 'Cachés compilados temporales generados por herramientas de desarrollo',
      icon: 'code',
      items: [
        ...scanDirectoryForJunk(path.join(os.tmpdir(), 'node-compile-cache'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(os.tmpdir(), 'vscode-typescript'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(homeDir, '.npm', '_cacache'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'pip', 'cache'), { maxDepth: 3, matchAllFiles: true })
      ]
    }
  ];

  // Papelera de reciclaje
  const recycleBin = await getRecycleBinInfo();
  categories.push({
    id: 'recycleBin',
    name: 'Papelera de Reciclaje',
    description: 'Archivos eliminados que esperan vaciado definitivo',
    icon: 'trash-2',
    isRecycleBin: true,
    count: recycleBin.count,
    totalBytes: recycleBin.bytes,
    items: []
  });

  // Resumen de cada categoría
  let grandTotalBytes = 0;
  let grandTotalFiles = 0;

  const summaryCategories = categories.map(cat => {
    let bytes = 0;
    let count = 0;
    if (cat.isRecycleBin) {
      bytes = cat.totalBytes;
      count = cat.count;
    } else {
      bytes = cat.items.reduce((acc, it) => acc + it.size, 0);
      count = cat.items.length;
    }
    grandTotalBytes += bytes;
    grandTotalFiles += count;

    return {
      id: cat.id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      isRecycleBin: Boolean(cat.isRecycleBin),
      count,
      totalBytes: bytes,
      sampleItems: cat.items.slice(0, 15)
    };
  });

  return {
    categories: summaryCategories,
    totalBytes: grandTotalBytes,
    totalFiles: grandTotalFiles,
    timestamp: new Date().toISOString()
  };
}

/**
 * Ejecuta la limpieza de las categorías seleccionadas
 * Admite dryRun = true para simular sin borrar nada
 */
async function cleanSelectedCategories(selectedCategoryIds = [], dryRun = false) {
  const scan = await scanAllJunkCategories();
  const report = {
    dryRun,
    freedBytes: 0,
    freedFiles: 0,
    skippedFiles: 0,
    errors: [],
    detailsByCategory: {}
  };

  const idSet = new Set(selectedCategoryIds);

  for (const cat of scan.categories) {
    if (!idSet.has(cat.id)) continue;

    report.detailsByCategory[cat.id] = {
      name: cat.name,
      count: cat.count,
      bytes: cat.totalBytes,
      cleanedFiles: 0,
      cleanedBytes: 0,
      skipped: 0
    };

    if (cat.isRecycleBin) {
      if (!dryRun) {
        const ok = await emptyRecycleBin();
        if (ok.success) {
          report.freedBytes += cat.totalBytes;
          report.freedFiles += cat.count;
          report.detailsByCategory[cat.id].cleanedFiles = cat.count;
          report.detailsByCategory[cat.id].cleanedBytes = cat.totalBytes;
        } else {
          report.errors.push('No se pudo vaciar la papelera de reciclaje');
        }
      } else {
        report.freedBytes += cat.totalBytes;
        report.freedFiles += cat.count;
      }
      continue;
    }

    // Para archivos normales, re-escanear los items de esta categoría
    const homeDir = os.homedir();
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';

    let targets = [];
    if (cat.id === 'userTemp') targets = scanDirectoryForJunk(os.tmpdir(), { maxDepth: 4 });
    else if (cat.id === 'systemTemp') targets = scanDirectoryForJunk(path.join(systemRoot, 'Temp'), { maxDepth: 3 });
    else if (cat.id === 'crashDumps') {
      targets = [
        ...scanDirectoryForJunk(path.join(systemRoot, 'Minidump'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'CrashDumps'), { maxDepth: 2, matchAllFiles: true })
      ];
    } else if (cat.id === 'werReports') {
      targets = [
        ...scanDirectoryForJunk(path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportQueue'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'), { maxDepth: 3, matchAllFiles: true })
      ];
    } else if (cat.id === 'thumbnailCache') {
      targets = scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Windows', 'Explorer'), {
        maxDepth: 1,
        filterExtensions: new Set(['.db'])
      }).filter(item => item.name.startsWith('thumbcache_') || item.name.startsWith('iconcache_'));
    } else if (cat.id === 'browserCache') {
      targets = [
        ...scanDirectoryForJunk(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'GPUCache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Service Worker', 'CacheStorage'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'GPUCache'), { maxDepth: 2, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Service Worker', 'CacheStorage'), { maxDepth: 3, matchAllFiles: true })
      ];
    } else if (cat.id === 'devCache') {
      targets = [
        ...scanDirectoryForJunk(path.join(os.tmpdir(), 'node-compile-cache'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(os.tmpdir(), 'vscode-typescript'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(homeDir, '.npm', '_cacache'), { maxDepth: 3, matchAllFiles: true }),
        ...scanDirectoryForJunk(path.join(localAppData, 'pip', 'cache'), { maxDepth: 3, matchAllFiles: true })
      ];
    }

    for (const item of targets) {
      if (dryRun) {
        report.freedBytes += item.size;
        report.freedFiles += 1;
        report.detailsByCategory[cat.id].cleanedFiles += 1;
        report.detailsByCategory[cat.id].cleanedBytes += item.size;
        continue;
      }

      try {
        fs.unlinkSync(item.path);
        report.freedBytes += item.size;
        report.freedFiles += 1;
        report.detailsByCategory[cat.id].cleanedFiles += 1;
        report.detailsByCategory[cat.id].cleanedBytes += item.size;
      } catch (err) {
        // El archivo está bloqueado por el sistema o una aplicación abierta
        report.skippedFiles += 1;
        report.detailsByCategory[cat.id].skipped += 1;
      }
    }
  }

  report.timestamp = new Date().toISOString();
  return report;
}

module.exports = {
  scanAllJunkCategories,
  cleanSelectedCategories
};
