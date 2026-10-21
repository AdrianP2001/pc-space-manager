// PC Space Manager - Frontend Client Application
document.addEventListener('DOMContentLoaded', () => {
  // Estado global de la aplicación
  const state = {
    currentTab: 'dashboard',
    drives: [],
    systemInfo: null,
    junkScan: null,
    selectedCategories: new Set(),
    dryRun: false,
    analysisData: null,
    duplicatesData: null,
    selectedDuplicates: new Set(),
    emptyFoldersData: null,
    selectedEmptyFolders: new Set(),
    mobileDevice: null,
    mobileScan: null,
    selectedMobileCategories: new Set(),
    mobileDryRun: false
  };

  // Elementos DOM principales
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const toastContainer = document.getElementById('toast-container');
  const terminalLog = document.getElementById('terminal-log-content');

  // Helper de registro en terminal
  function logActivity(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> ${escapeHtml(message)}`;
    terminalLog.appendChild(entry);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  // Notificaciones Toast
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span><strong>${icon}</strong> ${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Formato de bytes a unidades humanas
  function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0.00 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Navegación entre pestañas
  const tabTitles = {
    dashboard: {
      title: 'Panel de Unidades de Almacenamiento',
      subtitle: 'Estado en tiempo real de discos y espacio disponible en tu PC'
    },
    cleaner: {
      title: 'Limpiador Inteligente de Basura',
      subtitle: 'Elimina de forma segura cachés, temporales y volcados basados en Glary Utilities'
    },
    analyzer: {
      title: 'Analizador de Espacio en Disco',
      subtitle: 'Explora qué carpetas y archivos consumen más gigabytes'
    },
    duplicates: {
      title: 'Buscador de Archivos Duplicados',
      subtitle: 'Identifica y libera espacio de copias idénticas con hash SHA-256'
    },
    'empty-folders': {
      title: 'Limpiador de Carpetas Vacías',
      subtitle: 'Depura directorios sin contenido con filtros de seguridad'
    },
    mobile: {
      title: 'Dispositivo Móvil (Samsung / Android)',
      subtitle: 'Auditoría y limpieza de almacenamiento a través de conexión USB de alta velocidad'
    },
    logs: {
      title: 'Registro de Auditoría',
      subtitle: 'Historial detallado de todas las operaciones realizadas'
    }
  };

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchTab(target);
    });
  });

  function switchTab(tabId) {
    state.currentTab = tabId;
    navItems.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    tabPanes.forEach(p => p.classList.toggle('active', p.id === `pane-${tabId}`));
    if (tabTitles[tabId]) {
      pageTitle.textContent = tabTitles[tabId].title;
      pageSubtitle.textContent = tabTitles[tabId].subtitle;
    }
  }

  // ==========================================
  // SECCIÓN 1: PANEL DE UNIDADES
  // ==========================================
  async function loadDrivesAndSystem() {
    try {
      const res = await fetch('/api/system/drives');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.drives = data.drives;
      state.systemInfo = data.system;

      renderDrives(data.drives);
      renderSystemInfo(data.system);
      logActivity(`Unidades cargadas: ${data.drives.map(d => `${d.letter} (${d.usedPercent}% usado)`).join(', ')}`, 'info');
    } catch (err) {
      logActivity(`Error al cargar unidades: ${err.message}`, 'error');
      showToast('No se pudieron consultar las unidades de disco', 'error');
    }
  }

  function renderDrives(drives) {
    const container = document.getElementById('drives-container');
    container.innerHTML = '';

    let hasCriticalDrive = false;

    drives.forEach(drive => {
      const isCritical = drive.usedPercent >= 90 || (drive.letter === 'C:' && drive.freeBytes < 15 * 1024 * 1024 * 1024);
      if (drive.letter === 'C:' && isCritical) {
        hasCriticalDrive = true;
      }

      const card = document.createElement('div');
      card.className = 'drive-card';
      card.innerHTML = `
        <div class="drive-header">
          <div class="drive-title-group">
            <div class="drive-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
            </div>
            <div class="drive-name">
              <h3>${drive.letter} ${escapeHtml(drive.label)}</h3>
              <span>${drive.type === 'Fixed' ? 'Disco Fijo Local' : 'Almacenamiento'}</span>
            </div>
          </div>
          <div class="drive-percent-badge ${isCritical ? 'danger' : 'safe'}">
            ${drive.usedPercent}%
          </div>
        </div>

        <div class="progress-track">
          <div class="progress-fill ${isCritical ? 'danger' : 'normal'}" style="width: ${drive.usedPercent}%"></div>
        </div>

        <div class="drive-footer">
          <span class="free">${formatBytes(drive.freeBytes)} libres</span>
          <span class="total">${formatBytes(drive.totalBytes)} totales</span>
        </div>
      `;

      card.addEventListener('click', () => {
        document.getElementById('analyzer-path-input').value = drive.mount;
        switchTab('analyzer');
        startAnalysis();
      });

      container.appendChild(card);
    });

    const warningBanner = document.getElementById('c-drive-warning');
    if (warningBanner) {
      warningBanner.style.display = hasCriticalDrive ? 'flex' : 'none';
    }
  }

  function renderSystemInfo(sys) {
    if (!sys) return;
    document.getElementById('sys-hostname').textContent = sys.hostname;
    document.getElementById('sys-os').textContent = `${sys.osType} (${sys.arch})`;

    document.getElementById('stat-ram-total').textContent = formatBytes(sys.totalMem);
    document.getElementById('ram-bar').style.width = `${sys.memPercent}%`;
    document.getElementById('stat-ram-detail').textContent = `${formatBytes(sys.usedMem)} en uso (${sys.memPercent}%)`;

    document.getElementById('stat-cpu-model').textContent = sys.cpuModel.split('@')[0].trim();
    document.getElementById('stat-cpu-cores').textContent = `${sys.cpus} núcleos lógicos`;

    document.getElementById('stat-user-os').textContent = sys.user;
    const hours = Math.floor(sys.uptimeSeconds / 3600);
    const mins = Math.floor((sys.uptimeSeconds % 3600) / 60);
    document.getElementById('stat-uptime').textContent = `Encendido hace: ${hours}h ${mins}m`;
  }

  // Papelera de Reciclaje
  async function loadRecycleBin() {
    try {
      const res = await fetch('/api/system/recycle-bin');
      const data = await res.json();
      if (data.success) {
        document.getElementById('recycle-status').textContent = `Papelera: ${formatBytes(data.bytes)} (${data.count} elem.)`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById('btn-empty-recycle').addEventListener('click', async () => {
    if (!confirm('¿Deseas vaciar permanentemente la Papelera de Reciclaje?')) return;
    try {
      const res = await fetch('/api/system/empty-recycle-bin', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Papelera de reciclaje vaciada', 'success');
        logActivity('Papelera de reciclaje vaciada con éxito', 'success');
        loadRecycleBin();
        loadDrivesAndSystem();
      }
    } catch (err) {
      showToast('Error al vaciar la papelera', 'error');
    }
  });

  document.getElementById('btn-refresh-drives').addEventListener('click', () => {
    loadDrivesAndSystem();
    loadRecycleBin();
    showToast('Unidades actualizadas', 'info');
  });

  document.getElementById('btn-quick-clean-c').addEventListener('click', () => {
    switchTab('cleaner');
    startJunkScan();
  });

  // ==========================================
  // SECCIÓN 2: LIMPIADOR INTELIGENTE
  // ==========================================
  const btnScanJunk = document.getElementById('btn-scan-junk');
  const btnCleanJunk = document.getElementById('btn-clean-junk');
  const chkDryRun = document.getElementById('chk-dry-run');

  chkDryRun.addEventListener('change', (e) => {
    state.dryRun = e.target.checked;
    if (state.dryRun) {
      btnCleanJunk.innerHTML = `<span>Simular Limpieza (Sin Borrar)</span>`;
      btnCleanJunk.className = 'btn btn-warning';
    } else {
      btnCleanJunk.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Limpiar Seleccionados</span>`;
      btnCleanJunk.className = 'btn btn-danger';
    }
  });

  btnScanJunk.addEventListener('click', startJunkScan);

  async function startJunkScan() {
    btnScanJunk.disabled = true;
    btnScanJunk.innerHTML = `<span>Escaneando...</span>`;
    logActivity('Iniciando escaneo inteligente de archivos basura y cachés...', 'info');

    try {
      const res = await fetch('/api/cleaner/scan');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.junkScan = data;
      state.selectedCategories.clear();
      data.categories.forEach(c => state.selectedCategories.add(c.id));

      renderCleanerCategories(data.categories);
      updateCleanerTotal();

      btnCleanJunk.disabled = false;
      showToast(`Escaneo finalizado: ${formatBytes(data.totalBytes)} detectados`, 'success');
      logActivity(`Escaneo finalizado: ${formatBytes(data.totalBytes)} en ${data.totalFiles} archivos`, 'success');
    } catch (err) {
      logActivity(`Error durante el escaneo: ${err.message}`, 'error');
      showToast(`Error al escanear: ${err.message}`, 'error');
    } finally {
      btnScanJunk.disabled = false;
      btnScanJunk.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Analizar Basura</span>`;
    }
  }

  function renderCleanerCategories(categories) {
    const container = document.getElementById('categories-container');
    container.innerHTML = '';

    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';

      card.innerHTML = `
        <input type="checkbox" class="cat-checkbox" data-id="${cat.id}" ${state.selectedCategories.has(cat.id) ? 'checked' : ''}>
        <div class="cat-icon-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>
          </svg>
        </div>
        <div class="cat-details">
          <h4>${escapeHtml(cat.name)}</h4>
          <p>${escapeHtml(cat.description)}</p>
          ${cat.sampleItems && cat.sampleItems.length > 0 ? `<button class="btn-view-samples" data-id="${cat.id}">Ver muestras (${cat.sampleItems.length})</button>` : ''}
        </div>
        <div class="cat-stats">
          <span class="cat-size">${formatBytes(cat.totalBytes)}</span>
          <span class="cat-count">${cat.count} archivos</span>
        </div>
      `;

      const chk = card.querySelector('.cat-checkbox');
      chk.addEventListener('change', (e) => {
        if (e.target.checked) state.selectedCategories.add(cat.id);
        else state.selectedCategories.delete(cat.id);
        updateCleanerTotal();
      });

      const btnSamples = card.querySelector('.btn-view-samples');
      if (btnSamples) {
        btnSamples.addEventListener('click', (e) => {
          e.stopPropagation();
          openSamplesModal(cat);
        });
      }

      container.appendChild(card);
    });
  }

  function updateCleanerTotal() {
    if (!state.junkScan) return;
    let totalBytes = 0;
    let totalFiles = 0;

    state.junkScan.categories.forEach(c => {
      if (state.selectedCategories.has(c.id)) {
        totalBytes += c.totalBytes;
        totalFiles += c.count;
      }
    });

    document.getElementById('junk-total-size').textContent = formatBytes(totalBytes);
    document.getElementById('junk-total-files').textContent = `${totalFiles} archivos seleccionados`;
    btnCleanJunk.disabled = state.selectedCategories.size === 0;
  }

  document.getElementById('btn-select-all-cats').addEventListener('click', () => {
    if (!state.junkScan) return;
    state.junkScan.categories.forEach(c => state.selectedCategories.add(c.id));
    document.querySelectorAll('.cat-checkbox').forEach(cb => cb.checked = true);
    updateCleanerTotal();
  });

  document.getElementById('btn-deselect-all-cats').addEventListener('click', () => {
    state.selectedCategories.clear();
    document.querySelectorAll('.cat-checkbox').forEach(cb => cb.checked = false);
    updateCleanerTotal();
  });

  btnCleanJunk.addEventListener('click', async () => {
    const isDry = state.dryRun;
    const catList = Array.from(state.selectedCategories);
    if (catList.length === 0) return;

    const confirmMsg = isDry 
      ? '¿Iniciar simulación de limpieza? (No se borrará ningún archivo)'
      : '¿Estás seguro de eliminar los archivos de las categorías seleccionadas?';

    if (!confirm(confirmMsg)) return;

    btnCleanJunk.disabled = true;
    btnCleanJunk.innerHTML = `<span>Procesando limpieza...</span>`;

    logActivity(`Ejecutando limpieza (${isDry ? 'Modo Simulación' : 'Eliminación Real'})...`, 'warning');

    try {
      const res = await fetch('/api/cleaner/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: catList, dryRun: isDry })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const msg = isDry
        ? `Simulación finalizada: Se habrían liberado ${formatBytes(data.freedBytes)} (${data.freedFiles} archivos).`
        : `¡Limpieza completada! Se liberaron ${formatBytes(data.freedBytes)} (${data.freedFiles} archivos borrados).`;

      showToast(msg, 'success');
      logActivity(msg, 'success');

      if (!isDry) {
        loadDrivesAndSystem();
        loadRecycleBin();
        startJunkScan();
      }
    } catch (err) {
      logActivity(`Error en la limpieza: ${err.message}`, 'error');
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnCleanJunk.disabled = false;
      btnCleanJunk.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Limpiar Seleccionados</span>`;
    }
  });

  // Modal de muestras
  const modal = document.getElementById('sample-modal');
  document.getElementById('modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  function openSamplesModal(cat) {
    document.getElementById('modal-category-title').textContent = `Muestras: ${cat.name}`;
    const tbody = document.getElementById('modal-tbody');
    tbody.innerHTML = '';

    (cat.sampleItems || []).forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="file-name-cell">${escapeHtml(item.name)}</td>
        <td class="file-size-cell">${formatBytes(item.size)}</td>
        <td class="file-path-cell" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-reveal" data-path="${escapeHtml(item.path)}">Abrir</button>
        </td>
      `;
      tr.querySelector('.btn-reveal').addEventListener('click', () => revealPath(item.path));
      tbody.appendChild(tr);
    });

    modal.style.display = 'flex';
  }

  // ==========================================
  // SECCIÓN 3: ANALIZADOR DE DISCO
  // ==========================================
  const btnStartAnalysis = document.getElementById('btn-start-analysis');
  const analyzerPathInput = document.getElementById('analyzer-path-input');

  async function loadQuickPaths() {
    try {
      const res = await fetch('/api/system/quick-paths');
      const data = await res.json();
      if (!data.success) return;

      const chipsWrap = document.getElementById('quick-paths-chips');
      data.quickPaths.forEach(qp => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = qp.label;
        chip.addEventListener('click', () => {
          analyzerPathInput.value = qp.path;
          startAnalysis();
        });
        chipsWrap.appendChild(chip);
      });
    } catch (e) {
      console.error(e);
    }
  }

  btnStartAnalysis.addEventListener('click', startAnalysis);

  async function startAnalysis() {
    const targetPath = analyzerPathInput.value.trim();
    if (!targetPath) return;

    btnStartAnalysis.disabled = true;
    btnStartAnalysis.innerHTML = `<span>Analizando árbol...</span>`;
    logActivity(`Analizando árbol de archivos en: ${targetPath}...`, 'info');

    try {
      const res = await fetch('/api/analyzer/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, maxDepth: 5 })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.analysisData = data;
      renderAnalysisResults(data);
      showToast('Análisis de espacio finalizado', 'success');
      logActivity(`Análisis finalizado: ${formatBytes(data.totalBytes)} en ${data.totalFiles} archivos`, 'success');
    } catch (err) {
      logActivity(`Error en análisis de disco: ${err.message}`, 'error');
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnStartAnalysis.disabled = false;
      btnStartAnalysis.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Iniciar Análisis</span>`;
    }
  }

  function renderAnalysisResults(data) {
    document.getElementById('analysis-results').style.display = 'block';
    document.getElementById('an-total-bytes').textContent = formatBytes(data.totalBytes);
    document.getElementById('an-total-files').textContent = data.totalFiles.toLocaleString();
    document.getElementById('an-total-folders').textContent = data.totalFolders.toLocaleString();

    // Barra de categorías
    const bar = document.getElementById('dist-stacked-bar');
    const legend = document.getElementById('dist-legend');
    bar.innerHTML = '';
    legend.innerHTML = '';

    data.categories.forEach(cat => {
      if (cat.percent > 0) {
        const seg = document.createElement('div');
        seg.className = 'dist-segment';
        seg.style.width = `${cat.percent}%`;
        seg.style.backgroundColor = cat.color;
        seg.title = `${cat.name}: ${formatBytes(cat.bytes)} (${cat.percent}%)`;
        bar.appendChild(seg);

        const leg = document.createElement('div');
        leg.className = 'legend-item';
        leg.innerHTML = `
          <div class="legend-color" style="background-color: ${cat.color}"></div>
          <span><strong>${cat.name}</strong> (${cat.percent}% - ${formatBytes(cat.bytes)})</span>
        `;
        legend.appendChild(leg);
      }
    });

    // Top archivos más pesados
    const filesTbody = document.getElementById('top-files-tbody');
    filesTbody.innerHTML = '';

    data.topFiles.forEach(file => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="file-name-cell" title="${escapeHtml(file.name)}"><strong>${escapeHtml(file.name)}</strong></td>
        <td><span class="cat-tag" style="background: rgba(255,255,255,0.06)">${file.category}</span></td>
        <td class="file-size-cell">${formatBytes(file.size)}</td>
        <td class="file-path-cell" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-reveal" data-path="${escapeHtml(file.path)}">Abrir en Explorador</button>
        </td>
      `;
      tr.querySelector('.btn-reveal').addEventListener('click', () => revealPath(file.path));
      filesTbody.appendChild(tr);
    });

    // Subcarpetas más pesadas
    const foldersTbody = document.getElementById('top-folders-tbody');
    foldersTbody.innerHTML = '';

    data.topSubfolders.forEach(sf => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(sf.name)}</strong></td>
        <td class="file-size-cell">${formatBytes(sf.bytes)}</td>
        <td>${sf.percent}%</td>
        <td class="file-path-cell" title="${escapeHtml(sf.path)}">${escapeHtml(sf.path)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-inspect-sub" data-path="${escapeHtml(sf.path)}">Inspeccionar</button>
        </td>
      `;
      tr.querySelector('.btn-inspect-sub').addEventListener('click', () => {
        analyzerPathInput.value = sf.path;
        startAnalysis();
      });
      foldersTbody.appendChild(tr);
    });
  }

  // Subtabs en análisis
  document.querySelectorAll('.subtab').forEach(st => {
    st.addEventListener('click', () => {
      document.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      st.classList.add('active');
      document.getElementById(st.dataset.subtab).classList.add('active');
    });
  });

  // ==========================================
  // SECCIÓN 4: DUPLICADOS
  // ==========================================
  const btnScanDup = document.getElementById('btn-scan-duplicates');
  const btnCleanDup = document.getElementById('btn-clean-duplicates');
  const dupPathInput = document.getElementById('dup-path-input');

  btnScanDup.addEventListener('click', async () => {
    const targetPath = dupPathInput.value.trim();
    if (!targetPath) return;

    btnScanDup.disabled = true;
    btnScanDup.innerHTML = `<span>Buscando duplicados...</span>`;
    logActivity(`Buscando archivos duplicados en: ${targetPath}...`, 'info');

    try {
      const res = await fetch('/api/duplicates/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath, minSizeBytes: 10240 })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.duplicatesData = data;
      renderDuplicates(data);
      showToast(`Duplicados encontrados: ${formatBytes(data.totalWastedBytes)} recuperables`, 'success');
      logActivity(`Encontrados ${data.duplicateGroupsCount} grupos de duplicados (${formatBytes(data.totalWastedBytes)} desperdiciados)`, 'success');
    } catch (err) {
      logActivity(`Error al buscar duplicados: ${err.message}`, 'error');
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnScanDup.disabled = false;
      btnScanDup.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Buscar Duplicados</span>`;
    }
  });

  function renderDuplicates(data) {
    const container = document.getElementById('duplicates-container');
    const summaryBar = document.getElementById('dup-summary-bar');
    container.innerHTML = '';

    if (data.duplicateGroupsCount === 0) {
      summaryBar.style.display = 'none';
      container.innerHTML = `<div class="empty-state"><p>No se encontraron archivos duplicados en este directorio.</p></div>`;
      return;
    }

    summaryBar.style.display = 'flex';
    document.getElementById('dup-groups-count').textContent = data.duplicateGroupsCount;
    document.getElementById('dup-wasted-size').textContent = formatBytes(data.totalWastedBytes);

    state.selectedDuplicates.clear();

    data.groups.forEach((group, idx) => {
      const card = document.createElement('div');
      card.className = 'duplicate-group-card';

      let itemsHtml = '';
      group.files.forEach((file, fIdx) => {
        // Por defecto pre-seleccionar todos menos el primer archivo (para conservar uno seguro)
        const isSelected = fIdx > 0;
        if (isSelected) state.selectedDuplicates.add(file.path);

        itemsHtml += `
          <div class="dup-item-row">
            <input type="checkbox" class="dup-check" data-path="${escapeHtml(file.path)}" ${isSelected ? 'checked' : ''}>
            <span class="path" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</span>
            <span class="file-size-cell">${formatBytes(file.size)}</span>
            <button class="btn btn-secondary btn-sm btn-reveal" data-path="${escapeHtml(file.path)}">Abrir</button>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="dup-group-header">
          <strong>Grupo #${idx + 1} (${group.count} copias idénticas - ${formatBytes(group.size)} c/u)</strong>
          <span class="text-gradient">Espacio recuperable: ${formatBytes(group.wastedBytes)}</span>
        </div>
        <div class="dup-group-items">${itemsHtml}</div>
      `;

      card.querySelectorAll('.dup-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
          if (e.target.checked) state.selectedDuplicates.add(cb.dataset.path);
          else state.selectedDuplicates.delete(cb.dataset.path);
          btnCleanDup.disabled = state.selectedDuplicates.size === 0;
        });
      });

      card.querySelectorAll('.btn-reveal').forEach(btn => {
        btn.addEventListener('click', () => revealPath(btn.dataset.path));
      });

      container.appendChild(card);
    });

    btnCleanDup.disabled = state.selectedDuplicates.size === 0;
  }

  btnCleanDup.addEventListener('click', async () => {
    const files = Array.from(state.selectedDuplicates);
    if (files.length === 0) return;

    if (!confirm(`¿Eliminar ${files.length} copias duplicadas seleccionadas?`)) return;

    try {
      const res = await fetch('/api/duplicates/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, dryRun: false })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(`¡Duplicados eliminados! Se liberaron ${formatBytes(data.freedBytes)}`, 'success');
      logActivity(`Eliminados ${data.deletedFiles} archivos duplicados, liberados ${formatBytes(data.freedBytes)}`, 'success');
      loadDrivesAndSystem();
      btnScanDup.click();
    } catch (err) {
      showToast(`Error al borrar duplicados: ${err.message}`, 'error');
    }
  });

  // ==========================================
  // SECCIÓN 5: CARPETAS VACÍAS
  // ==========================================
  const btnScanEmpty = document.getElementById('btn-scan-empty');
  const btnCleanEmpty = document.getElementById('btn-clean-empty');
  const emptyPathInput = document.getElementById('empty-path-input');

  btnScanEmpty.addEventListener('click', async () => {
    const targetPath = emptyPathInput.value.trim();
    if (!targetPath) return;

    btnScanEmpty.disabled = true;
    btnScanEmpty.innerHTML = `<span>Buscando carpetas...</span>`;
    logActivity(`Buscando carpetas vacías en: ${targetPath}...`, 'info');

    try {
      const res = await fetch('/api/empty-folders/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.emptyFoldersData = data;
      renderEmptyFolders(data);
      showToast(`Carpetas vacías encontradas: ${data.count}`, 'success');
      logActivity(`Encontradas ${data.count} carpetas vacías`, 'info');
    } catch (err) {
      logActivity(`Error en escaneo de carpetas: ${err.message}`, 'error');
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnScanEmpty.disabled = false;
      btnScanEmpty.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Buscar Carpetas Vacías</span>`;
    }
  });

  function renderEmptyFolders(data) {
    const container = document.getElementById('empty-folders-container');
    const summaryBar = document.getElementById('empty-summary-bar');
    container.innerHTML = '';

    if (data.count === 0) {
      summaryBar.style.display = 'none';
      container.innerHTML = `<div class="empty-state"><p>No se encontraron carpetas vacías en este directorio.</p></div>`;
      return;
    }

    summaryBar.style.display = 'flex';
    document.getElementById('empty-count').textContent = data.count;
    state.selectedEmptyFolders = new Set(data.folders.map(f => f.path));

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-responsive';
    tableWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Carpeta Vacía</th>
            <th>Ubicación</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody id="empty-folders-tbody"></tbody>
      </table>
    `;

    const tbody = tableWrap.querySelector('#empty-folders-tbody');
    data.folders.forEach(folder => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(folder.name)}</strong></td>
        <td class="file-path-cell" title="${escapeHtml(folder.path)}">${escapeHtml(folder.path)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-reveal" data-path="${escapeHtml(folder.path)}">Abrir</button>
        </td>
      `;
      tr.querySelector('.btn-reveal').addEventListener('click', () => revealPath(folder.path));
      tbody.appendChild(tr);
    });

    container.appendChild(tableWrap);
    btnCleanEmpty.disabled = false;
  }

  btnCleanEmpty.addEventListener('click', async () => {
    const folders = Array.from(state.selectedEmptyFolders);
    if (folders.length === 0) return;

    if (!confirm(`¿Eliminar las ${folders.length} carpetas vacías detectadas?`)) return;

    try {
      const res = await fetch('/api/empty-folders/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folders, dryRun: false })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(`Se eliminaron ${data.removedCount} carpetas vacías`, 'success');
      logActivity(`Eliminadas ${data.removedCount} carpetas vacías`, 'success');
      btnScanEmpty.click();
    } catch (err) {
      showToast(`Error al eliminar carpetas: ${err.message}`, 'error');
    }
  });

  // ==========================================
  // HELPER: REVELAR EN EXPLORADOR
  // ==========================================
  async function revealPath(targetPath) {
    try {
      await fetch('/api/system/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
    } catch (e) {
      console.error(e);
    }
  }

  
  // ==========================================
  // SECCIÓN MÓVIL: SAMSUNG & ANDROID VIA ADB
  // ==========================================
  const btnRefreshMobile = document.getElementById('btn-refresh-mobile');
  const btnScanMobile = document.getElementById('btn-scan-mobile');
  const btnCleanMobile = document.getElementById('btn-clean-mobile');
  const btnBackupMobile = document.getElementById('btn-backup-mobile');
  const chkMobileDryRun = document.getElementById('chk-mobile-dry-run');

  async function checkMobileStatus() {
    try {
      const res = await fetch('/api/mobile/status');
      const data = await res.json();
      renderMobileStatus(data);
    } catch (err) {
      console.error(err);
    }
  }

  function renderMobileStatus(data) {
    const nameEl = document.getElementById('mobile-device-name');
    const detailsEl = document.getElementById('mobile-device-details');
    const helpBanner = document.getElementById('mobile-help-banner');
    const storageBox = document.getElementById('mobile-storage-box');
    const scanHero = document.getElementById('mobile-scan-hero');

    if (!data.connected || data.devices.length === 0) {
      nameEl.textContent = 'Ningún teléfono detectado por USB';
      detailsEl.textContent = 'Conecta tu Samsung con el cable USB y activa la Depuración por USB';
      helpBanner.style.display = 'flex';
      storageBox.style.display = 'none';
      scanHero.style.display = 'none';
      state.mobileDevice = null;
      return;
    }

    const device = data.devices[0];
    state.mobileDevice = device;

    if (!device.authorized) {
      nameEl.textContent = device.name;
      detailsEl.textContent = 'Esperando confirmación en la pantalla del celular...';
      helpBanner.style.display = 'flex';
      document.getElementById('mobile-help-title').textContent = '⚠️ Requiere autorización en tu teléfono:';
      document.getElementById('mobile-help-text').innerHTML = 'Desbloquea la pantalla de tu Samsung. Te aparecerá un diálogo con el título: <strong>"¿Permitir depuración por USB desde esta computadora?"</strong>. Marca la casilla <em>"Permitir siempre"</em> y pulsa <strong>Permitir</strong>.';
      storageBox.style.display = 'none';
      scanHero.style.display = 'none';
      return;
    }

    // Dispositivo conectado y autorizado con éxito
    nameEl.textContent = `${device.manufacturer} ${device.model}`;
    detailsEl.textContent = `${device.androidVersion} — Conexión directa USB establecida (Serial: ${device.serial})`;
    helpBanner.style.display = 'none';

    // Barra de almacenamiento
    if (device.storage && device.storage.totalBytes > 0) {
      storageBox.style.display = 'block';
      const st = device.storage;
      document.getElementById('mobile-storage-text').textContent = `${formatBytes(st.usedBytes)} usados / ${formatBytes(st.totalBytes)} totales (${st.percent}%)`;
      const bar = document.getElementById('mobile-storage-bar');
      bar.style.width = `${st.percent}%`;
      bar.className = st.percent >= 90 ? 'progress-fill danger' : 'progress-fill normal';
    }

    scanHero.style.display = 'flex';
    logActivity(`Dispositivo móvil conectado: ${device.manufacturer} ${device.model} (${device.androidVersion})`, 'success');
  }

  btnRefreshMobile.addEventListener('click', () => {
    checkMobileStatus();
    showToast('Consultando estado del teléfono...', 'info');
  });

  chkMobileDryRun.addEventListener('change', (e) => {
    state.mobileDryRun = e.target.checked;
    if (state.mobileDryRun) {
      btnCleanMobile.innerHTML = '<span>Simular Limpieza Móvil</span>';
      btnCleanMobile.className = 'btn btn-warning';
    } else {
      btnCleanMobile.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Eliminar Seleccionados</span>';
      btnCleanMobile.className = 'btn btn-danger';
    }
  });

  btnScanMobile.addEventListener('click', async () => {
    if (!state.mobileDevice || !state.mobileDevice.authorized) {
      showToast('Por favor autoriza la depuración USB en tu teléfono primero', 'error');
      return;
    }

    btnScanMobile.disabled = true;
    btnScanMobile.innerHTML = '<span>Inspeccionando almacenamiento...</span>';
    logActivity('Iniciando auditoría rápida de carpetas de WhatsApp, Cámara y Descargas en Android...', 'info');

    try {
      const res = await fetch('/api/mobile/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: state.mobileDevice.serial })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      state.mobileScan = data;
      state.selectedMobileCategories.clear();
      data.categories.forEach(c => {
        if (c.recommendedAction === 'clean') {
          state.selectedMobileCategories.add(c.id);
        }
      });

      renderMobileCategories(data.categories);
      renderMobileHeavyFiles(data.topHeavyFiles);
      updateMobileTotals();

      btnCleanMobile.disabled = false;
      btnBackupMobile.disabled = false;
      showToast(`Auditoría móvil finalizada: ${formatBytes(data.cleanableBytes)} recuperables`, 'success');
      logActivity(`Auditoría finalizada: ${formatBytes(data.grandTotalBytes)} analizados en el celular`, 'success');
    } catch (err) {
      logActivity(`Error en análisis móvil: ${err.message}`, 'error');
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnScanMobile.disabled = false;
      btnScanMobile.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><span>Analizar Almacenamiento Móvil</span>';
    }
  });

  function renderMobileCategories(categories) {
    const grid = document.getElementById('mobile-categories-grid');
    grid.style.display = 'grid';
    grid.innerHTML = '';

    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';

      card.innerHTML = `
        <input type="checkbox" class="cat-checkbox" data-id="${cat.id}" ${state.selectedMobileCategories.has(cat.id) ? 'checked' : ''}>
        <div class="cat-icon-wrap" style="color: ${cat.recommendedAction === 'clean' ? '#f87171' : '#38bdf8'}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
        </div>
        <div class="cat-details">
          <h4>${escapeHtml(cat.name)}</h4>
          <p>${escapeHtml(cat.description)}</p>
          <small style="color: var(--text-dim); font-family: var(--font-mono);">${escapeHtml(cat.path)}</small>
        </div>
        <div class="cat-stats">
          <span class="cat-size">${formatBytes(cat.totalBytes)}</span>
          <span class="cat-count">${cat.count} archivos</span>
        </div>
      `;

      const chk = card.querySelector('.cat-checkbox');
      chk.addEventListener('change', (e) => {
        if (e.target.checked) state.selectedMobileCategories.add(cat.id);
        else state.selectedMobileCategories.delete(cat.id);
        updateMobileTotals();
      });

      grid.appendChild(card);
    });
  }

  function renderMobileHeavyFiles(files) {
    const card = document.getElementById('mobile-heavy-card');
    const tbody = document.getElementById('mobile-heavy-tbody');
    const badge = document.getElementById('mobile-heavy-badge');

    if (!files || files.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    badge.textContent = `${files.length} archivos grandes`;
    tbody.innerHTML = '';

    files.forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="file-name-cell"><strong>${escapeHtml(f.name)}</strong></td>
        <td class="file-size-cell" style="color: #f87171;">${formatBytes(f.size)}</td>
        <td class="file-path-cell" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function updateMobileTotals() {
    if (!state.mobileScan) return;
    let totalBytes = 0;
    let count = 0;

    state.mobileScan.categories.forEach(c => {
      if (state.selectedMobileCategories.has(c.id)) {
        totalBytes += c.totalBytes;
        count++;
      }
    });

    document.getElementById('mobile-recoverable-size').textContent = formatBytes(totalBytes);
    document.getElementById('mobile-categories-count').textContent = `${count} categorías seleccionadas`;
    btnCleanMobile.disabled = state.selectedMobileCategories.size === 0;
    btnBackupMobile.disabled = state.selectedMobileCategories.size === 0;
  }

  btnCleanMobile.addEventListener('click', async () => {
    const isDry = state.mobileDryRun;
    const catList = Array.from(state.selectedMobileCategories);
    if (catList.length === 0) return;

    const confirmMsg = isDry 
      ? '¿Simular la limpieza en el teléfono? (No se borrará ningún archivo)'
      : '¿Eliminar permanentemente los archivos de las categorías seleccionadas en tu teléfono?';

    if (!confirm(confirmMsg)) return;

    btnCleanMobile.disabled = true;
    try {
      const res = await fetch('/api/mobile/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: state.mobileDevice.serial,
          categories: catList,
          dryRun: isDry
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const msg = isDry
        ? `Simulación: Se habrían liberado ${formatBytes(data.freedBytes)} en el celular.`
        : `¡Limpieza en el móvil completada! Se liberaron ${formatBytes(data.freedBytes)} de memoria.`;

      showToast(msg, 'success');
      logActivity(msg, 'success');
      if (!isDry) {
        checkMobileStatus();
        btnScanMobile.click();
      }
    } catch (err) {
      showToast(`Error al limpiar celular: ${err.message}`, 'error');
    } finally {
      btnCleanMobile.disabled = false;
    }
  });

  btnBackupMobile.addEventListener('click', async () => {
    const catList = Array.from(state.selectedMobileCategories);
    if (catList.length === 0) return;

    const backupDir = 'D:\\Backup_Samsung';
    if (!confirm(`¿Mover los archivos seleccionados a tu PC en "${backupDir}" y luego liberarlos del teléfono?`)) return;

    btnBackupMobile.disabled = true;
    btnBackupMobile.innerHTML = '<span>Transfiriendo a PC...</span>';
    logActivity(`Iniciando respaldo de archivos seleccionados a ${backupDir}...`, 'info');

    try {
      let totalBackedUp = 0;
      for (const catId of catList) {
        const cat = state.mobileScan.categories.find(c => c.id === catId);
        if (!cat || !cat.path) continue;

        const res = await fetch('/api/mobile/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial: state.mobileDevice.serial,
            remotePath: cat.path,
            localDir: `${backupDir}\\${cat.id}`,
            dryRun: false
          })
        });
        const data = await res.json();
        if (data.success) totalBackedUp++;
      }

      showToast(`¡Respaldo completado en ${backupDir} y espacio liberado del móvil!`, 'success');
      logActivity(`Respaldo exitoso en ${backupDir}. Espacio en el teléfono liberado.`, 'success');
      checkMobileStatus();
      btnScanMobile.click();
    } catch (err) {
      showToast(`Error en el respaldo: ${err.message}`, 'error');
    } finally {
      btnBackupMobile.disabled = false;
      btnBackupMobile.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Mover a PC (Disco D:)</span>';
    }
  });

  // Registro de auditoría
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    terminalLog.innerHTML = `<div class="log-entry info"><span class="log-time">[${new Date().toLocaleTimeString()}]</span> Registro reiniciado.</div>`;
  });

  // Inicialización
  loadDrivesAndSystem();
  loadRecycleBin();
  loadQuickPaths();

  // Rutas por defecto en los inputs
  setTimeout(() => {
    if (state.systemInfo) {
      dupPathInput.value = `${state.systemInfo.homeDir}\\Downloads`;
      emptyPathInput.value = state.systemInfo.homeDir;
    }
  }, 1000);
});
