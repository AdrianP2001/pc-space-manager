const fs = require('fs');
const path = require('path');

/**
 * Extrae la fecha DateTimeOriginal y dimensiones de un archivo JPEG si están disponibles
 * Lee únicamente los primeros 64 KB para máxima velocidad
 */
function extractJpegExif(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buffer, 0, 65536, 0);
    fs.closeSync(fd);

    if (bytesRead < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
      return null;
    }

    let offset = 2;
    while (offset < bytesRead - 4) {
      if (buffer[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xDA || marker === 0xD9) break; // Start of Scan o End of Image
      
      const length = buffer.readUInt16BE(offset + 2);
      if (marker === 0xE1) { // APP1 Exif
        const exifHeader = buffer.toString('ascii', offset + 4, offset + 8);
        if (exifHeader === 'Exif') {
          const tiffStart = offset + 10;
          const endianStr = buffer.toString('ascii', tiffStart, tiffStart + 2);
          const isLittle = endianStr === 'II';

          function read16(o) {
            return isLittle ? buffer.readUInt16LE(tiffStart + o) : buffer.readUInt16BE(tiffStart + o);
          }
          function read32(o) {
            return isLittle ? buffer.readUInt32LE(tiffStart + o) : buffer.readUInt32BE(tiffStart + o);
          }

          const ifd0Offset = read32(4);
          let exifSubIfdOffset = null;
          let dateStr = null;

          function parseIfd(ifdOff) {
            if (ifdOff + 2 > bytesRead - tiffStart) return;
            const entries = read16(ifdOff);
            for (let i = 0; i < entries; i++) {
              const entryOff = ifdOff + 2 + (i * 12);
              if (entryOff + 12 > bytesRead - tiffStart) break;
              const tag = read16(entryOff);
              if (tag === 0x8769) { // Exif SubIFD
                exifSubIfdOffset = read32(entryOff + 8);
              } else if (tag === 0x9003 || tag === 0x0132) { // DateTimeOriginal o DateTime
                const valOffset = read32(entryOff + 8);
                const strStart = tiffStart + valOffset;
                if (strStart + 19 <= bytesRead) {
                  dateStr = buffer.toString('ascii', strStart, strStart + 19);
                }
              }
            }
          }

          parseIfd(ifd0Offset);
          if (exifSubIfdOffset) {
            parseIfd(exifSubIfdOffset);
          }

          if (dateStr && /^\d{4}:\d{2}:\d{2}/.test(dateStr)) {
            const formatted = dateStr.slice(0, 10).replace(/:/g, '-') + ' ' + dateStr.slice(11, 19);
            return { dateTimeOriginal: formatted };
          }
        }
      }
      offset += 2 + length;
    }
  } catch (e) {
    // Silencioso ante errores de formato
  }
  return null;
}

/**
 * Normaliza nombres de archivos eliminando sufijos como (1), (2), _1, - copia, etc.
 */
function normalizeFileName(fileName) {
  const ext = path.extname(fileName);
  let base = path.basename(fileName, ext);
  base = base.replace(/[\s_-]*\(\d+\)$/i, '');
  base = base.replace(/[\s_-]+copia(\s*\(\d+\))?$/i, '');
  base = base.replace(/[\s_-]+copy(\s*\(\d+\))?$/i, '');
  base = base.replace(/[\s_-]+\d{1,2}$/i, '');
  return (base.trim() + ext.toLowerCase()).toLowerCase();
}

/**
 * Extrae año/fecha del nombre del archivo si contiene YYYYMMDD o YYYY-MM-DD
 */
function extractDateFromName(fileName) {
  const match = fileName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (year >= 2000 && year <= 2035 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  return null;
}

/**
 * Detecta la nube de origen a partir de la ruta del archivo
 */
function detectCloudProvider(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/onedrive')) {
    return { name: 'OneDrive', badge: '☁️ OneDrive', color: '#0078d4' };
  }
  if (normalized.includes('/mega') || normalized.includes('megasync')) {
    return { name: 'MEGA', badge: '☁️ MEGA', color: '#d9272e' };
  }
  if (normalized.includes('/google drive') || normalized.includes('/googledrive') || normalized.includes('google_drive')) {
    return { name: 'Google Drive', badge: '☁️ Google Drive', color: '#34a853' };
  }
  if (normalized.includes('/google fotos') || normalized.includes('/google photos') || normalized.includes('takeout')) {
    return { name: 'Google Photos', badge: '☁️ Google Photos', color: '#ea4335' };
  }
  if (normalized.includes('/pictures') || normalized.includes('/imágenes') || normalized.includes('/dcim')) {
    return { name: 'Galería Local', badge: '📁 Local', color: '#10b981' };
  }
  return { name: 'Local', badge: '💻 Local', color: '#64748b' };
}

/**
 * Evalúa la política de almacenamiento de Google Photos (corte 1 de Junio de 2021)
 */
function evaluateGooglePolicy(dateStr) {
  if (!dateStr) return { isPreJune2021: false, label: 'Desconocido', color: '#64748b' };
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) {
    return { isPreJune2021: false, label: 'Fecha no estándar', color: '#64748b' };
  }
  const cutoff = new Date('2021-06-01T00:00:00');
  if (d < cutoff) {
    return {
      isPreJune2021: true,
      label: 'Google Photos Gratis (Pre-Jun 2021)',
      advice: 'Conservar en Google Photos (cuota 0). Eliminar de OneDrive/MEGA para liberar espacio de pago.',
      color: '#10b981'
    };
  } else {
    return {
      isPreJune2021: false,
      label: 'Post-Jun 2021 (Consume Cuota)',
      advice: 'Consume cuota de suscripción. Evitar tenerlo duplicado en más de 1 nube.',
      color: '#f59e0b'
    };
  }
}

/**
 * Obtiene todos los metadatos enriquecidos de un archivo
 */
function getEnrichedMetadata(filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext);
  const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.3gp'].includes(ext);
  const cloud = detectCloudProvider(filePath);

  let captureDate = null;
  if (ext === '.jpg' || ext === '.jpeg') {
    const exif = extractJpegExif(filePath);
    if (exif && exif.dateTimeOriginal) {
      captureDate = exif.dateTimeOriginal;
    }
  }

  if (!captureDate) {
    const nameDate = extractDateFromName(path.basename(filePath));
    if (nameDate) {
      captureDate = nameDate + ' 12:00:00';
    } else if (stat && stat.mtime) {
      captureDate = stat.mtime.toISOString().replace('T', ' ').slice(0, 19);
    }
  }

  const googlePolicy = evaluateGooglePolicy(captureDate);

  return {
    isMedia: isImage || isVideo,
    isImage,
    isVideo,
    ext,
    cloud,
    captureDate,
    year: captureDate ? captureDate.slice(0, 4) : 'Desconocido',
    googlePolicy,
    normalizedName: normalizeFileName(path.basename(filePath))
  };
}

module.exports = {
  extractJpegExif,
  normalizeFileName,
  extractDateFromName,
  detectCloudProvider,
  evaluateGooglePolicy,
  getEnrichedMetadata
};
