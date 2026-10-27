document.addEventListener('DOMContentLoaded', () => {
  const state = {
    volumes: [],
    selectedVolume: null,
    scanData: null,
    selectedCategories: new Set(),
    dryRun: false,
    isScanning: false,
    updateInfo: null
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
    checkAppUpdates(false);
  };

  // Cargar volúmenes de almacenamiento (Interno, SD, OTG)
  function loadStorageVolumes() {
    if (!hasBridge) {
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

  // ==========================================
  // SISTEMA DE ACTUALIZACIONES (GITHUB RELEASES)
  // ==========================================
  function checkAppUpdates(isManual) {
    if (isManual) {
      showToast('Buscando actualizaciones en GitHub...');
    }

    if (hasBridge && typeof window.AndroidBridge.checkForUpdates === 'function') {
      window.AndroidBridge.checkForUpdates(isManual);
    } else {
      // Fallback web / prueba en navegador
      fetch('https://api.github.com/repos/AdrianP2001/pc-space-manager/releases/latest', {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      })
      .then(res => res.json())
      .then(release => {
        const tagName = release.tag_name || '';
        let apkUrl = 'https://github.com/AdrianP2001/pc-space-manager/releases/latest';
        if (release.assets && release.assets.length > 0) {
          const apkAsset = release.assets.find(a => a.name.endsWith('.apk'));
          if (apkAsset) apkUrl = apkAsset.browser_download_url;
        }

        const latestVer = tagName.replace('v', '').replace('-apk', '');
        const currentVer = '1.1.0';

        window.onUpdateCheckResult({
          hasUpdate: latestVer !== currentVer,
          latestVersion: latestVer,
          currentVersion: currentVer,
          releaseName: release.name || tagName,
          releaseNotes: release.body || 'Nuevas mejoras de rendimiento y correcciones.',
          apkUrl: apkUrl,
          isManualCheck: isManual
        });
      })
      .catch(err => {
        if (isManual) showToast('Error al comprobar actualizaciones.');
      });
    }
  }

  window.onUpdateCheckResult = function(data) {
    state.updateInfo = data;
    const banner = document.getElementById('update-banner');
    const dot = document.getElementById('update-indicator-dot');

    if (data.hasUpdate) {
      document.getElementById('update-badge-version').textContent = 'v' + data.latestVersion;
      banner.style.display = 'flex';
      dot.style.display = 'block';

      if (data.isManualCheck) {
        openUpdateModal();
      }
    } else {
      banner.style.display = 'none';
      dot.style.display = 'none';
      if (data.isManualCheck) {
        showToast('✓ Ya tienes la versión más reciente (v' + (data.currentVersion || '1.1.0') + ')');
      }
    }
  };

  window.onUpdateCheckError = function(isManual, errMsg) {
    if (isManual) {
      showToast('No se pudo verificar: ' + errMsg);
    }
  };

  function openUpdateModal() {
    if (!state.updateInfo) return;
    const info = state.updateInfo;
    document.getElementById('modal-version-compare').textContent = 'v' + info.currentVersion + ' ➔ v' + info.latestVersion;
    document.getElementById('update-notes-box').textContent = info.releaseNotes || 'Mejoras de rendimiento y corrección de errores.';
    document.getElementById('update-modal').style.display = 'flex';
  }

  function closeUpdateModal() {
    document.getElementById('update-modal').style.display = 'none';
  }

  document.getElementById('btn-check-updates').addEventListener('click', () => {
    checkAppUpdates(true);
  });

  document.getElementById('btn-update-now').addEventListener('click', () => {
    openUpdateModal();
  });

  document.getElementById('btn-update-dismiss').addEventListener('click', () => {
    document.getElementById('update-banner').style.display = 'none';
  });

  document.getElementById('btn-modal-close').addEventListener('click', closeUpdateModal);
  document.getElementById('btn-modal-later').addEventListener('click', closeUpdateModal);

  document.getElementById('btn-modal-download').addEventListener('click', () => {
    if (!state.updateInfo || !state.updateInfo.apkUrl) return;
    closeUpdateModal();
    showToast('Iniciando descarga de actualización...');

    if (hasBridge && typeof window.AndroidBridge.openUrl === 'function') {
      window.AndroidBridge.openUrl(state.updateInfo.apkUrl);
    } else {
      window.open(state.updateInfo.apkUrl, '_blank');
    }
  });

  // Inicialización
  checkPermissions();
  loadStorageVolumes();
  setTimeout(() => { checkAppUpdates(false); }, 1500);

  // ==========================================
  // SECCIÓN 3: AUDITOR DE NUBES Y COMPARADOR
  // ==========================================
  const btnScanCloud = document.getElementById('btn-scan-cloud-photos');
  const cloudListContainer = document.getElementById('cloud-photos-list');
  const cloudMetricsRow = document.getElementById('cloud-metrics-row');

  btnScanCloud.addEventListener('click', () => {
    btnScanCloud.disabled = true;
    btnScanCloud.innerHTML = '<span>Analizando galería y nubes...</span>';
    showToast('Analizando fotos con metadatos EXIF...');

    setTimeout(() => {
      let data = null;
      const volPath = state.selectedVolume ? state.selectedVolume.path : '';

      if (hasBridge && typeof window.AndroidBridge.scanCloudPhotos === 'function') {
        try {
          const resStr = window.AndroidBridge.scanCloudPhotos(volPath);
          data = JSON.parse(resStr);
        } catch (e) {
          console.error(e);
        }
      }

      btnScanCloud.disabled = false;
      btnScanCloud.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Auditar Fotos y Nubes</span>`;

      if (!data || !data.success) {
        showToast('No se pudieron escanear fotos o no se encontraron.');
        return;
      }

      renderCloudAudit(data);
      showToast(`Auditoría finalizada: ${data.totalPhotosScanned} fotos analizadas.`);
    }, 150);
  });

  function renderCloudAudit(data) {
    cloudMetricsRow.style.display = 'grid';
    document.getElementById('metric-pre-june').textContent = data.preJune2021Count;
    document.getElementById('metric-post-june').textContent = data.postJune2021Count;
    document.getElementById('metric-wasted-size').textContent = formatBytes(data.totalWastedBytes);

    cloudListContainer.innerHTML = '';

    const exact = data.exactDuplicateGroups || [];
    const collisions = data.collisionGroups || [];

    if (exact.length === 0 && collisions.length === 0) {
      cloudListContainer.innerHTML = `<div class="empty-state"><p>¡Excelente! No tienes fotos duplicadas ni colisiones de nombre en esta unidad.</p></div>`;
      return;
    }

    // 1. Mostrar colisiones primero (fotos distintas con el mismo nombre)
    collisions.forEach((group, idx) => {
      const card = document.createElement('div');
      card.className = 'mob-group-card';
      card.style.borderLeft = '4px solid #f59e0b';

      let itemsHtml = '';
      group.files.forEach(f => {
        let thumbSrc = 'img/logo.png';
        if (hasBridge && typeof window.AndroidBridge.getThumbnailBase64 === 'function') {
          const b64 = window.AndroidBridge.getThumbnailBase64(f.path);
          if (b64) thumbSrc = b64;
        }

        itemsHtml += `
          <div class="mob-photo-row">
            <img src="${thumbSrc}" class="mob-photo-thumb" alt="thumb">
            <div class="mob-photo-info">
              <span class="mob-photo-title">${escapeHtml(f.name)}</span>
              <div class="mob-photo-badges">
                <span class="badge-sm" style="color: #38bdf8;">${f.cloudBadge}</span>
                <span class="badge-sm">${formatBytes(f.size)}</span>
                ${f.captureDate ? `<span class="badge-sm" style="color: #a5f3fc;">📷 ${escapeHtml(f.captureDate)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="mob-group-header">
          <span style="color: #fbbf24;">⚠️ Mismo Nombre: "${escapeHtml(group.name)}" (DISTINTAS)</span>
          <button class="btn btn-secondary btn-sm btn-mob-compare">Comparar</button>
        </div>
        <div>${itemsHtml}</div>
      `;

      card.querySelector('.btn-mob-compare').addEventListener('click', () => {
        openMobileComparator(group.files[0], group.files[1], false);
      });

      cloudListContainer.appendChild(card);
    });

    // 2. Mostrar duplicados exactos
    exact.forEach((group, idx) => {
      const card = document.createElement('div');
      card.className = 'mob-group-card';
      card.style.borderLeft = '4px solid #10b981';

      let itemsHtml = '';
      group.files.forEach(f => {
        let thumbSrc = 'img/logo.png';
        if (hasBridge && typeof window.AndroidBridge.getThumbnailBase64 === 'function') {
          const b64 = window.AndroidBridge.getThumbnailBase64(f.path);
          if (b64) thumbSrc = b64;
        }

        const policyBadge = f.isPreJune2021
          ? '<span class="badge-sm" style="color: #34d399;">Google Gratis (Pre-2021)</span>'
          : '<span class="badge-sm" style="color: #fbbf24;">Consume Cuota</span>';

        itemsHtml += `
          <div class="mob-photo-row">
            <img src="${thumbSrc}" class="mob-photo-thumb" alt="thumb">
            <div class="mob-photo-info">
              <span class="mob-photo-title">${escapeHtml(f.name)}</span>
              <div class="mob-photo-badges">
                <span class="badge-sm" style="color: #38bdf8;">${f.cloudBadge}</span>
                <span class="badge-sm">${formatBytes(f.size)}</span>
                ${policyBadge}
              </div>
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="mob-group-header">
          <span>Grupo #${idx + 1} (${group.count} copias idénticas)</span>
          <button class="btn btn-secondary btn-sm btn-mob-compare">Comparar</button>
        </div>
        <div>${itemsHtml}</div>
      `;

      card.querySelector('.btn-mob-compare').addEventListener('click', () => {
        openMobileComparator(group.files[0], group.files[1], true);
      });

      cloudListContainer.appendChild(card);
    });
  }

  // ==========================================
  // MODAL COMPARADOR MÓVIL
  // ==========================================
  const mobCompModal = document.getElementById('mobile-comparator-modal');
  const btnCloseMobComp = document.getElementById('btn-close-mob-comp');
  const btnMobDismiss = document.getElementById('btn-mob-dismiss');
  const btnMobKeepA = document.getElementById('btn-mob-keep-a');
  const btnMobKeepB = document.getElementById('btn-mob-keep-b');

  let activeMobFiles = { a: null, b: null };

  function closeMobComparator() {
    mobCompModal.style.display = 'none';
  }

  btnCloseMobComp.addEventListener('click', closeMobComparator);
  btnMobDismiss.addEventListener('click', closeMobComparator);

  function openMobileComparator(fileA, fileB, isIdentical) {
    activeMobFiles = { a: fileA, b: fileB };

    const status = document.getElementById('mob-comp-status');
    if (isIdentical) {
      status.textContent = '✓ 100% IDÉNTICAS (Mismo archivo / puedes borrar cualquiera)';
      status.style.color = '#34d399';
    } else {
      status.textContent = '⚠️ ¡FOTOS DISTINTAS! (Mismo nombre pero tomas diferentes)';
      status.style.color = '#fbbf24';
    }

    // Cargar thumbnails grandes
    let thumbA = 'img/logo.png';
    let thumbB = 'img/logo.png';
    if (hasBridge && typeof window.AndroidBridge.getThumbnailBase64 === 'function') {
      const a = window.AndroidBridge.getThumbnailBase64(fileA.path);
      const b = window.AndroidBridge.getThumbnailBase64(fileB.path);
      if (a) thumbA = a;
      if (b) thumbB = b;
    }

    document.getElementById('mob-img-a').src = thumbA;
    document.getElementById('mob-name-a').textContent = fileA.name;
    document.getElementById('mob-cloud-a').textContent = fileA.cloudBadge || fileA.cloudName;
    document.getElementById('mob-size-a').textContent = formatBytes(fileA.size);
    document.getElementById('mob-date-a').textContent = fileA.captureDate || 'No detectada';

    document.getElementById('mob-img-b').src = thumbB;
    document.getElementById('mob-name-b').textContent = fileB.name;
    document.getElementById('mob-cloud-b').textContent = fileB.cloudBadge || fileB.cloudName;
    document.getElementById('mob-size-b').textContent = formatBytes(fileB.size);
    document.getElementById('mob-date-b').textContent = fileB.captureDate || 'No detectada';

    mobCompModal.style.display = 'flex';
  }

  btnMobKeepA.addEventListener('click', () => {
    if (!activeMobFiles.b) return;
    if (!confirm(`¿Eliminar Foto B (${activeMobFiles.b.name}) y conservar solo Foto A?`)) return;

    if (hasBridge && typeof window.AndroidBridge.deleteMultipleFiles === 'function') {
      const resStr = window.AndroidBridge.deleteMultipleFiles(JSON.stringify([activeMobFiles.b.path]));
      try {
        const res = JSON.parse(resStr);
        showToast(`Foto descartada (${formatBytes(res.freedBytes)} liberados)`);
      } catch (e) {}
    }
    closeMobComparator();
    btnScanCloud.click();
  });

  btnMobKeepB.addEventListener('click', () => {
    if (!activeMobFiles.a) return;
    if (!confirm(`¿Eliminar Foto A (${activeMobFiles.a.name}) y conservar solo Foto B?`)) return;

    if (hasBridge && typeof window.AndroidBridge.deleteMultipleFiles === 'function') {
      const resStr = window.AndroidBridge.deleteMultipleFiles(JSON.stringify([activeMobFiles.a.path]));
      try {
        const res = JSON.parse(resStr);
        showToast(`Foto descartada (${formatBytes(res.freedBytes)} liberados)`);
      } catch (e) {}
    }
    closeMobComparator();
    btnScanCloud.click();
  });

});
