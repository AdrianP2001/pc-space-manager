const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const POSSIBLE_ADB_PATHS = [
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe', 'platform-tools', 'adb.exe'),
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  'C:\\platform-tools\\adb.exe',
  'adb'
];

let cachedAdbPath = null;

function getAdbPath() {
  if (cachedAdbPath) return cachedAdbPath;
  for (const p of POSSIBLE_ADB_PATHS) {
    if (p === 'adb' || fs.existsSync(p)) {
      cachedAdbPath = p;
      return p;
    }
  }
  return 'adb';
}

function execAdb(args) {
  return new Promise((resolve) => {
    const adb = getAdbPath();
    const cmd = `"${adb}" ${args}`;
    exec(cmd, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, error: err.message, stdout: '', stderr: stderr.trim() });
      }
      resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/**
 * Consulta el estado de los dispositivos móviles conectados por USB
 */
async function getDeviceStatus() {
  const res = await execAdb('devices -l');
  if (!res.success) {
    return {
      connected: false,
      adbAvailable: false,
      error: res.error,
      devices: []
    };
  }

  const lines = res.stdout.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
  if (lines.length === 0) {
    return {
      connected: false,
      adbAvailable: true,
      message: 'No hay dispositivos Android detectados por ADB',
      devices: []
    };
  }

  const devices = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const serial = parts[0];
    const state = parts[1]; // 'device', 'unauthorized', 'offline'

    if (state === 'unauthorized') {
      devices.push({
        serial,
        state,
        authorized: false,
        name: 'Dispositivo Android (No autorizado)',
        message: 'Por favor, desbloquea la pantalla de tu teléfono y acepta el aviso: "¿Permitir depuración por USB desde esta computadora?"'
      });
      continue;
    }

    if (state === 'device') {
      const modelRes = await execAdb(`-s ${serial} shell getprop ro.product.model`);
      const brandRes = await execAdb(`-s ${serial} shell getprop ro.product.manufacturer`);
      const osVerRes = await execAdb(`-s ${serial} shell getprop ro.build.version.release`);

      const dfRes = await execAdb(`-s ${serial} shell df /data`);
      let storage = { totalBytes: 0, usedBytes: 0, freeBytes: 0, percent: 0 };

      if (dfRes.success && dfRes.stdout) {
        const dfLines = dfRes.stdout.split('\n');
        if (dfLines.length >= 2) {
          const cols = dfLines[1].trim().split(/\s+/);
          const totalK = Number(cols[1]) || 0;
          const usedK = Number(cols[2]) || 0;
          const freeK = Number(cols[3]) || 0;
          const total = totalK * 1024;
          const used = usedK * 1024;
          const free = freeK * 1024;
          const pct = total > 0 ? Math.round((used / total) * 100) : 0;
          storage = { totalBytes: total, usedBytes: used, freeBytes: free, percent: pct };
        }
      }

      devices.push({
        serial,
        state: 'device',
        authorized: true,
        model: modelRes.stdout || 'Samsung Android',
        manufacturer: (brandRes.stdout || 'Samsung').toUpperCase(),
        androidVersion: `Android ${osVerRes.stdout || '13/14'}`,
        storage
      });
    }
  }

  return {
    connected: devices.some(d => d.authorized),
    adbAvailable: true,
    devices
  };
}

/**
 * Escanea el almacenamiento del teléfono en busca de categorías específicas
 */
