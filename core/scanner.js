const fs = require('fs');
const path = require('path');

// Categorización exacta extraída de Category.ini de Glary Utilities
const CATEGORY_MAP = {
  images: new Set([
    '.ai', '.xbm', '.nrw', '.orf', '.pct', '.pef', '.pic', '.png', '.psd',
    '.raw', '.icns', '.svg', '.tga', '.tif', '.gif', '.hdr', '.ico', '.jpg',
    '.jpeg', '.bmp', '.cr2', '.dng', '.webp', '.heic', '.avif'
  ]),
  videos: new Set([
    '.wmv', '.mov', '.mpg', '.mpeg', '.avi', '.flv', '.qt', '.ts', '.mp4',
    '.3gp', '.m4v', '.mkv', '.webm', '.vob', '.ogv'
  ]),
  audio: new Set([
    '.wav', '.wma', '.ram', '.mid', '.amr', '.m4a', '.mp3', '.flac', '.ogg',
    '.aac', '.aiff', '.alac'
  ]),
  archives: new Set([
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.cab',
    '.dmg', '.tgz'
  ]),
  documents: new Set([
    '.doc', '.docx', '.pdf', '.txt', '.rtf', '.xls', '.xlsx', '.csv',
    '.ppt', '.pptx', '.numbers', '.pages', '.key', '.odt', '.ods', '.odp'
  ]),
  executables: new Set([
    '.exe', '.msi', '.bat', '.cmd', '.ps1', '.dll', '.sys', '.apk', '.appx',
    '.com', '.scr'
  ]),
  code: new Set([
    '.js', '.mjs', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.cs',
    '.html', '.css', '.json', '.xml', '.sql', '.php', '.go', '.rs', '.rb'
  ])
};

const CATEGORY_META = {
  videos: { name: 'Videos', color: '#f43f5e', icon: 'film' },
  images: { name: 'Imágenes', color: '#38bdf8', icon: 'image' },
  archives: { name: 'Comprimidos e ISOs', color: '#f59e0b', icon: 'archive' },
  documents: { name: 'Documentos', color: '#10b981', icon: 'file-text' },
  executables: { name: 'Programas y DLLs', color: '#a855f7', icon: 'box' },
  audio: { name: 'Audio y Música', color: '#ec4899', icon: 'music' },
  code: { name: 'Código y Proyectos', color: '#6366f1', icon: 'code' },
  others: { name: 'Otros Archivos', color: '#64748b', icon: 'file' }
};

function getFileCategory(ext) {
  const cleanExt = ext.toLowerCase();
  for (const [cat, extSet] of Object.entries(CATEGORY_MAP)) {
    if (extSet.has(cleanExt)) return cat;
  }
  return 'others';
}

/**
 * Analiza un directorio o disco completo para determinar distribución de espacio
 */
function analyzeDirectory(targetPath, options = {}) {
  const { maxFiles = 100000, maxDepth = 6 } = options;
  const absPath = path.resolve(targetPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`La ruta no existe: ${absPath}`);
  }

  const categoryTotals = {
    videos: { count: 0, bytes: 0 },
    images: { count: 0, bytes: 0 },
    archives: { count: 0, bytes: 0 },
    documents: { count: 0, bytes: 0 },
    executables: { count: 0, bytes: 0 },
    audio: { count: 0, bytes: 0 },
    code: { count: 0, bytes: 0 },
    others: { count: 0, bytes: 0 }
  };

  const topFiles = [];
  const folderSizes = {};
  let totalBytes = 0;
  let totalFiles = 0;
  let totalFolders = 0;

  function trackTopFile(fileItem) {
    if (topFiles.length < 50) {
      topFiles.push(fileItem);
      topFiles.sort((a, b) => b.size - a.size);
    } else if (fileItem.size > topFiles[topFiles.length - 1].size) {
      topFiles[topFiles.length - 1] = fileItem;
      topFiles.sort((a, b) => b.size - a.size);
    }
  }

  function walk(currentDir, currentDepth) {
    if (totalFiles >= maxFiles || currentDepth > maxDepth) return 0;
    
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return 0;
    }

    let dirSize = 0;
    totalFolders++;

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Excluir enlaces simbólicos y carpetas del sistema
        if (entry.name === '$Recycle.Bin' || entry.name === 'System Volume Information') {
          continue;
        }
        const subSize = walk(fullPath, currentDepth + 1);
        dirSize += subSize;

        // Si es subcarpeta directa de primer nivel, registrar su peso acumulado
        if (currentDepth === 0) {
          folderSizes[entry.name] = subSize;
        }
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const size = stat.size;
          dirSize += size;
          totalBytes += size;
          totalFiles++;

          const ext = path.extname(entry.name).toLowerCase();
          const cat = getFileCategory(ext);

          categoryTotals[cat].count++;
          categoryTotals[cat].bytes += size;

          trackTopFile({
            name: entry.name,
            path: fullPath,
            size,
            ext,
            category: cat,
            mtime: stat.mtime
          });
        } catch (e) {
          // Ignorar archivos inaccesibles
        }
      }
    }

    return dirSize;
  }

  const rootSize = walk(absPath, 0);

  // Formatear desglose de categorías
  const categoriesList = Object.entries(categoryTotals).map(([key, data]) => ({
    id: key,
    name: CATEGORY_META[key].name,
    color: CATEGORY_META[key].color,
    icon: CATEGORY_META[key].icon,
    count: data.count,
    bytes: data.bytes,
    percent: totalBytes > 0 ? Number(((data.bytes / totalBytes) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.bytes - a.bytes);

  // Subcarpetas más pesadas
  const topSubfolders = Object.entries(folderSizes)
    .map(([name, bytes]) => ({
      name,
      path: path.join(absPath, name),
      bytes,
      percent: totalBytes > 0 ? Number(((bytes / totalBytes) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15);

  return {
    path: absPath,
    totalBytes,
    totalFiles,
    totalFolders,
    categories: categoriesList,
    topFiles,
    topSubfolders,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  analyzeDirectory,
  CATEGORY_META
};
