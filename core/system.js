const os = require('os');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function execCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return resolve({ success: false, error: error.message, stdout: '', stderr });
      }
      resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/**
 * Obtiene la lista de unidades de disco fijas de Windows con sus capacidades.
 */
async function getDrives() {
  const psCmd = `powershell -NoProfile -Command "[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and ($_.DriveType -eq 'Fixed' -or $_.DriveType -eq 'Removable') } | Select-Object Name, VolumeLabel, DriveType, TotalSize, AvailableFreeSpace | ConvertTo-Json"`;
  
  const res = await execCommand(psCmd);
  if (!res.success || !res.stdout) {
    return [];
  }

  try {
    let data = JSON.parse(res.stdout);
    if (!Array.isArray(data)) {
      data = [data];
    }

    return data.map(d => {
      const total = Number(d.TotalSize) || 0;
      const free = Number(d.AvailableFreeSpace) || 0;
      const used = Math.max(0, total - free);
      const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;
      return {
        letter: d.Name.replace('\\', ''),
        mount: d.Name,
        label: d.VolumeLabel || 'Disco Local',
        type: d.DriveType,
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usedPercent
      };
    });
  } catch (err) {
    console.error('Error parseando unidades:', err);
    return [];
  }
}

/**
 * Obtiene información general del sistema operativo y hardware.
 */
function getSystemInfo() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    osType: os.type(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Desconocido',
    totalMem,
    freeMem,
    usedMem,
    memPercent: Math.round((usedMem / totalMem) * 100),
    uptimeSeconds: os.uptime(),
    user: os.userInfo().username,
    homeDir: os.homedir(),
    tempDir: os.tmpdir()
  };
}

/**
 * Revela un archivo o carpeta en el Explorador de archivos de Windows.
 */
function revealInExplorer(targetPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(targetPath)) {
      return resolve({ success: false, error: 'La ruta no existe' });
    }
    const cleanPath = path.resolve(targetPath);
    exec(`explorer.exe /select,"${cleanPath}"`, (err) => {
      resolve({ success: !err });
    });
  });
}

/**
 * Obtiene el número de elementos y tamaño total de la Papelera de Reciclaje.
 */
async function getRecycleBinInfo() {
  const psCmd = `powershell -NoProfile -Command "try { (New-Object -ComObject Shell.Application).Namespace(0xA).Items() | Measure-Object -Property Size -Sum | Select-Object Count, Sum | ConvertTo-Json } catch { @{ Count=0; Sum=0 } | ConvertTo-Json }"`;
  const res = await execCommand(psCmd);
  if (!res.success || !res.stdout) {
    return { count: 0, bytes: 0 };
  }
  try {
    const data = JSON.parse(res.stdout);
    return {
      count: Number(data.Count) || 0,
      bytes: Number(data.Sum) || 0
    };
  } catch (e) {
    return { count: 0, bytes: 0 };
  }
}

/**
 * Vacía la Papelera de Reciclaje de Windows de forma segura.
 */
async function emptyRecycleBin() {
  const psCmd = `powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"`;
  const res = await execCommand(psCmd);
  return { success: res.success };
}

module.exports = {
  getDrives,
  getSystemInfo,
  revealInExplorer,
  getRecycleBinInfo,
  emptyRecycleBin
};