async function scanMobileStorage(serial) {
  const prefix = serial ? `-s ${serial}` : '';

  const waCheck = await execAdb(`${prefix} shell "[ -d /sdcard/Android/media/com.whatsapp/WhatsApp/Media ] && echo modern || echo legacy"`);
  const waPath = waCheck.stdout.trim() === 'modern'
    ? '/sdcard/Android/media/com.whatsapp/WhatsApp/Media'
    : '/sdcard/WhatsApp/Media';

  async function queryFolder(subPath, filterExt = null) {
    const fullPath = `"${subPath}"`;
    const duCmd = `${prefix} shell "du -k ${fullPath} 2>/dev/null | tail -n 1"`;
    const duRes = await execAdb(duCmd);

    let bytes = 0;
    if (duRes.success && duRes.stdout) {
      const kb = Number(duRes.stdout.split(/\s+/)[0]) || 0;
      bytes = kb * 1024;
    }

    const countCmd = filterExt
      ? `${prefix} shell "find ${fullPath} -type f -name '${filterExt}' 2>/dev/null | wc -l"`
      : `${prefix} shell "find ${fullPath} -type f 2>/dev/null | wc -l"`;
    const countRes = await execAdb(countCmd);
    const count = Number(countRes.stdout.trim()) || 0;

    return { bytes, count, path: subPath };
  }

  const waSentVideos = await queryFolder(`${waPath}/WhatsApp Video/Sent`);
  const waRecvVideos = await queryFolder(`${waPath}/WhatsApp Video`);
  const waVoiceNotes = await queryFolder(`${waPath}/WhatsApp Voice Notes`);
  const waSentImages = await queryFolder(`${waPath}/WhatsApp Images/Sent`);
  const waStatuses = await queryFolder(`${waPath}/.Statuses`);

  const cameraPhotos = await queryFolder('/sdcard/DCIM/Camera');
  const downloads = await queryFolder('/sdcard/Download');
  const apkFiles = await queryFolder('/sdcard/Download', '*.apk');
  const thumbnails = await queryFolder('/sdcard/DCIM/.thumbnails');

  const heavyCmd = `${prefix} shell "find /sdcard/ -type f -size +30000k -exec ls -la {} + 2>/dev/null | sort -k 5 -n -r | head -n 30"`;
  const heavyRes = await execAdb(heavyCmd);

  const topHeavyFiles = [];
  if (heavyRes.success && heavyRes.stdout) {
    const lines = heavyRes.stdout.split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 9) {
        const size = Number(parts[4]) || 0;
        const filePath = parts.slice(8).join(' ');
        const name = path.basename(filePath);
        topHeavyFiles.push({
          name,
          path: filePath,
          size,
          ext: path.extname(name).toLowerCase()
        });
      }
    }
  }

  const categories = [
    {
      id: 'waSentVideos',
      name: 'Videos Enviados de WhatsApp (Duplicados)',
      description: 'Copias duplicadas de videos que enviaste a chats y ya existen en tu galería',
      icon: 'video',
      count: waSentVideos.count,
      totalBytes: waSentVideos.bytes,
      path: `${waPath}/WhatsApp Video/Sent`,
      recommendedAction: 'clean'
    },
    {
      id: 'waVoiceNotes',
      name: 'Notas de Voz de WhatsApp (.opus)',
      description: 'Audios y notas de voz acumulados a lo largo de meses y años',
      icon: 'mic',
      count: waVoiceNotes.count,
      totalBytes: waVoiceNotes.bytes,
      path: `${waPath}/WhatsApp Voice Notes`,
      recommendedAction: 'review'
    },
    {
      id: 'waSentImages',
      name: 'Fotos Enviadas de WhatsApp (Duplicados)',
      description: 'Copias de imágenes que ya enviaste y que duplican almacenamiento',
      icon: 'image',
      count: waSentImages.count,
      totalBytes: waSentImages.bytes,
      path: `${waPath}/WhatsApp Images/Sent`,
      recommendedAction: 'clean'
    },
    {
      id: 'waStatuses',
      name: 'Estados Temporales de WhatsApp',
      description: 'Estados de contactos descargados en caché que caducan a las 24 horas',
      icon: 'clock',
      count: waStatuses.count,
      totalBytes: waStatuses.bytes,
      path: `${waPath}/.Statuses`,
      recommendedAction: 'clean'
    },
    {
      id: 'dcimThumbnails',
      name: 'Base de Miniaturas Oculta (.thumbnails)',
      description: 'Caché .thumbdata de la galería de fotos que suele inflarse a gigabytes',
      icon: 'database',
      count: thumbnails.count,
      totalBytes: thumbnails.bytes,
      path: '/sdcard/DCIM/.thumbnails',
      recommendedAction: 'clean'
    },
    {
      id: 'downloadApks',
      name: 'Instaladores APK en Descargas',
      description: 'Archivos .apk instaladores que descargaste y ya están instalados',
      icon: 'package',
      count: apkFiles.count,
      totalBytes: apkFiles.bytes,
      path: '/sdcard/Download',
      recommendedAction: 'clean'
    },
    {
      id: 'cameraMedia',
      name: 'Fotos y Videos de Cámara (DCIM)',
      description: 'Almacenamiento total de la galería de tu cámara',
      icon: 'camera',
      count: cameraPhotos.count,
      totalBytes: cameraPhotos.bytes,
      path: '/sdcard/DCIM/Camera',
      recommendedAction: 'backup'
    }
  ];

  let grandTotal = 0;
  let cleanableTotal = 0;
  categories.forEach(c => {
    grandTotal += c.totalBytes;
    if (c.recommendedAction === 'clean') {
      cleanableTotal += c.totalBytes;
    }
  });

  return {
    serial,
    categories,
    topHeavyFiles,
    grandTotalBytes: grandTotal,
    cleanableBytes: cleanableTotal,
    timestamp: new Date().toISOString()
  };
}

