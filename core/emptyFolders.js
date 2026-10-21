const fs = require('fs');
const path = require('path');

// Exclusiones de seguridad para carpetas vacías derivadas directamente de empty.dat de Glary Utilities
const PROTECTED_FOLDERS = [
  'windows',
  'program files',
  'program files (x86)',
  'system volume information',
  '$recycle.bin',
  'printhood',
  'startup',
  'common files',
  'sendto',
  'resources\\themes',
  'appdata\\local\\packages'
];

function isProtectedFolder(folderPath) {
  const norm = folderPath.toLowerCase().replace(/\\/g, '/');
  return PROTECTED_FOLDERS.some(p => norm.includes(p.replace(/\\/g, '/')));
}

/**
 * Escanea un directorio en busca de carpetas verdaderamente vacías
 */
function scanEmptyFolders(targetPath, maxDepth = 6) {
  const absPath = path.resolve(targetPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`La ruta no existe: ${absPath}`);
  }

  const emptyFolders = [];

  function checkDir(currentDir, currentDepth) {
    if (currentDepth > maxDepth || isProtectedFolder(currentDir)) {
      return false; // No está vacía o está protegida
    }

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return false;
    }

    // Si no contiene ningún elemento
    if (entries.length === 0) {
      if (currentDir !== absPath) {
        emptyFolders.push({
          path: currentDir,
          name: path.basename(currentDir),
          parent: path.dirname(currentDir)
        });
      }
      return true;
    }

    let allSubdirsEmpty = true;
    let hasFiles = false;

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const isSubEmpty = checkDir(fullPath, currentDepth + 1);
        if (!isSubEmpty) {
          allSubdirsEmpty = false;
        }
      } else {
        hasFiles = true;
        allSubdirsEmpty = false;
      }
    }

    // Si solo contenía subcarpetas y todas ellas resultaron vacías
    if (!hasFiles && allSubdirsEmpty && currentDir !== absPath) {
      if (!emptyFolders.some(f => f.path === currentDir)) {
        emptyFolders.push({
          path: currentDir,
          name: path.basename(currentDir),
          parent: path.dirname(currentDir)
        });
      }
      return true;
    }

    return false;
  }

  checkDir(absPath, 0);

  // Ordenar desde las subcarpetas más profundas hacia la raíz
  emptyFolders.sort((a, b) => b.path.length - a.path.length);

  return {
    path: absPath,
    count: emptyFolders.length,
    folders: emptyFolders
  };
}

/**
 * Elimina las carpetas vacías encontradas
 */
function cleanEmptyFolders(folderPaths = [], dryRun = false) {
  const result = {
    dryRun,
    removedCount: 0,
    skippedCount: 0,
    errors: []
  };

  // Ordenar para eliminar de abajo hacia arriba (hojas antes de padres)
  const sorted = [...folderPaths].sort((a, b) => b.length - a.length);

  for (const fPath of sorted) {
    if (isProtectedFolder(fPath)) {
      result.skippedCount++;
      continue;
    }

    try {
      if (!fs.existsSync(fPath)) continue;
      if (!dryRun) {
        fs.rmdirSync(fPath);
      }
      result.removedCount++;
    } catch (err) {
      result.skippedCount++;
      result.errors.push(`No se pudo eliminar ${fPath}: ${err.message}`);
    }
  }

  return result;
}

module.exports = {
  scanEmptyFolders,
  cleanEmptyFolders
};
