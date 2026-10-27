const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const metadataHelper = require('./metadataHelper');

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
 * Escanea recursivamente archivos en una o varias rutas
 */
function collectFiles(targetPaths, options = {}) {
  const { minSizeBytes = 1024, maxFiles = 40000, maxDepth = 6 } = options;
  const filesList = [];
  const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];

  for (const tPath of paths) {
    const absPath = path.resolve(tPath);
    if (!fs.existsSync(absPath)) continue;

    function walk(currentDir, currentDepth) {
      if (filesList.length >= maxFiles || currentDepth > maxDepth) return;
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
            if (stat.size >= minSizeBytes) {
              const meta = metadataHelper.getEnrichedMetadata(fullPath, stat);
              filesList.push({
                name: entry.name,
                path: fullPath,
                size: stat.size,
                mtime: stat.mtime,
                ...meta,
                previewUrl: meta.isMedia ? `/api/media/preview?path=${encodeURIComponent(fullPath)}` : null
              });
            }
          } catch (e) {
            // Archivo protegido
          }
        }
      }
    }

    walk(absPath, 0);
  }

  return filesList;
}

/**
 * Escanea en busca de duplicados o colisiones de nombre con soporte Multi-Nube y EXIF
 */
async function scanDuplicates(targetPath, options = {}) {
  const {
    minSizeBytes = 10240, // 10 KB
    maxFiles = 40000,
    mode = 'exact' // 'exact' | 'same_name' | 'clouds'
  } = options;

  let targetPaths = [targetPath];
  if (Array.isArray(targetPath)) {
    targetPaths = targetPath;
  }

  const allFiles = collectFiles(targetPaths, { minSizeBytes, maxFiles });
  const totalFilesScanned = allFiles.length;

  // ==========================================================
  // MODO 1: Mismo Nombre pero Contenido DIFERENTE (Colisión de fotos)
  // ==========================================================
  if (mode === 'same_name') {
    const nameMap = new Map();
    for (const file of allFiles) {
      const key = file.name.toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key).push(file);
    }

    const collisionGroups = [];
    for (const [name, files] of nameMap.entries()) {
      if (files.length <= 1) continue;

      // Calcular hashes para verificar si son realmente diferentes
      for (const file of files) {
        if (!file.hash) {
          file.hash = await getFullHash(file.path);
        }
      }

      // Comprobar si tienen diferente contenido
      const uniqueHashes = new Set(files.map(f => f.hash).filter(Boolean));
      if (uniqueHashes.size > 1) {
        // Son fotos/archivos distintos que comparten el mismo nombre
        collisionGroups.push({
          groupType: 'collision',
          name,
          title: `Mismo Nombre "${name}", pero fotos/archivos DISTINTOS`,
          isIdentical: false,
          count: files.length,
          wastedBytes: 0,
          files
        });
      }
    }

    return {
      path: Array.isArray(targetPath) ? targetPath.join(', ') : targetPath,
      mode: 'same_name',
      totalFilesScanned,
      duplicateGroupsCount: collisionGroups.length,
      totalDuplicateFiles: collisionGroups.reduce((acc, g) => acc + g.files.length, 0),
      totalWastedBytes: 0,
      groups: collisionGroups
    };
  }

  // ==========================================================
  // MODO 2 y 3: Duplicados Exactos (Mismo Contenido Binario)
  // ==========================================================
  // Fase 1: Agrupar por tamaño
  const sizeMap = new Map();
  for (const file of allFiles) {
    if (!sizeMap.has(file.size)) sizeMap.set(file.size, []);
    sizeMap.get(file.size).push(file);
  }

  const candidateGroups = [];
  for (const files of sizeMap.values()) {
    if (files.length > 1) candidateGroups.push(files);
  }

  // Fase 2: Hash parcial
  const partialGroups = new Map();
  for (const group of candidateGroups) {
    for (const file of group) {
      const pHash = await getPartialHash(file.path);
      if (!pHash) continue;
      const key = `${file.size}_${pHash}`;
      if (!partialGroups.has(key)) partialGroups.set(key, []);
      partialGroups.get(key).push(file);
    }
  }

  // Fase 3: Hash SHA-256 completo
  const finalDuplicateGroups = [];
  let totalWastedBytes = 0;
  let totalDuplicateFiles = 0;

  for (const files of partialGroups.values()) {
    if (files.length <= 1) continue;

    const fullGroups = new Map();
    for (const file of files) {
      const fullHash = await getFullHash(file.path);
      if (!fullHash) continue;
      file.hash = fullHash;
      if (!fullGroups.has(fullHash)) fullGroups.set(fullHash, []);
      fullGroups.get(fullHash).push(file);
    }

    for (const [hash, duplicates] of fullGroups.entries()) {
      if (duplicates.length > 1) {
        const wasted = (duplicates.length - 1) * duplicates[0].size;
        totalWastedBytes += wasted;
        totalDuplicateFiles += (duplicates.length - 1);

        // Analizar cruce de nubes
        const cloudNames = Array.from(new Set(duplicates.map(d => d.cloud.name)));
        const isMultiCloud = cloudNames.length > 1;

        // Comprobar política de Google
        const hasPre2021 = duplicates.some(d => d.googlePolicy && d.googlePolicy.isPreJune2021);

        finalDuplicateGroups.push({
          groupType: 'exact',
          hash,
          isIdentical: true,
          size: duplicates[0].size,
          count: duplicates.length,
          wastedBytes: wasted,
          isMultiCloud,
          cloudNames,
          hasPre2021,
          files: duplicates
        });
      }
    }
  }

  // Ordenar por espacio desperdiciado descendente
  finalDuplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

  return {
    path: Array.isArray(targetPath) ? targetPath.join(', ') : targetPath,
    mode: mode === 'clouds' ? 'clouds' : 'exact',
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
