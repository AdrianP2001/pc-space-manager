document.addEventListener('DOMContentLoaded', () => {
  const state = {
    overview: null,
    scanData: null,
    selectedCategories: new Set(),
    dryRun: false
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
    loadStorageOverview();
  };

  // Cargar resumen de almacenamiento
  function loadStorageOverview() {
    if (!hasBridge) {
      renderOverview({
        success: true,
        deviceModel: 'Samsung Galaxy (Demo)',
        androidVersion: 'Android 14',
        usedBytes: 85 * 1024 * 1024 * 1024,
        totalBytes: 128 * 1024 * 1024 * 1024,
        freeBytes: 43 * 1024 * 1024 * 1024,
        percent: 66
      });
      return;
    }

    try {
      const resStr = window.AndroidBridge.getStorageOverview();
      const data = JSON.parse(resStr);
      if (data.success) renderOverview(data);
    } catch (e) {
      console.error(e);
    }
  }

  function renderOverview(data) {
    state.overview = data;
    document.getElementById('device-model').textContent = data.deviceModel;
    document.getElementById('android-version').textContent = data.androidVersion;
    document.getElementById('storage-percent-badge').textContent = data.percent + '%';
    document.getElementById('storage-fill').style.width = data.percent + '%';
    document.getElementById('storage-used').textContent = formatBytes(data.usedBytes) + ' usados';
    document.getElementById('storage-free').textContent = formatBytes(data.freeBytes) + ' libres';
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

  // Escanear
  const btnScan = document.getElementById('btn-scan');
  const btnClean = document.getElementById('btn-clean');
  const chkDryRun = document.getElementById('chk-dry-run');

  chkDryRun.addEventListener('change', (e) => {
    state.dryRun = e.target.checked;
    btnClean.className = state.dryRun ? 'btn btn-warning' : 'btn btn-danger';
  });

  btnScan.addEventListener('click', () => {
    btnScan.disabled = true;
    btnScan.innerHTML = '<span>Escaneando...</span>';

    setTimeout(() => {
      if (!hasBridge) {
        showToast('Escaneo completado (Modo Demo)');
        btnScan.disabled = false;
        btnScan.innerHTML = '<span>Escanear Teléfono</span>';
        return;
      }

      try {
        const jsonStr = window.AndroidBridge.scanCategories();
        const data = JSON.parse(jsonStr);

        if (data.success) {
          state.scanData = data;
          state.selectedCategories.clear();
          data.categories.forEach(c => {
            if (c.action === 'clean') state.selectedCategories.add(c.id);
          });
          renderCategories(data.categories);
          updateTotal();
          btnClean.disabled = false;
          showToast('Escaneo finalizado con éxito');
        }

        // Cargar archivos pesados
        const heavyStr = window.AndroidBridge.getHeavyFiles();
        const heavyData = JSON.parse(heavyStr);
        if (heavyData.success) {
          renderHeavyFiles(heavyData.files);
        }
      } catch (err) {
        showToast('Error: ' + err.message);
      } finally {
        btnScan.disabled = false;
        btnScan.innerHTML = '<span>Escanear Teléfono</span>';
      }
    }, 100);
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
      list.innerHTML = '<div class="empty-state"><p>No se encontraron archivos > 30 MB.</p></div>';
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

  btnClean.addEventListener('click', () => {
    const isDry = state.dryRun;
    const msg = isDry
      ? '¿Iniciar simulación de limpieza? (No se borrará nada)'
      : '¿Eliminar permanentemente los archivos de las categorías seleccionadas?';

    if (!confirm(msg)) return;

    if (!hasBridge) {
      showToast('Limpieza completada (Modo Demo)');
      return;
    }

    let totalFreed = 0;
    state.selectedCategories.forEach(catId => {
      const resStr = window.AndroidBridge.cleanCategory(catId, isDry);
      const res = JSON.parse(resStr);
      if (res.success) totalFreed += res.freedBytes;
    });

    const finishMsg = isDry
      ? 'Simulación: Se habrían liberado ' + formatBytes(totalFreed)
      : '¡Listo! Se liberaron ' + formatBytes(totalFreed) + ' de almacenamiento';

    showToast(finishMsg);
    loadStorageOverview();
    if (!isDry) btnScan.click();
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    checkPermissions();
    loadStorageOverview();
    showToast('Actualizado');
  });

  checkPermissions();
  loadStorageOverview();
});
