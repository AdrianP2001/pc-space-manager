const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Calcula un hash rápido de los primeros 64 KB de un archivo
 */
function getPartialHash(filePath, bufferSize = 65536) {
  return new Promise((resolve) => {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(bufferSize);
      const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, 0);
      fs.closeSync(fd);
      const hash = crypto.createHash('md5').update(buffer.subarray(0, bytesRead)).digest('hex');
      resolve(hash);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Calcula el hash SHA-256 completo de un archivo mediante streams
 */
function getFullHash(filePath) {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Escanea un directorio en busca de archivos duplicados utilizando un algoritmo multi-fase
 */
async function scanDuplicates(targetPath, options = {}) {
  const { minSizeBytes = 1024, maxFiles = 30000, maxDepth = 5 } = options;
  const absPath = path.resolve(targetPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`La ruta no existe: ${absPath}`);
  }

  // Fase 1: Agrupar por tamaño exacto
  const sizeMap = new Map();
  let totalFilesScanned = 0;

  function walk(currentDir, currentDepth) {
    if (totalFilesScanned >= maxFiles || currentDepth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '$Recycle.Bin' || entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        walk(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          totalFilesScanned++;
          if (stat.size >= minSizeBytes) {
            if (!sizeMap.has(stat.size)) {
              sizeMap.set(stat.size, []);
            }
            sizeMap.get(stat.size).push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              mtime: stat.mtime
            });
          }
        } catch (e) {
          // Archivo inaccesible
        }
      }
    }
  }

  walk(absPath, 0);

  // Filtrar solo tamaños que tengan 2 o más archivos
  const candidateGroups = [];
  for (const [size, files] of sizeMap.entries()) {
    if (files.length > 1) {
      candidateGroups.push(files);
    }
  }

  // Fase 2: Comparación por hash parcial (primeros 64KB)
  const partialGroups = new Map();
  for (const group of candidateGroups) {
    for (const file of group) {
      const pHash = await getPartialHash(file.path);
      if (!pHash) continue;
      const key = `${file.size}_${pHash}`;
      if (!partialGroups.has(key)) {
        partialGroups.set(key, []);
      }
      partialGroups.get(key).push(file);
    }
  }

  // Fase 3: Comparación final por hash SHA-256 completo
  const finalDuplicateGroups = [];
  let totalWastedBytes = 0;
  let totalDuplicateFiles = 0;

  for (const files of partialGroups.values()) {
    if (files.length <= 1) continue;

    const fullGroups = new Map();
    for (const file of files) {
      const fullHash = await getFullHash(file.path);
      if (!fullHash) continue;
      if (!fullGroups.has(fullHash)) {
        fullGroups.set(fullHash, []);
      }
      fullGroups.get(fullHash).push(file);
    }

    for (const [hash, duplicates] of fullGroups.entries()) {
      if (duplicates.length > 1) {
        const wasted = (duplicates.length - 1) * duplicates[0].size;
        totalWastedBytes += wasted;
        totalDuplicateFiles += (duplicates.length - 1);

        finalDuplicateGroups.push({
          hash,
          size: duplicates[0].size,
          count: duplicates.length,
          wastedBytes: wasted,
          files: duplicates
        });
      }
    }
  }

  // Ordenar por espacio desperdiciado descendente
  finalDuplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  return {
    path: absPath,
    totalFilesScanned,
    duplicateGroupsCount: finalDuplicateGroups.length,
    totalDuplicateFiles,
    totalWastedBytes,
    groups: finalDuplicateGroups
  };
}

/**
 * Elimina duplicados seleccionados manteniendo al menos una copia
 */
function deleteDuplicateFiles(filePaths = [], dryRun = false) {
  const result = {
    dryRun,
    freedBytes: 0,
    deletedFiles: 0,
    errors: []
  };

  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (!dryRun) {
        fs.unlinkSync(filePath);
      }
      result.freedBytes += stat.size;
      result.deletedFiles++;
    } catch (err) {
      result.errors.push(`Error al borrar ${filePath}: ${err.message}`);
    }
  }

  return result;
}

module.exports = {
  scanDuplicates,
  deleteDuplicateFiles
};
