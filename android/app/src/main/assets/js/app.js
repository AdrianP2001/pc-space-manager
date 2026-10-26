document.addEventListener('DOMContentLoaded', () => {
  const state = {
    volumes: [],
    selectedVolume: null,
    scanData: null,
    selectedCategories: new Set(),
    dryRun: false,
    isScanning: false
  };

  const hasBridge = typeof window.AndroidBridge !== 'undefined';

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0.00 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, 3500);
  }

  // Comprobar permisos
  function checkPermissions() {
    if (hasBridge) {
      const hasPerm = window.AndroidBridge.hasStoragePermission();
      document.getElementById('permission-card').style.display = hasPerm ? 'none' : 'flex';
    }
  }

  document.getElementById('btn-grant-permission').addEventListener('click', () => {
    if (hasBridge) window.AndroidBridge.requestStoragePermission();
  });

  window.onAndroidResume = function() {
    checkPermissions();
    loadStorageVolumes();
  };

  // Cargar volúmenes de almacenamiento (Interno, SD, OTG)
  function loadStorageVolumes() {
    if (!hasBridge) {
      // Modo Demo para pruebas en navegador
      renderVolumes({
        success: true,
        deviceModel: 'Samsung Galaxy (Demo)',
        androidVersion: 'Android 14',
        volumes: [
          {
            id: 'internal',
            name: 'Almacenamiento Interno',
            path: '/storage/emulated/0',
            isRemovable: false,
            isPrimary: true,
            usedBytes: 85 * 1024 * 1024 * 1024,
            totalBytes: 128 * 1024 * 1024 * 1024,
            freeBytes: 43 * 1024 * 1024 * 1024,
            percent: 66
          },
          {
            id: 'sd_card',
            name: 'Tarjeta MicroSD',
            path: '/storage/E234-1234',
            isRemovable: true,
            isPrimary: false,
            usedBytes: 24 * 1024 * 1024 * 1024,
            totalBytes: 64 * 1024 * 1024 * 1024,
            freeBytes: 40 * 1024 * 1024 * 1024,
            percent: 37
          }
        ]
      });
      return;
    }

    try {
      let resStr = '';
      if (typeof window.AndroidBridge.getStorageVolumes === 'function') {
        resStr = window.AndroidBridge.getStorageVolumes();
      } else {
        resStr = window.AndroidBridge.getStorageOverview();
      }

      const data = JSON.parse(resStr);
      if (data.success) {
        renderVolumes(data);
      }
    } catch (e) {
      console.error('Error cargando volúmenes:', e);
    }
  }

  function renderVolumes(data) {
    state.volumes = data.volumes || [];
    document.getElementById('device-model-text').textContent = (data.deviceModel || 'Android') + ' • ' + (data.androidVersion || '');

    const pillsContainer = document.getElementById('storage-pills');
    pillsContainer.innerHTML = '';

    const count = state.volumes.length;
    document.getElementById('detected-units-badge').textContent = count + (count === 1 ? ' unidad' : ' unidades');

    if (count === 0) {
      pillsContainer.innerHTML = '<span class="text-dim">No se encontraron unidades de almacenamiento.</span>';
      return;
    }

    // Seleccionar por defecto la unidad interna o la previa seleccionada
    if (!state.selectedVolume) {
      state.selectedVolume = state.volumes[0];
    } else {
      const match = state.volumes.find(v => v.path === state.selectedVolume.path);
      state.selectedVolume = match || state.volumes[0];
    }

    state.volumes.forEach((vol) => {
      const pill = document.createElement('div');
      const isActive = vol.path === state.selectedVolume.path;
      pill.className = 'storage-pill' + (isActive ? ' active' : '');
      const icon = vol.isRemovable ? '💾' : '📱';

      pill.innerHTML = `
        <span class="pill-icon">${icon}</span>
        <span>${vol.name}</span>
        <span class="pill-cap">(${formatBytes(vol.freeBytes)} libres)</span>
      `;

      pill.addEventListener('click', () => {
        state.selectedVolume = vol;
        document.querySelectorAll('.storage-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        updateVolumeDisplay(vol);
      });

      pillsContainer.appendChild(pill);
    });

    updateVolumeDisplay(state.selectedVolume);
  }

  function updateVolumeDisplay(vol) {
    if (!vol) return;
    document.getElementById('current-volume-name').textContent = vol.name;
    document.getElementById('storage-percent-badge').textContent = vol.percent + '%';
    document.getElementById('storage-fill').style.width = vol.percent + '%';
    document.getElementById('storage-used').textContent = formatBytes(vol.usedBytes) + ' usados';
    document.getElementById('storage-free').textContent = formatBytes(vol.freeBytes) + ' libres';

    const shortName = vol.name.length > 20 ? vol.name.substring(0, 18) + '...' : vol.name;
    document.getElementById('btn-scan-label').textContent = 'Escanear ' + (vol.isRemovable ? 'SD' : 'Interno');
  }

  // Pestañas
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Modo simulación
  const btnScan = document.getElementById('btn-scan');
  const btnClean = document.getElementById('btn-clean');
  const chkDryRun = document.getElementById('chk-dry-run');

  chkDryRun.addEventListener('change', (e) => {
    state.dryRun = e.target.checked;
    btnClean.className = state.dryRun ? 'btn btn-warning' : 'btn btn-danger';
  });

  // Callbacks de progreso en tiempo real desde Java
  window.onScanProgress = function(percent, stage, itemsCount) {
    const progressBox = document.getElementById('scan-progress-box');
    const bar = document.getElementById('scan-progress-bar');
    const badge = document.getElementById('scan-percent-badge');
    const stageText = document.getElementById('scan-stage-text');
    const counterText = document.getElementById('scan-counter-text');

    progressBox.style.display = 'block';
    bar.style.width = percent + '%';
    badge.textContent = percent + '%';
    stageText.textContent = stage;
    counterText.textContent = Number(itemsCount || 0).toLocaleString() + ' archivos';
  };

  window.onScanComplete = function(data) {
    state.isScanning = false;
    btnScan.disabled = false;
    document.getElementById('btn-scan-label').textContent = 'Escanear de Nuevo';

    window.onScanProgress(100, '✓ ¡Auditoría completada!', data.totalFilesInspected || 0);

    setTimeout(() => {
      document.getElementById('scan-progress-box').style.display = 'none';

      if (data.success) {
        state.scanData = data;
        state.selectedCategories.clear();
        data.categories.forEach(c => {
          if (c.action === 'clean') state.selectedCategories.add(c.id);
        });
        renderCategories(data.categories);
        renderHeavyFiles(data.heavyFiles || []);
        updateTotal();
        btnClean.disabled = false;

        let totalRec = 0;
        data.categories.forEach(c => { if (c.action === 'clean') totalRec += c.bytes; });
        showToast('Escaneo completado: ' + formatBytes(totalRec) + ' recuperables');
      }
    }, 700);
  };

  window.onScanError = function(errMsg) {
    state.isScanning = false;
    btnScan.disabled = false;
    document.getElementById('scan-progress-box').style.display = 'none';
    document.getElementById('btn-scan-label').textContent = 'Escanear Unidad';
    showToast('Error: ' + errMsg);
  };

  // Botón Escanear
  btnScan.addEventListener('click', () => {
    if (state.isScanning) return;
    state.isScanning = true;
    btnScan.disabled = true;

    const vol = state.selectedVolume;
    const volPath = vol ? vol.path : '';
    const volName = vol ? vol.name : 'Almacenamiento';

    document.getElementById('scan-header-title').textContent = 'Analizando ' + volName + '...';
    window.onScanProgress(0, 'Iniciando conexión con el sistema de archivos...', 0);

    if (hasBridge && typeof window.AndroidBridge.startScan === 'function') {
      window.AndroidBridge.startScan(volPath);
    } else {
      // Simulación de escaneo con barra de progreso fluida para demo en navegador
      let p = 0;
      const stages = [
        { pct: 15, msg: 'Inspeccionando videos enviados de WhatsApp (duplicados)...' },
        { pct: 35, msg: 'Analizando notas de voz y audios de WhatsApp (.opus)...' },
        { pct: 55, msg: 'Buscando base oculta de miniaturas (.thumbnails de Samsung)...' },
        { pct: 75, msg: 'Analizando descargas e instaladores APK huérfanos...' },
        { pct: 90, msg: 'Localizando los archivos más pesados (>30 MB)...' },
        { pct: 100, msg: '¡Finalizando auditoría!' }
      ];

      let stageIdx = 0;
      let count = 0;
      const interval = setInterval(() => {
        count += Math.floor(Math.random() * 80) + 20;
        const s = stages[stageIdx];
        if (s) {
          window.onScanProgress(s.pct, s.msg, count);
          stageIdx++;
        } else {
          clearInterval(interval);
          window.onScanComplete({
            success: true,
            totalFilesInspected: count,
            categories: [
              { id: 'waSentVideos', name: 'Videos Enviados de WhatsApp (Duplicados)', description: 'Copias de videos enviados en chats que ya tienes en galería', bytes: 1450000000, count: 28, action: 'clean' },
              { id: 'dcimThumbnails', name: 'Base de Miniaturas Oculta (.thumbnails)', description: 'Caché .thumbdata de la galería de fotos de Samsung', bytes: 4890000000, count: 840, action: 'clean' },
              { id: 'downloadApks', name: 'Instaladores APK en Descargas', description: 'Archivos instaladores .apk que ya fueron instalados', bytes: 640000000, count: 4, action: 'clean' },
              { id: 'cameraMedia', name: 'Galería de Cámara (DCIM/Camera)', description: 'Fotos y videos originales tomados con tu cámara', bytes: 18200000000, count: 320, action: 'keep' }
            ],
            heavyFiles: [
              { name: 'VID_20261020_Vacaciones.mp4', path: '/DCIM/Camera/VID_20261020.mp4', size: 1420000000 },
              { name: 'backup_chats.db.crypt14', path: '/WhatsApp/Databases/backup.db', size: 450000000 }
            ]
          });
        }
      }, 350);
    }
  });

  function renderCategories(categories) {
    const wrap = document.getElementById('categories-container');
    wrap.innerHTML = '';

    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';
      const isChecked = state.selectedCategories.has(cat.id);

      card.innerHTML = `
        <input type="checkbox" class="cat-check" data-id="${cat.id}" ${isChecked ? 'checked' : ''}>
        <div class="cat-info">
          <h4>${cat.name}</h4>
          <p>${cat.description}</p>
        </div>
        <div class="cat-stats">
          <span class="cat-size">${formatBytes(cat.bytes)}</span>
          <span class="cat-count">${cat.count} archivos</span>
        </div>
      `;

      card.querySelector('.cat-check').addEventListener('change', (e) => {
        if (e.target.checked) state.selectedCategories.add(cat.id);
        else state.selectedCategories.delete(cat.id);
        updateTotal();
      });

      wrap.appendChild(card);
    });
  }

  function renderHeavyFiles(files) {
    const list = document.getElementById('heavy-list');
    list.innerHTML = '';

    if (!files || files.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>No se encontraron archivos > 30 MB en esta unidad.</p></div>';
      return;
    }

    files.forEach(f => {
      const item = document.createElement('div');
      item.className = 'heavy-item';
      item.innerHTML = `
        <div class="name" title="${f.path}">${f.name}</div>
        <div class="size">${formatBytes(f.size)}</div>
      `;
      list.appendChild(item);
    });
  }

  function updateTotal() {
    if (!state.scanData) return;
    let bytes = 0;
    state.scanData.categories.forEach(c => {
      if (state.selectedCategories.has(c.id)) bytes += c.bytes;
    });
    document.getElementById('recoverable-text').textContent = 'Recuperable: ' + formatBytes(bytes);
    btnClean.disabled = state.selectedCategories.size === 0;
  }

  // Limpieza
  btnClean.addEventListener('click', () => {
    const isDry = state.dryRun;
    const vol = state.selectedVolume;
    const volPath = vol ? vol.path : '';
    const volName = vol ? vol.name : 'Almacenamiento';

    const msg = isDry
      ? '¿Iniciar simulación de limpieza en ' + volName + '? (No se borrará ningún archivo)'
      : '¿Eliminar permanentemente los archivos seleccionados en ' + volName + '?';

    if (!confirm(msg)) return;

    if (!hasBridge) {
      showToast('Limpieza completada (Modo Demo)');
      return;
    }

    let totalFreed = 0;
    state.selectedCategories.forEach(catId => {
      let resStr = '';
      if (typeof window.AndroidBridge.cleanCategory === 'function') {
        resStr = window.AndroidBridge.cleanCategory(catId, volPath, isDry);
      }
      try {
        const res = JSON.parse(resStr);
        if (res.success) totalFreed += res.freedBytes;
      } catch (e) {}
    });

    const finishMsg = isDry
      ? 'Simulación: Se habrían liberado ' + formatBytes(totalFreed)
      : '¡Listo! Se liberaron ' + formatBytes(totalFreed) + ' en ' + volName;

    showToast(finishMsg);
    loadStorageVolumes();
    if (!isDry) btnScan.click();
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    checkPermissions();
    loadStorageVolumes();
    showToast('Almacenamiento actualizado');
  });

  checkPermissions();
  loadStorageVolumes();
});