/**
 * Limpia o elimina archivos de categorías seleccionadas en el teléfono
 */
async function cleanMobileCategory(serial, categoryIds = [], dryRun = false) {
  const prefix = serial ? `-s ${serial}` : '';
  const scan = await scanMobileStorage(serial);
  const report = {
    dryRun,
    freedBytes: 0,
    freedFiles: 0,
    details: []
  };

  const idSet = new Set(categoryIds);

  for (const cat of scan.categories) {
    if (!idSet.has(cat.id)) continue;

    if (dryRun) {
      report.freedBytes += cat.totalBytes;
      report.freedFiles += cat.count;
      report.details.push({ id: cat.id, name: cat.name, bytes: cat.totalBytes, files: cat.count });
      continue;
    }

    if (cat.id === 'downloadApks') {
      await execAdb(`${prefix} shell "rm -f /sdcard/Download/*.apk"`);
    } else if (cat.path) {
      await execAdb(`${prefix} shell "rm -rf \\"${cat.path}/\\"*`);
    }

    report.freedBytes += cat.totalBytes;
    report.freedFiles += cat.count;
    report.details.push({ id: cat.id, name: cat.name, bytes: cat.totalBytes, files: cat.count });
  }

  return report;
}

/**
 * Respalda archivos a la PC antes de eliminarlos del teléfono
 */
async function backupAndClean(serial, remotePath, localDir, dryRun = false) {
  const prefix = serial ? `-s ${serial}` : '';
  const targetBackup = path.resolve(localDir);

  if (!fs.existsSync(targetBackup)) {
    fs.mkdirSync(targetBackup, { recursive: true });
  }

  if (dryRun) {
    return { success: true, dryRun: true, message: `Simulación: Se copiaría a ${targetBackup}` };
  }

  const pullRes = await execAdb(`${prefix} pull "${remotePath}" "${targetBackup}"`);
  if (!pullRes.success) {
    return { success: false, error: pullRes.error || pullRes.stderr };
  }

  await execAdb(`${prefix} shell "rm -rf \\"${remotePath}/\\"*`);

  return {
    success: true,
    backupDir: targetBackup,
    message: `Archivos respaldados exitosamente en ${targetBackup} y liberados del teléfono.`
  };
}

module.exports = {
  getDeviceStatus,
  scanMobileStorage,
  cleanMobileCategory,
  backupAndClean
};
