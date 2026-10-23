// ==========================================
// Simulated File Manager - Frontend Logic
// ==========================================

const ROOT_ID = 1;

// --- Retro Sound Engine (Web Audio API) ---

const sfx = (() => {
  let ctx;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type = 'square', vol = 0.15, delay = 0) {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + delay);
    osc.stop(c.currentTime + delay + duration);
  }

  function noise(duration, vol = 0.08) {
    const c = getCtx();
    const bufSize = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
  }

  return {
    click() { tone(800, 0.06, 'square', 0.12); tone(600, 0.04, 'square', 0.08, 0.03); },
    select() { tone(1200, 0.04, 'square', 0.08); },
    open() { tone(500, 0.08, 'square', 0.12); tone(700, 0.08, 'square', 0.12, 0.06); tone(900, 0.1, 'square', 0.10, 0.12); },
    navigate() { tone(400, 0.06, 'square', 0.10); tone(600, 0.06, 'square', 0.10, 0.05); },
    back() { tone(600, 0.06, 'square', 0.10); tone(400, 0.06, 'square', 0.10, 0.05); },
    create() { tone(600, 0.08, 'square', 0.12); tone(800, 0.08, 'square', 0.12, 0.08); tone(1000, 0.12, 'triangle', 0.10, 0.16); },
    rename() { tone(500, 0.06, 'triangle', 0.12); tone(650, 0.08, 'triangle', 0.10, 0.06); },
    del() { tone(400, 0.1, 'sawtooth', 0.10); tone(250, 0.15, 'sawtooth', 0.10, 0.08); noise(0.08, 0.06); },
    error() { tone(200, 0.12, 'square', 0.15); tone(150, 0.18, 'square', 0.12, 0.10); },
    modalOpen() { tone(700, 0.05, 'triangle', 0.08); tone(900, 0.06, 'triangle', 0.08, 0.04); },
    modalClose() { tone(600, 0.05, 'triangle', 0.06); tone(400, 0.06, 'triangle', 0.06, 0.04); },
    gameStop() { tone(300, 0.08, 'square', 0.15); tone(200, 0.15, 'square', 0.12, 0.06); noise(0.12, 0.10); },
    gamePerfect() {
      tone(523, 0.1, 'square', 0.14);
      tone(659, 0.1, 'square', 0.14, 0.1);
      tone(784, 0.1, 'square', 0.14, 0.2);
      tone(1047, 0.2, 'square', 0.16, 0.3);
      tone(784, 0.08, 'triangle', 0.10, 0.35);
      tone(1047, 0.3, 'triangle', 0.12, 0.4);
    },
    gameGood() { tone(523, 0.08, 'square', 0.12); tone(659, 0.08, 'square', 0.12, 0.08); tone(784, 0.15, 'square', 0.12, 0.16); },
    gameBad() { tone(350, 0.12, 'sawtooth', 0.10); tone(250, 0.2, 'sawtooth', 0.10, 0.10); },
    gameRetry() { tone(400, 0.06, 'square', 0.10); tone(500, 0.06, 'square', 0.10, 0.05); tone(600, 0.06, 'square', 0.10, 0.10); },
    viewToggle() { tone(900, 0.04, 'square', 0.08); tone(1100, 0.04, 'square', 0.08, 0.04); },
  };
})();

let TRASH_ID = null;

const state = {
  currentFolderId: ROOT_ID,
  selectedItems: new Set(),
  viewMode: 'grid',
  history: [],
  historyIndex: -1,
  folderTree: {}
};

// --- API Helpers ---

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

async function apiPut(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }
  return res.json();
}

// --- SVG Icons ---

function folderIcon(size = 40, name = '') {
  if (name.toLowerCase() === 'trash') return trashIcon(size);
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff6600"/><stop offset="100%" stop-color="#ff00cc"/></linearGradient></defs>
    <rect x="2" y="8" width="28" height="20" rx="0" fill="url(#fg)" stroke="#cc0066" stroke-width="1.5"/>
    <rect x="2" y="4" width="12" height="7" rx="0" fill="#ff8800" stroke="#cc0066" stroke-width="1.5"/>
    <rect x="4" y="11" width="24" height="2" fill="#ffcc66" opacity="0.6"/>
  </svg>`;
}

function trashIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <rect x="6" y="6" width="20" height="2" rx="1" fill="#888" stroke="#666" stroke-width="0.5"/>
    <rect x="12" y="4" width="8" height="3" rx="1" fill="none" stroke="#888" stroke-width="1"/>
    <path d="M8 8 L10 28 L22 28 L24 8 Z" fill="#333" stroke="#888" stroke-width="1"/>
    <line x1="12" y1="11" x2="12.5" y2="25" stroke="#666" stroke-width="1"/>
    <line x1="16" y1="11" x2="16" y2="25" stroke="#666" stroke-width="1"/>
    <line x1="20" y1="11" x2="19.5" y2="25" stroke="#666" stroke-width="1"/>
    <text x="16" y="31.5" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3" fill="#888">TRASH</text>
  </svg>`;
}

function gameIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <!-- controller body -->
    <rect x="3" y="10" width="26" height="14" rx="3" fill="#8844CC" stroke="#5522AA" stroke-width="1.5"/>
    <rect x="6" y="8" width="20" height="4" rx="2" fill="#9955DD" stroke="#5522AA" stroke-width="1"/>
    <!-- d-pad -->
    <rect x="8" y="15" width="6" height="2" fill="#FFDD00"/>
    <rect x="10" y="13" width="2" height="6" fill="#FFDD00"/>
    <!-- buttons -->
    <circle cx="22" cy="14" r="1.8" fill="#FF4444"/>
    <circle cx="25" cy="16" r="1.8" fill="#44CC44"/>
    <!-- bottom grips -->
    <rect x="5" y="22" width="6" height="4" rx="1" fill="#7733BB" stroke="#5522AA" stroke-width="1"/>
    <rect x="21" y="22" width="6" height="4" rx="1" fill="#7733BB" stroke="#5522AA" stroke-width="1"/>
    <!-- label -->
    <text x="16" y="30" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="4" fill="#FFDD00">GAME</text>
  </svg>`;
}

function clockIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <circle cx="16" cy="16" r="13" fill="#0a0022" stroke="#00ffff" stroke-width="2"/>
    <circle cx="16" cy="16" r="11" fill="none" stroke="#ff44ff" stroke-width="0.5" opacity="0.4"/>
    ${[0,1,2,3,4,5,6,7,8,9,10,11].map(i => {
      const a = i * 30 * Math.PI / 180 - Math.PI / 2;
      const r1 = i % 3 === 0 ? 8.5 : 9.5;
      const r2 = 11;
      return `<line x1="${16 + Math.cos(a)*r1}" y1="${16 + Math.sin(a)*r1}" x2="${16 + Math.cos(a)*r2}" y2="${16 + Math.sin(a)*r2}" stroke="${i % 3 === 0 ? '#ffff00' : '#00ff88'}" stroke-width="${i % 3 === 0 ? 1.5 : 0.8}"/>`;
    }).join('')}
    <line x1="16" y1="16" x2="16" y2="8" stroke="#ff44ff" stroke-width="2" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="22" y2="16" stroke="#00ffff" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="12" y2="22" stroke="#00ff88" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="1.5" fill="#ffff00"/>
    <text x="16" y="31" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3.5" fill="#00ffff">CLK</text>
  </svg>`;
}

function hackerIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <rect x="3" y="6" width="26" height="18" rx="2" fill="#0a0a0a" stroke="#00ff00" stroke-width="1.5"/>
    <rect x="5" y="8" width="22" height="14" fill="#001a00"/>
    <text x="16" y="14" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3" fill="#00ff00">>&gt;_</text>
    <text x="16" y="19" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="2.5" fill="#00ff00" opacity="0.6">HACK</text>
    <rect x="10" y="24" width="12" height="2" rx="0.5" fill="#333" stroke="#00ff00" stroke-width="0.5"/>
    <rect x="8" y="26" width="16" height="1.5" rx="0.5" fill="#222" stroke="#00ff00" stroke-width="0.5"/>
    <circle cx="6" cy="8" r="0.8" fill="#ff0000" opacity="0.8"/>
    <circle cx="26" cy="8" r="0.8" fill="#00ff00">
      <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite"/>
    </circle>
    <text x="16" y="31.5" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3.5" fill="#00ff00">SYS</text>
  </svg>`;
}

function shieldIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <path d="M16 2 L28 8 L28 16 C28 24 16 30 16 30 C16 30 4 24 4 16 L4 8 Z" fill="#001a33" stroke="#00aaff" stroke-width="1.5"/>
    <path d="M16 5 L25 10 L25 16 C25 22 16 27 16 27 C16 27 7 22 7 16 L7 10 Z" fill="none" stroke="#00ffff" stroke-width="0.5" opacity="0.4"/>
    <text x="16" y="15" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="5" fill="#00ffff">DEF</text>
    <rect x="11" y="18" width="10" height="2" rx="1" fill="#00ff88" opacity="0.8"/>
    <rect x="12" y="21" width="8" height="1.5" rx="0.75" fill="#00ff88" opacity="0.5"/>
    <text x="16" y="31.5" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3.5" fill="#00aaff">FW</text>
  </svg>`;
}

function browserIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <rect x="2" y="2" width="28" height="26" rx="2" fill="#0d0025" stroke="#00ffff" stroke-width="1.5"/>
    <rect x="2" y="2" width="28" height="6" rx="2" fill="#1a0044" stroke="#00ffff" stroke-width="1"/>
    <circle cx="6" cy="5" r="1.3" fill="#ff4444"/>
    <circle cx="10" cy="5" r="1.3" fill="#ffff00"/>
    <circle cx="14" cy="5" r="1.3" fill="#00ff88"/>
    <rect x="18" y="3.5" width="10" height="3" rx="1" fill="#0d0025" stroke="#00aaaa" stroke-width="0.5"/>
    <circle cx="16" cy="18" r="7" fill="none" stroke="#00ffff" stroke-width="1.5"/>
    <line x1="16" y1="11" x2="16" y2="25" stroke="#00ffff" stroke-width="0.8" opacity="0.5"/>
    <line x1="9" y1="18" x2="23" y2="18" stroke="#00ffff" stroke-width="0.8" opacity="0.5"/>
    <path d="M9.5 14 Q16 12 22.5 14" stroke="#ff44ff" stroke-width="0.8" fill="none"/>
    <path d="M9.5 22 Q16 24 22.5 22" stroke="#ff44ff" stroke-width="0.8" fill="none"/>
    <text x="16" y="31.5" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3" fill="#00ffff">WEB</text>
  </svg>`;
}

function jkIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <circle cx="16" cy="14" r="11" fill="#D97706" stroke="#F59E0B" stroke-width="1.5"/>
    <text x="16" y="17" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="7" fill="#fff">&gt;_</text>
    <text x="16" y="31" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3.5" fill="#F59E0B">JK</text>
  </svg>`;
}

function wormIcon(size = 40) {
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <circle cx="8" cy="16" r="4" fill="#00ff44"/>
    <circle cx="14" cy="13" r="3.5" fill="#00dd33"/>
    <circle cx="20" cy="15" r="3.5" fill="#00ff44"/>
    <circle cx="25" cy="12" r="3" fill="#00dd33"/>
    <circle cx="5" cy="14" r="1.2" fill="#ffffff"/>
    <circle cx="5" cy="14" r="0.6" fill="#000"/>
    <circle cx="10" cy="14" r="1.2" fill="#ffffff"/>
    <circle cx="10" cy="14" r="0.6" fill="#000"/>
    <path d="M4 18 Q6 20 8 18" stroke="#ff4444" stroke-width="0.8" fill="none"/>
    <text x="16" y="31" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="3.5" fill="#00ff44">WORM</text>
  </svg>`;
}

function fileIcon(size = 40, ext = '', name = '') {
  if (ext === '.py') return gameIcon(size);
  if (name.toLowerCase().includes('clock')) return clockIcon(size);
  if (name.toLowerCase().includes('d3f3nd') || name.toLowerCase().includes('defend')) return shieldIcon(size);
  if (name.toLowerCase().includes('h4ck') || name.toLowerCase().includes('hack')) return hackerIcon(size);
  if (name.toLowerCase().includes('worm')) return wormIcon(size);
  if (name.toLowerCase().includes('browser')) return browserIcon(size);
  if (name.toLowerCase().includes('johnkelly')) return jkIcon(size);

  let color = '#1a1a2e';
  let stroke = '#660088';
  let label = '';
  let labelColor = '#00ff88';
  if (ext === '.txt') { color = '#001a11'; stroke = '#00aa66'; label = 'TXT'; labelColor = '#00ff88'; }
  else if (ext === '.bmp' || ext === '.png' || ext === '.jpg') { color = '#1a0022'; stroke = '#cc00aa'; label = 'IMG'; labelColor = '#ff44ff'; }
  else if (ext === '.exe') { color = '#1a0500'; stroke = '#cc3300'; label = 'EXE'; labelColor = '#ff4444'; }
  else if (ext === '.wav' || ext === '.mp3') { color = '#000d1a'; stroke = '#0088cc'; label = 'SND'; labelColor = '#00ccff'; }
  else { label = ext ? ext.replace('.', '').toUpperCase().slice(0, 3) : 'FIL'; labelColor = '#ffff00'; }

  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" class="icon">
    <rect x="4" y="2" width="20" height="28" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>
    <polygon points="18,2 24,8 18,8" fill="${stroke}" stroke="${stroke}" stroke-width="1" opacity="0.5"/>
    <text x="14" y="22" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="5" fill="${labelColor}">${label}</text>
  </svg>`;
}

function getExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

function smallFolderIcon(name = '') {
  if (name.toLowerCase() === 'trash') {
    return `<svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align:middle">
      <rect x="3" y="3" width="10" height="1" rx="0.5" fill="#888"/>
      <rect x="6" y="2" width="4" height="2" rx="0.5" fill="none" stroke="#888" stroke-width="0.5"/>
      <path d="M4 4 L5 14 L11 14 L12 4 Z" fill="#444" stroke="#888" stroke-width="0.5"/>
      <line x1="6" y1="6" x2="6.2" y2="12" stroke="#666" stroke-width="0.5"/>
      <line x1="8" y1="6" x2="8" y2="12" stroke="#666" stroke-width="0.5"/>
      <line x1="10" y1="6" x2="9.8" y2="12" stroke="#666" stroke-width="0.5"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align:middle">
    <rect x="1" y="4" width="14" height="10" fill="#ff6600" stroke="#cc0066" stroke-width="1"/>
    <rect x="1" y="2" width="6" height="4" fill="#ff8800" stroke="#cc0066" stroke-width="1"/>
  </svg>`;
}

// --- Navigation ---

async function navigateTo(folderId, addToHistory = true) {
  try {
    const data = await apiGet(`/api/fs/${folderId}`);
    const pathData = await apiGet(`/api/fs/${folderId}/path`);

    if (addToHistory) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(folderId);
      state.historyIndex = state.history.length - 1;
    }

    state.currentFolderId = folderId;
    state.selectedItems.clear();

    renderBreadcrumb(pathData.path);
    renderFileArea(data.children);
    updateStatusBar(data.children.length);
    updateSidebarActive(folderId);
    updateTrashToolbar(folderId);
  } catch (err) {
    showAlert('Error', err.message);
  }
}

function goBack() {
  if (state.historyIndex > 0) {
    sfx.back();
    state.historyIndex--;
    navigateTo(state.history[state.historyIndex], false);
  }
}

async function goUp() {
  try {
    const data = await apiGet(`/api/fs/${state.currentFolderId}`);
    if (data.node.parent_id) {
      sfx.navigate();
      navigateTo(data.node.parent_id);
    }
  } catch (err) {
    showAlert('Error', err.message);
  }
}

// --- Rendering ---

function renderBreadcrumb(pathArray) {
  const el = document.getElementById('breadcrumb');
  el.innerHTML = '';
  pathArray.forEach((item, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = ' > ';
      el.appendChild(sep);
    }
    const span = document.createElement('span');
    span.textContent = item.name;
    span.addEventListener('click', () => { sfx.navigate(); navigateTo(item.id); });
    el.appendChild(span);
  });
}

function renderFileArea(children) {
  const area = document.getElementById('file-area');
  area.innerHTML = '';

  if (state.viewMode === 'list') {
    const header = document.createElement('div');
    header.className = 'list-header';
    header.innerHTML = `
      <span></span>
      <span>Name</span>
      <span>Size</span>
      <span class="col-type">Type</span>
      <span class="col-date">Modified</span>
    `;
    area.appendChild(header);
  }

  if (children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-message';
    empty.innerHTML = '~ EMPTY ZONE ~<br><span style="font-family:VT323;font-size:16px;opacity:0.6">DROP FILES HERE OR CREATE NEW</span>';
    area.appendChild(empty);
    return;
  }

  children.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.id = item.id;
    div.dataset.type = item.type;
    div.dataset.name = item.name;
    div.style.animationDelay = (idx * 0.12) + 's';

    const ext = item.type === 'file' ? getExtension(item.name) : '';
    const iconSize = state.viewMode === 'grid' ? 40 : 20;
    const iconHtml = item.type === 'folder' ? folderIcon(iconSize, item.name) : fileIcon(iconSize, ext, item.name);

    if (state.viewMode === 'grid') {
      div.innerHTML = `
        ${iconHtml}
        <span class="name">${escapeHtml(item.name)}</span>
      `;
    } else {
      const sizeStr = item.type === 'file' ? formatSize(item.size) : '';
      const typeStr = item.type === 'folder' ? 'File Folder' : (ext || 'File').toUpperCase();
      const dateStr = item.modified_at ? formatDate(item.modified_at) : '';
      div.innerHTML = `
        ${iconHtml}
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="col-size">${sizeStr}</span>
        <span class="col-type">${typeStr}</span>
        <span class="col-date">${dateStr}</span>
      `;
    }

    div.addEventListener('click', (e) => handleItemClick(e, item));
    div.addEventListener('dblclick', () => handleItemDblClick(item));
    div.addEventListener('contextmenu', (e) => handleItemContextMenu(e, item));

    area.appendChild(div);
  });
}

function updateStatusBar(count) {
  document.getElementById('status-count').textContent = `${count} item(s)`;
  updateSelectionStatus();
}

function updateSelectionStatus() {
  const el = document.getElementById('status-selected');
  const count = state.selectedItems.size;
  el.textContent = count > 0 ? `${count} selected` : '';
}

function updateSidebarActive(folderId) {
  document.querySelectorAll('.tree-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === folderId);
  });
}

// --- Sidebar Folder Tree ---

async function loadSidebar() {
  try {
    const data = await apiGet(`/api/fs/${ROOT_ID}`);
    const tree = document.getElementById('folder-tree');
    tree.innerHTML = '';
    renderTreeNode(tree, { id: ROOT_ID, name: 'My Computer', type: 'folder' }, data.children);
  } catch (err) {
    console.error('Failed to load sidebar:', err);
  }
}

function renderTreeNode(container, node, children) {
  const item = document.createElement('div');
  item.className = 'tree-item';
  item.dataset.id = node.id;
  item.innerHTML = `${smallFolderIcon(node.name)} <span>${escapeHtml(node.name)}</span>`;
  item.addEventListener('click', () => { sfx.navigate(); navigateTo(node.id); });
  container.appendChild(item);

  const folders = (children || []).filter(c => c.type === 'folder');
  if (folders.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    folders.forEach(f => {
      renderTreeNode(childContainer, f, []);
    });
    container.appendChild(childContainer);
  }
}

// --- Event Handlers ---

function handleItemClick(e, item) {
  sfx.select();
  if (e.ctrlKey) {
    if (state.selectedItems.has(item.id)) {
      state.selectedItems.delete(item.id);
    } else {
      state.selectedItems.add(item.id);
    }
  } else {
    state.selectedItems.clear();
    state.selectedItems.add(item.id);
  }
  refreshSelection();
}

function handleItemDblClick(item) {
  if (item.type === 'folder') {
    sfx.open();
    navigateTo(item.id);
  } else {
    sfx.open();
    openFileViewer(item);
  }
}

function handleItemContextMenu(e, item) {
  e.preventDefault();
  if (!state.selectedItems.has(item.id)) {
    state.selectedItems.clear();
    state.selectedItems.add(item.id);
    refreshSelection();
  }
  showContextMenu(e.clientX, e.clientY, item);
}

function refreshSelection() {
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('selected', state.selectedItems.has(parseInt(el.dataset.id)));
  });
  updateSelectionStatus();
}

// --- Context Menu ---

function showContextMenu(x, y, item) {
  sfx.click();
  const menu = document.getElementById('context-menu');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.style.display = 'block';
  menu.dataset.targetId = item ? item.id : '';
  menu.dataset.targetType = item ? item.type : '';
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
}

document.addEventListener('click', hideContextMenu);

document.getElementById('context-menu').addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const menu = document.getElementById('context-menu');
  const targetId = parseInt(menu.dataset.targetId);

  switch (action) {
    case 'open':
      if (menu.dataset.targetType === 'folder') navigateTo(targetId);
      else openFileViewer({ id: targetId, name: '' });
      break;
    case 'new-folder': handleNewFolder(); break;
    case 'new-file': handleNewFile(); break;
    case 'rename': handleRename(); break;
    case 'delete': handleDelete(); break;
  }
  hideContextMenu();
});

// --- File Area Context Menu (empty space) ---

document.getElementById('file-area').addEventListener('contextmenu', (e) => {
  if (e.target.closest('.file-item')) return;
  e.preventDefault();
  state.selectedItems.clear();
  refreshSelection();
  showContextMenu(e.clientX, e.clientY, null);
});

// Click on empty area to deselect
document.getElementById('file-area').addEventListener('click', (e) => {
  if (!e.target.closest('.file-item')) {
    state.selectedItems.clear();
    refreshSelection();
  }
});

// --- CRUD Operations ---

async function handleNewFolder() {
  const name = await showPrompt('New Folder', 'Enter folder name:');
  if (!name) return;
  try {
    await apiPost('/api/fs/create', {
      parentId: state.currentFolderId,
      name: name,
      type: 'folder'
    });
    sfx.create();
    navigateTo(state.currentFolderId, false);
    loadSidebar();
  } catch (err) {
    showAlert('Error', err.message);
  }
}

async function handleNewFile() {
  const name = await showPrompt('New File', 'Enter file name (with extension):');
  if (!name) return;
  try {
    await apiPost('/api/fs/create', {
      parentId: state.currentFolderId,
      name: name,
      type: 'file',
      content: ''
    });
    sfx.create();
    navigateTo(state.currentFolderId, false);
  } catch (err) {
    showAlert('Error', err.message);
  }
}

async function handleRename() {
  if (state.selectedItems.size !== 1) {
    showAlert('Rename', 'Please select exactly one item to rename.');
    return;
  }
  const id = [...state.selectedItems][0];
  const el = document.querySelector(`.file-item[data-id="${id}"]`);
  const currentName = el ? el.dataset.name : '';

  const newName = await showPrompt('Rename', 'Enter new name:', currentName);
  if (!newName || newName === currentName) return;
  try {
    await apiPut(`/api/fs/${id}/rename`, { name: newName });
    sfx.rename();
    navigateTo(state.currentFolderId, false);
    loadSidebar();
  } catch (err) {
    showAlert('Error', err.message);
  }
}

async function handleDelete() {
  if (state.selectedItems.size === 0) {
    showAlert('Delete', 'Please select items to delete.');
    return;
  }
  const count = state.selectedItems.size;
  const isInTrash = state.currentFolderId === TRASH_ID;

  if (isInTrash) {
    const confirmed = await showConfirm('Permanent Delete', `Permanently delete ${count} item(s)? This cannot be undone!`);
    if (!confirmed) return;
    try {
      for (const id of state.selectedItems) {
        await apiDelete(`/api/fs/${id}`);
      }
      sfx.del();
    } catch (err) {
      showAlert('Error', err.message);
    }
  } else {
    const confirmed = await showConfirm('Move to Trash', `Move ${count} item(s) to the Trash?`);
    if (!confirmed) return;
    try {
      for (const id of state.selectedItems) {
        await apiPost(`/api/fs/${id}/trash`, {});
      }
      sfx.del();
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  const win = document.getElementById('window');
  win.classList.add('shake');
  setTimeout(() => win.classList.remove('shake'), 350);
  state.selectedItems.clear();
  navigateTo(state.currentFolderId, false);
  loadSidebar();
}

async function handleRestore() {
  if (state.selectedItems.size === 0) {
    showAlert('Restore', 'Please select items to restore.');
    return;
  }
  try {
    for (const id of state.selectedItems) {
      await apiPost(`/api/fs/${id}/restore`, {});
    }
    sfx.create();
    state.selectedItems.clear();
    navigateTo(state.currentFolderId, false);
    loadSidebar();
  } catch (err) {
    showAlert('Error', err.message);
  }
}

async function handleEmptyTrash() {
  const confirmed = await showConfirm('Empty Trash', 'Permanently delete ALL items in the Trash? This cannot be undone!');
  if (!confirmed) return;
  try {
    await apiDelete('/api/fs/trash/empty');
    sfx.del();
    sfx.gameBad();
    const win = document.getElementById('window');
    win.classList.add('shake');
    setTimeout(() => win.classList.remove('shake'), 350);
    navigateTo(state.currentFolderId, false);
  } catch (err) {
    showAlert('Error', err.message);
  }
}

function updateTrashToolbar(folderId) {
  let trashBar = document.getElementById('trash-toolbar');
  if (folderId === TRASH_ID && TRASH_ID) {
    if (!trashBar) {
      trashBar = document.createElement('div');
      trashBar.id = 'trash-toolbar';
      const toolbar = document.querySelector('.toolbar');
      toolbar.parentElement.insertBefore(trashBar, toolbar.nextSibling);
    }
    trashBar.innerHTML = `
      <span class="trash-toolbar-label">&#128465; RECYCLE BIN</span>
      <button id="btn-restore" class="tool-btn trash-btn restore-btn" title="Restore selected">&#8634; Restore</button>
      <button id="btn-empty-trash" class="tool-btn trash-btn empty-btn" title="Empty Trash">&#9888; Empty Trash</button>
    `;
    document.getElementById('btn-restore').addEventListener('click', handleRestore);
    document.getElementById('btn-empty-trash').addEventListener('click', handleEmptyTrash);
  } else if (trashBar) {
    trashBar.remove();
  }
}

// --- File Viewer ---

async function openFileViewer(item) {
  try {
    const nodeData = await apiGet(`/api/fs/${item.id}`);
    const name = nodeData.node.name;
    const ext = getExtension(name);

    if (ext === '.py') {
      launchGame(name);
      return;
    }

    if (name.toLowerCase().includes('clock')) {
      launchClock();
      return;
    }

    if (name.toLowerCase().includes('d3f3nd') || name.toLowerCase().includes('defend')) {
      launchDefenseGame();
      return;
    }

    if (name.toLowerCase().includes('h4ck') || name.toLowerCase().includes('hack')) {
      launchHacker();
      return;
    }

    if (name.toLowerCase().includes('worm')) {
      launchWorm();
      return;
    }

    if (name.toLowerCase().includes('johnkelly')) {
      launchJohnKelly();
      return;
    }

    if (name.toLowerCase().includes('browser')) {
      launchBrowser();
      return;
    }

    const data = await apiGet(`/api/fs/${item.id}/content`);
    showFileEditor(name, data.content, async (newContent) => {
      try {
        await apiPut(`/api/fs/${item.id}/content`, { content: newContent });
        navigateTo(state.currentFolderId, false);
      } catch (err) {
        showAlert('Error', err.message);
      }
    });
  } catch (err) {
    showAlert('Error', err.message);
  }
}

// --- Game Engine ---

function launchGame(name) {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');

  modalTitle.textContent = 'Stop the Turtle!';
  modalBody.innerHTML = `<canvas id="game-canvas" width="480" height="360" tabindex="0"></canvas>
    <div id="game-hud" style="text-align:center;margin-top:8px;font-family:'Press Start 2P',monospace;font-size:10px;color:#000;">
      Press SPACE to stop the turtle!
    </div>`;
  modalButtons.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    if (gameState.raf) cancelAnimationFrame(gameState.raf);
    overlay.style.display = 'none';
  });
  modalButtons.appendChild(closeBtn);

  overlay.style.display = 'flex';

  document.querySelector('.modal-close').onclick = () => {
    if (gameState.raf) cancelAnimationFrame(gameState.raf);
    overlay.style.display = 'none';
  };

  sfx.open();
  const canvas = document.getElementById('game-canvas');
  canvas.focus();
  startTurtleGame(canvas);
}

// --- Clock Application ---

const clockState = { raf: null };

function launchClock() {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');

  modalTitle.textContent = 'Neon Clock';
  modalBody.innerHTML = `<canvas id="clock-canvas" width="300" height="300"></canvas>
    <div id="clock-digital" style="text-align:center;margin-top:10px;font-family:'Press Start 2P',monospace;font-size:14px;color:#00ffff;text-shadow:0 0 8px #00ffff;"></div>
    <div id="clock-date" style="text-align:center;margin-top:4px;font-family:'VT323',monospace;font-size:18px;color:#ff44ff;text-shadow:0 0 6px #ff44ff;"></div>`;
  modalButtons.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    if (clockState.raf) cancelAnimationFrame(clockState.raf);
    sfx.modalClose();
    overlay.style.display = 'none';
  });
  modalButtons.appendChild(closeBtn);

  overlay.style.display = 'flex';

  document.querySelector('.modal-close').onclick = () => {
    if (clockState.raf) cancelAnimationFrame(clockState.raf);
    sfx.modalClose();
    overlay.style.display = 'none';
  };

  sfx.open();
  startClock();
}

function startClock() {
  const canvas = document.getElementById('clock-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = 130;

  if (clockState.raf) cancelAnimationFrame(clockState.raf);

  function drawFrame() {
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    const secs = now.getSeconds();
    const ms = now.getMilliseconds();
    const secFrac = secs + ms / 1000;

    ctx.clearRect(0, 0, W, H);

    // outer glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // clock face
    const faceGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    faceGrad.addColorStop(0, '#1a0033');
    faceGrad.addColorStop(0.8, '#0d0020');
    faceGrad.addColorStop(1, '#0a001a');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, R - 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 68, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // tick marks
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6 - 90) * Math.PI / 180;
      const isHour = i % 5 === 0;
      const innerR = isHour ? R - 22 : R - 14;
      const outerR = R - 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.strokeStyle = isHour ? '#ffff00' : '#00ff88';
      ctx.lineWidth = isHour ? 3 : 1;
      if (isHour) {
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 6;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // hour numbers
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 4;
    for (let i = 1; i <= 12; i++) {
      const angle = (i * 30 - 90) * Math.PI / 180;
      const numR = R - 34;
      ctx.fillText(i.toString(), cx + Math.cos(angle) * numR, cy + Math.sin(angle) * numR);
    }
    ctx.shadowBlur = 0;

    // hour hand
    const hourAngle = ((hours % 12) * 30 + mins * 0.5 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hourAngle) * (R * 0.5), cy + Math.sin(hourAngle) * (R * 0.5));
    ctx.strokeStyle = '#ff44ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff44ff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // minute hand
    const minAngle = (mins * 6 + secs * 0.1 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(minAngle) * (R * 0.7), cy + Math.sin(minAngle) * (R * 0.7));
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // second hand (smooth sweep)
    const secAngle = (secFrac * 6 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(secAngle) * 15, cy - Math.sin(secAngle) * 15);
    ctx.lineTo(cx + Math.cos(secAngle) * (R * 0.8), cy + Math.sin(secAngle) * (R * 0.8));
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffff00';
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // second dot at tip
    ctx.beginPath();
    ctx.arc(cx + Math.cos(secAngle) * (R * 0.8), cy + Math.sin(secAngle) * (R * 0.8), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    // update digital display
    const digitalEl = document.getElementById('clock-digital');
    const dateEl = document.getElementById('clock-date');
    if (digitalEl) {
      const h = hours.toString().padStart(2, '0');
      const m = mins.toString().padStart(2, '0');
      const s = secs.toString().padStart(2, '0');
      digitalEl.textContent = `${h}:${m}:${s}`;
    }
    if (dateEl) {
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    }

    clockState.raf = requestAnimationFrame(drawFrame);
  }

  drawFrame();
}

// --- Hacker Simulation ---

const hackState = { timer: null, raf: null };

function launchHacker() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');

  modal.classList.add('modal-editor');
  modalTitle.textContent = 'h4ck3r.exe';
  modalBody.innerHTML = `
    <div id="hack-screen">
      <canvas id="hack-matrix" width="600" height="40"></canvas>
      <div id="hack-output"></div>
      <div id="hack-progress-wrap" style="display:none;">
        <div id="hack-progress-label"></div>
        <div id="hack-progress-bar"><div id="hack-progress-fill"></div></div>
      </div>
      <div id="hack-access" style="display:none;">ACCESS GRANTED</div>
    </div>`;
  modalButtons.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Abort';
  closeBtn.addEventListener('click', cleanupHack);
  modalButtons.appendChild(closeBtn);

  overlay.style.display = 'flex';
  document.querySelector('.modal-close').onclick = cleanupHack;

  function cleanupHack() {
    if (hackState.timer) { clearTimeout(hackState.timer); hackState.timer = null; }
    if (hackState.raf) { cancelAnimationFrame(hackState.raf); hackState.raf = null; }
    modal.classList.remove('modal-editor');
    sfx.modalClose();
    overlay.style.display = 'none';
  }

  sfx.open();
  startHackSequence();
}

function startHackSequence() {
  const output = document.getElementById('hack-output');
  const progressWrap = document.getElementById('hack-progress-wrap');
  const progressLabel = document.getElementById('hack-progress-label');
  const progressFill = document.getElementById('hack-progress-fill');
  const accessDiv = document.getElementById('hack-access');
  const matrixCanvas = document.getElementById('hack-matrix');
  const mCtx = matrixCanvas.getContext('2d');

  // Matrix rain on the top bar
  const cols = Math.floor(matrixCanvas.width / 12);
  const drops = Array(cols).fill(0);
  const matrixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*(){}[]|/\\<>~';
  function drawMatrix() {
    mCtx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    mCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    mCtx.font = '11px "VT323", monospace';
    for (let i = 0; i < cols; i++) {
      const ch = matrixChars[Math.floor(Math.random() * matrixChars.length)];
      const bright = Math.random() > 0.8;
      mCtx.fillStyle = bright ? '#00ff88' : '#00aa44';
      mCtx.fillText(ch, i * 12, drops[i] * 12);
      if (drops[i] * 12 > matrixCanvas.height && Math.random() > 0.9) drops[i] = 0;
      drops[i]++;
    }
    hackState.raf = requestAnimationFrame(drawMatrix);
  }
  drawMatrix();

  function randIP() { return [1,2,3,4].map(() => Math.floor(Math.random()*256)).join('.'); }
  function randHex(n) { let s=''; for(let i=0;i<n;i++) s+='0123456789ABCDEF'[Math.floor(Math.random()*16)]; return s; }
  function randPort() { return 1024 + Math.floor(Math.random() * 64000); }

  const lines = [
    { text: `> Initializing h4ck3r.exe v3.1.7...`, delay: 400, sound: 'click' },
    { text: `> Loading kernel modules...`, delay: 300, sound: 'click' },
    { text: `  [OK] net_bypass.ko`, delay: 200 },
    { text: `  [OK] crypt_crack.ko`, delay: 150 },
    { text: `  [OK] stealth_mode.ko`, delay: 200 },
    { text: `> Spoofing MAC address: ${randHex(2)}:${randHex(2)}:${randHex(2)}:${randHex(2)}:${randHex(2)}:${randHex(2)}`, delay: 400, sound: 'navigate' },
    { text: `> Routing through ${3 + Math.floor(Math.random()*5)} proxy nodes...`, delay: 500, sound: 'click' },
    { text: `  -> ${randIP()} [RELAY]`, delay: 200 },
    { text: `  -> ${randIP()} [TOR NODE]`, delay: 250 },
    { text: `  -> ${randIP()} [VPN TUNNEL]`, delay: 200 },
    { text: `  -> ${randIP()} [BOUNCED]`, delay: 150 },
    { text: `> Scanning target: ${randIP()}:${randPort()}...`, delay: 600, sound: 'navigate' },
    { text: `  Port 22   [SSH]     OPEN`, delay: 150 },
    { text: `  Port 80   [HTTP]    OPEN`, delay: 100 },
    { text: `  Port 443  [HTTPS]   OPEN`, delay: 100 },
    { text: `  Port 3306 [MySQL]   OPEN`, delay: 150 },
    { text: `  Port 8080 [PROXY]   FILTERED`, delay: 100 },
    { text: `> Found 5 open ports. Analyzing services...`, delay: 400, sound: 'click' },
    { text: `> Detected: Apache/2.4.52 (Ubuntu)`, delay: 300 },
    { text: `> Detected: OpenSSH_8.9p1`, delay: 200 },
    { text: `> Vulnerability found: CVE-2024-${1000 + Math.floor(Math.random()*9000)}`, delay: 500, cls: 'hack-warn', sound: 'error' },
    { text: `> Injecting payload: 0x${randHex(8)}...`, delay: 400, sound: 'click' },
    { text: `> Bypassing firewall rules...`, delay: 300 },
    { text: `  Rule 1: BYPASSED`, delay: 200 },
    { text: `  Rule 2: BYPASSED`, delay: 150 },
    { text: `  Rule 3: BYPASSED`, delay: 200 },
    { text: `  Rule 4: REROUTED`, delay: 150 },
    { text: '> FIREWALL NEUTRALIZED', delay: 400, cls: 'hack-success', sound: 'create' },
    { text: `> Cracking password hash: $6$${randHex(16)}$...`, delay: 300, sound: 'click' },
    { text: `  Trying wordlist: rockyou.txt (14,344,391 entries)`, delay: 300 },
    { text: `  Attempt 847,293: *****`, delay: 200 },
    { text: `  Attempt 2,491,004: ********`, delay: 200 },
    { text: '  [PROGRESS_BAR]', delay: 0, action: 'progress', label: 'CRACKING PASSWORD', duration: 3000 },
    { text: '  PASSWORD CRACKED: ************', delay: 300, cls: 'hack-success', sound: 'create' },
    { text: `> Establishing reverse shell on ${randIP()}:${randPort()}...`, delay: 400, sound: 'navigate' },
    { text: `> Connection established. Shell active.`, delay: 300, cls: 'hack-success' },
    { text: `> Escalating privileges: user -> root`, delay: 500, sound: 'click' },
    { text: `  [sudo] exploiting CVE-2024-${1000+Math.floor(Math.random()*9000)}...`, delay: 400 },
    { text: `  uid=0(root) gid=0(root) groups=0(root)`, delay: 300, cls: 'hack-success', sound: 'create' },
    { text: `> ROOT ACCESS OBTAINED`, delay: 400, cls: 'hack-warn', sound: 'gamePerfect' },
    { text: `> Downloading classified files...`, delay: 300, sound: 'click' },
    { text: `  /etc/shadow .............. ${Math.floor(Math.random()*50+10)}KB`, delay: 200 },
    { text: `  /root/.ssh/id_rsa ........ ${Math.floor(Math.random()*10+1)}KB`, delay: 200 },
    { text: `  /var/lib/secrets.db ...... ${Math.floor(Math.random()*500+100)}KB`, delay: 200 },
    { text: `  /opt/mainframe/core.dat .. ${(Math.random()*5+1).toFixed(1)}MB`, delay: 250 },
    { text: '  [PROGRESS_BAR]', delay: 0, action: 'progress', label: 'DOWNLOADING FILES', duration: 2500 },
    { text: `> ${4} files exfiltrated successfully.`, delay: 300, cls: 'hack-success', sound: 'create' },
    { text: `> Cleaning logs: /var/log/auth.log`, delay: 200, sound: 'click' },
    { text: `> Cleaning logs: /var/log/syslog`, delay: 150 },
    { text: `> Cleaning logs: /var/log/apache2/access.log`, delay: 150 },
    { text: `> Installing backdoor on port ${randPort()}...`, delay: 400, sound: 'click' },
    { text: `> Backdoor active. Persistence established.`, delay: 300, cls: 'hack-success' },
    { text: `> Erasing traces...`, delay: 300, sound: 'click' },
    { text: `> Operation complete.`, delay: 400 },
    { text: '', delay: 200 },
    { text: '[ACCESS_GRANTED]', delay: 0, action: 'access' },
  ];

  let lineIdx = 0;

  function addLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'hack-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
    sfx.click();
  }

  function typeLine(text, cls, callback) {
    const div = document.createElement('div');
    div.className = 'hack-line hack-typing' + (cls ? ' ' + cls : '');
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
    let i = 0;
    function typeChar() {
      if (i < text.length) {
        div.textContent = text.substring(0, i + 1);
        output.scrollTop = output.scrollHeight;
        if (i % 3 === 0) {
          try { sfx.click(); } catch(e) {}
        }
        i++;
        hackState.timer = setTimeout(typeChar, 10 + Math.random() * 20);
      } else {
        div.classList.remove('hack-typing');
        if (callback) callback();
      }
    }
    typeChar();
  }

  function showProgress(label, duration, callback) {
    progressWrap.style.display = 'block';
    progressLabel.textContent = label;
    progressFill.style.width = '0%';
    let pct = 0;
    const interval = 50;
    const step = (100 / (duration / interval));
    function tick() {
      pct += step * (0.5 + Math.random());
      if (pct > 100) pct = 100;
      progressFill.style.width = pct + '%';
      if (pct >= 100) {
        progressWrap.style.display = 'none';
        sfx.create();
        if (callback) callback();
      } else {
        if (Math.random() > 0.7) sfx.click();
        hackState.timer = setTimeout(tick, interval);
      }
    }
    tick();
  }

  function processLine() {
    if (lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    lineIdx++;

    if (line.sound && sfx[line.sound]) sfx[line.sound]();

    if (line.action === 'progress') {
      showProgress(line.label, line.duration, () => {
        hackState.timer = setTimeout(processLine, 200);
      });
      return;
    }

    if (line.action === 'access') {
      accessDiv.style.display = 'block';
      sfx.gamePerfect();
      // Screen flash
      const flash = document.createElement('div');
      flash.style.cssText = 'position:absolute;inset:0;background:#00ff00;opacity:0.4;pointer-events:none;z-index:10;transition:opacity 1s;';
      document.getElementById('hack-screen').appendChild(flash);
      setTimeout(() => { flash.style.opacity = '0'; }, 50);
      setTimeout(() => { flash.remove(); }, 1200);
      return;
    }

    if (line.text.length > 40 && Math.random() > 0.5) {
      typeLine(line.text, line.cls, () => {
        hackState.timer = setTimeout(processLine, line.delay || 200);
      });
    } else {
      addLine(line.text, line.cls);
      hackState.timer = setTimeout(processLine, line.delay || 200);
    }
  }

  hackState.timer = setTimeout(processLine, 500);
}

// --- Defense Game (Mr. Robot style multi-terminal) ---

const defenseState = { timers: [], raf: null, active: false };

function launchDefenseGame() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');

  modal.classList.add('modal-editor');
  modalTitle.textContent = 'd3f3nd.exe - FIREWALL DEFENSE';
  modalBody.innerHTML = `
    <div id="def-grid">
      <div class="def-panel" id="def-intrusion">
        <div class="def-panel-title"><span class="def-led def-led-red"></span> INTRUSION FEED</div>
        <div class="def-panel-body" id="def-intrusion-log"></div>
      </div>
      <div class="def-panel" id="def-cmd">
        <div class="def-panel-title"><span class="def-led def-led-green"></span> COMMAND LINE</div>
        <div class="def-panel-body">
          <div id="def-prompt-area">
            <div id="def-prompt-msg">Initializing defense systems...</div>
            <div id="def-timer-bar"><div id="def-timer-fill"></div></div>
            <div id="def-input-wrap">
              <span class="def-prompt-caret">root@firewall:~$</span>
              <input type="text" id="def-input" class="def-input" spellcheck="false" autocomplete="off" disabled/>
            </div>
            <div id="def-cmd-feedback"></div>
          </div>
          <div id="def-cmd-log"></div>
        </div>
      </div>
      <div class="def-panel" id="def-network">
        <div class="def-panel-title"><span class="def-led def-led-cyan"></span> NETWORK TRAFFIC</div>
        <div class="def-panel-body"><canvas id="def-net-canvas" width="280" height="160"></canvas></div>
      </div>
      <div class="def-panel" id="def-status">
        <div class="def-panel-title"><span class="def-led def-led-yellow"></span> SYSTEM STATUS</div>
        <div class="def-panel-body" id="def-status-body">
          <div class="def-stat-row"><span>FIREWALL:</span><div class="def-hp-bar"><div id="def-hp-fill" class="def-hp-fill"></div></div><span id="def-hp-text">100%</span></div>
          <div class="def-stat-row"><span>WAVE:</span><span id="def-wave-text">0 / 10</span></div>
          <div class="def-stat-row"><span>BLOCKED:</span><span id="def-blocked-text">0</span></div>
          <div class="def-stat-row"><span>MISSED:</span><span id="def-missed-text">0</span></div>
          <div class="def-stat-row"><span>SCORE:</span><span id="def-score-text" style="color:#ffff00">0</span></div>
          <div id="def-alerts"></div>
        </div>
      </div>
    </div>`;
  modalButtons.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Abort Mission';
  closeBtn.addEventListener('click', cleanupDefense);
  modalButtons.appendChild(closeBtn);

  overlay.style.display = 'flex';
  document.querySelector('.modal-close').onclick = cleanupDefense;

  function cleanupDefense() {
    defenseState.active = false;
    defenseState.timers.forEach(t => clearTimeout(t));
    defenseState.timers = [];
    if (defenseState.raf) { cancelAnimationFrame(defenseState.raf); defenseState.raf = null; }
    modal.classList.remove('modal-editor');
    sfx.modalClose();
    overlay.style.display = 'none';
  }

  sfx.open();
  startDefenseGame(cleanupDefense);
}

function startDefenseGame(cleanupFn) {
  defenseState.active = true;
  defenseState.timers = [];

  const intrusionLog = document.getElementById('def-intrusion-log');
  const cmdLog = document.getElementById('def-cmd-log');
  const promptMsg = document.getElementById('def-prompt-msg');
  const timerFill = document.getElementById('def-timer-fill');
  const input = document.getElementById('def-input');
  const feedback = document.getElementById('def-cmd-feedback');
  const hpFill = document.getElementById('def-hp-fill');
  const hpText = document.getElementById('def-hp-text');
  const waveText = document.getElementById('def-wave-text');
  const blockedText = document.getElementById('def-blocked-text');
  const missedText = document.getElementById('def-missed-text');
  const scoreText = document.getElementById('def-score-text');
  const alerts = document.getElementById('def-alerts');
  const netCanvas = document.getElementById('def-net-canvas');
  const nCtx = netCanvas.getContext('2d');

  let hp = 100;
  let score = 0;
  let blocked = 0;
  let missed = 0;
  let wave = 0;
  const totalWaves = 10;
  let currentTimer = null;
  let timerStart = 0;
  let timerDuration = 0;
  let timerRaf = null;
  let netPackets = [];

  function randIP() { return [1,2,3,4].map(() => Math.floor(Math.random()*256)).join('.'); }
  function randHex(n) { let s=''; for(let i=0;i<n;i++) s+='0123456789abcdef'[Math.floor(Math.random()*16)]; return s; }

  // Network traffic visualization
  function initNetVis() {
    for (let i = 0; i < 15; i++) {
      netPackets.push({
        x: Math.random() * netCanvas.width,
        y: Math.random() * netCanvas.height,
        vx: (Math.random() - 0.3) * 2,
        vy: (Math.random() - 0.5) * 1.5,
        color: '#00ff88',
        size: 2 + Math.random() * 2,
        hostile: false
      });
    }
  }

  function drawNet() {
    if (!defenseState.active) return;
    nCtx.fillStyle = 'rgba(0, 8, 0, 0.2)';
    nCtx.fillRect(0, 0, netCanvas.width, netCanvas.height);

    // Grid lines
    nCtx.strokeStyle = 'rgba(0, 255, 0, 0.06)';
    nCtx.lineWidth = 0.5;
    for (let x = 0; x < netCanvas.width; x += 20) {
      nCtx.beginPath(); nCtx.moveTo(x, 0); nCtx.lineTo(x, netCanvas.height); nCtx.stroke();
    }
    for (let y = 0; y < netCanvas.height; y += 20) {
      nCtx.beginPath(); nCtx.moveTo(0, y); nCtx.lineTo(netCanvas.width, y); nCtx.stroke();
    }

    // Draw packets
    for (const p of netPackets) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > netCanvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > netCanvas.height) p.vy *= -1;
      p.x = Math.max(0, Math.min(netCanvas.width, p.x));
      p.y = Math.max(0, Math.min(netCanvas.height, p.y));

      nCtx.fillStyle = p.color;
      nCtx.shadowColor = p.color;
      nCtx.shadowBlur = p.hostile ? 8 : 3;
      nCtx.fillRect(p.x, p.y, p.size, p.size);

      // Draw connections between nearby packets
      for (const q of netPackets) {
        const dx = p.x - q.x, dy = p.y - q.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 60 && dist > 0) {
          nCtx.strokeStyle = p.hostile || q.hostile ? 'rgba(255,0,0,0.12)' : 'rgba(0,255,0,0.08)';
          nCtx.lineWidth = 0.5;
          nCtx.beginPath(); nCtx.moveTo(p.x, p.y); nCtx.lineTo(q.x, q.y); nCtx.stroke();
        }
      }
    }
    nCtx.shadowBlur = 0;
    defenseState.raf = requestAnimationFrame(drawNet);
  }

  function addHostilePackets() {
    for (let i = 0; i < 3; i++) {
      netPackets.push({
        x: 0, y: Math.random() * netCanvas.height,
        vx: 1 + Math.random() * 2,
        vy: (Math.random() - 0.5) * 2,
        color: '#ff0044',
        size: 3,
        hostile: true
      });
    }
  }

  function removeHostilePackets() {
    netPackets = netPackets.filter(p => !p.hostile);
  }

  function addIntrusionLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'def-log-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    intrusionLog.appendChild(div);
    intrusionLog.scrollTop = intrusionLog.scrollHeight;
  }

  function addCmdLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'def-log-line' + (cls ? ' ' + cls : '');
    div.textContent = text;
    cmdLog.appendChild(div);
    cmdLog.scrollTop = cmdLog.scrollHeight;
  }

  function addAlert(text, type) {
    const div = document.createElement('div');
    div.className = 'def-alert def-alert-' + type;
    div.textContent = text;
    alerts.prepend(div);
    if (alerts.children.length > 4) alerts.lastChild.remove();
    setTimeout(() => { if (div.parentNode) div.style.opacity = '0.3'; }, 3000);
  }

  function updateStats() {
    hpFill.style.width = hp + '%';
    hpFill.style.background = hp > 60 ? '#00ff88' : hp > 30 ? '#ffff00' : '#ff0044';
    hpText.textContent = hp + '%';
    hpText.style.color = hp > 60 ? '#00ff88' : hp > 30 ? '#ffff00' : '#ff0044';
    waveText.textContent = `${wave} / ${totalWaves}`;
    blockedText.textContent = blocked;
    missedText.textContent = missed;
    scoreText.textContent = score;
  }

  const attacks = [
    { intrusion: 'SYN flood detected from {IP}', cmd: 'iptables -DROP {IP}', hint: 'iptables -DROP', time: 8000, dmg: 12, pts: 100 },
    { intrusion: 'Brute force on SSH port 22', cmd: 'fail2ban --block ssh', hint: 'fail2ban --block', time: 7000, dmg: 15, pts: 120 },
    { intrusion: 'SQL injection on port 3306', cmd: 'mysql --kill-query {PID}', hint: 'mysql --kill-query', time: 7500, dmg: 18, pts: 150 },
    { intrusion: 'Reverse shell spawned by {USER}', cmd: 'kill -9 {PID}', hint: 'kill -9', time: 5000, dmg: 20, pts: 180 },
    { intrusion: 'Malware upload to /tmp/{FILE}', cmd: 'rm -rf /tmp/{FILE}', hint: 'rm -rf /tmp/', time: 6000, dmg: 14, pts: 130 },
    { intrusion: 'Privilege escalation attempt', cmd: 'chmod 000 /etc/shadow', hint: 'chmod 000', time: 6500, dmg: 22, pts: 200 },
    { intrusion: 'Crypto miner on PID {PID}', cmd: 'kill -STOP {PID}', hint: 'kill -STOP', time: 6000, dmg: 10, pts: 90 },
    { intrusion: 'DNS tunneling to {IP}', cmd: 'iptables -DROP {IP}', hint: 'iptables -DROP', time: 7000, dmg: 16, pts: 140 },
    { intrusion: 'Rootkit install at /usr/sbin/{FILE}', cmd: 'rm -f /usr/sbin/{FILE}', hint: 'rm -f /usr/sbin/', time: 7500, dmg: 25, pts: 220 },
    { intrusion: 'Data exfil to {IP}:{PORT}', cmd: 'netstat --kill {IP}:{PORT}', hint: 'netstat --kill', time: 6500, dmg: 20, pts: 170 },
    { intrusion: 'Backdoor listener on port {PORT}', cmd: 'fuser -k {PORT}/tcp', hint: 'fuser -k', time: 5500, dmg: 18, pts: 160 },
    { intrusion: 'Kernel exploit CVE-{CVE}', cmd: 'patch --hotfix CVE-{CVE}', hint: 'patch --hotfix CVE-', time: 8000, dmg: 28, pts: 250 },
  ];

  function genAttack(waveNum) {
    const atk = attacks[Math.floor(Math.random() * attacks.length)];
    const ip = randIP();
    const pid = 1000 + Math.floor(Math.random() * 60000);
    const port = 1024 + Math.floor(Math.random() * 64000);
    const user = ['www-data','nobody','daemon','mysql','postgres'][Math.floor(Math.random()*5)];
    const file = ['payload.so','rootkit.ko','x.sh','miner.bin','rev.elf'][Math.floor(Math.random()*5)];
    const cve = '2024-' + (1000 + Math.floor(Math.random()*9000));

    const rep = s => s.replace('{IP}', ip).replace('{PID}', pid).replace('{PORT}', port).replace('{USER}', user).replace('{FILE}', file).replace('{CVE}', cve);

    const speedMult = Math.max(0.5, 1 - waveNum * 0.05);

    return {
      intrusion: rep(atk.intrusion),
      cmd: rep(atk.cmd),
      hint: rep(atk.hint),
      time: Math.floor(atk.time * speedMult),
      dmg: atk.dmg + Math.floor(waveNum * 1.5),
      pts: atk.pts + waveNum * 20
    };
  }

  function animateTimer(duration) {
    timerStart = performance.now();
    timerDuration = duration;
    timerFill.style.width = '100%';
    timerFill.style.background = '#00ff88';
    function tick() {
      if (!defenseState.active) return;
      const elapsed = performance.now() - timerStart;
      const pct = Math.max(0, 1 - elapsed / timerDuration) * 100;
      timerFill.style.width = pct + '%';
      if (pct > 50) timerFill.style.background = '#00ff88';
      else if (pct > 25) timerFill.style.background = '#ffff00';
      else timerFill.style.background = '#ff0044';
      if (pct > 0 && defenseState.active) timerRaf = requestAnimationFrame(tick);
    }
    tick();
  }

  function runWave(waveNum) {
    if (!defenseState.active) return;
    if (waveNum > totalWaves || hp <= 0) {
      endGame();
      return;
    }
    wave = waveNum;
    updateStats();

    const atk = genAttack(waveNum);

    // Intrusion panel: show attack
    addIntrusionLine(`[WAVE ${waveNum}] =============================`, 'def-warn');
    const t1 = setTimeout(() => {
      if (!defenseState.active) return;
      addIntrusionLine(`[${new Date().toLocaleTimeString()}] ALERT: ${atk.intrusion}`, 'def-hostile');
      addHostilePackets();
      sfx.error();
      addAlert('THREAT: ' + atk.intrusion.substring(0, 35), 'danger');
    }, 500);

    const t2 = setTimeout(() => {
      if (!defenseState.active) return;
      addIntrusionLine(`  Source: ${randIP()} -> Target: ${randIP()}`);
      addIntrusionLine(`  Threat level: ${atk.dmg > 20 ? 'CRITICAL' : atk.dmg > 15 ? 'HIGH' : 'MEDIUM'}`);
    }, 1000);

    // Command panel: prompt user
    const t3 = setTimeout(() => {
      if (!defenseState.active) return;
      promptMsg.innerHTML = `<span style="color:#ff4444">TYPE:</span> <span style="color:#00ffff">${escapeHtml(atk.cmd)}</span>`;
      input.disabled = false;
      input.value = '';
      input.placeholder = atk.hint + '...';
      input.focus();
      sfx.navigate();

      animateTimer(atk.time);

      // Timeout if not answered
      currentTimer = setTimeout(() => {
        if (!defenseState.active) return;
        handleMiss(atk);
        const t = setTimeout(() => runWave(waveNum + 1), 1500);
        defenseState.timers.push(t);
      }, atk.time);
      defenseState.timers.push(currentTimer);

    }, 1500);

    defenseState.timers.push(t1, t2, t3);
  }

  function handleSubmit() {
    if (!defenseState.active || input.disabled) return;
    const typed = input.value.trim();
    const atk = genAttackFromCurrent();

    // Get the expected command from the prompt
    const expected = promptMsg.querySelector('span:last-child')?.textContent || '';

    if (typed === expected) {
      handleBlock(expected);
    } else {
      // Show error but let them keep trying
      feedback.textContent = 'SYNTAX ERROR - try again!';
      feedback.style.color = '#ff4444';
      sfx.error();
      input.value = '';
      setTimeout(() => { if (feedback) feedback.textContent = ''; }, 1000);
    }
  }

  function handleBlock(cmd) {
    clearTimeout(currentTimer);
    if (timerRaf) cancelAnimationFrame(timerRaf);
    input.disabled = true;

    const elapsed = performance.now() - timerStart;
    const timeBonus = Math.floor(Math.max(0, (1 - elapsed / timerDuration)) * 50);
    const wavePts = 100 + wave * 20 + timeBonus;

    blocked++;
    score += wavePts;
    updateStats();

    addCmdLine(`$ ${cmd}`, 'def-success');
    addCmdLine(`  [OK] Threat neutralized (+${wavePts} pts)`, 'def-success');
    addIntrusionLine(`  >> BLOCKED by firewall`, 'def-blocked');
    removeHostilePackets();

    feedback.textContent = `BLOCKED! +${wavePts} pts`;
    feedback.style.color = '#00ff88';
    promptMsg.innerHTML = '<span style="color:#00ff88">THREAT NEUTRALIZED</span>';
    sfx.create();
    addAlert('BLOCKED: +' + wavePts + ' pts', 'success');

    const t = setTimeout(() => {
      feedback.textContent = '';
      runWave(wave + 1);
    }, 1500);
    defenseState.timers.push(t);
  }

  function handleMiss(atk) {
    if (timerRaf) cancelAnimationFrame(timerRaf);
    input.disabled = true;
    missed++;
    hp = Math.max(0, hp - atk.dmg);
    updateStats();

    addCmdLine(`  [FAILED] No response - ${atk.dmg}% damage!`, 'def-fail');
    addIntrusionLine(`  >> ATTACK SUCCEEDED - firewall breached`, 'def-hostile');
    feedback.textContent = `BREACHED! -${atk.dmg}% HP`;
    feedback.style.color = '#ff0044';
    promptMsg.innerHTML = '<span style="color:#ff0044">DEFENSE FAILED</span>';
    sfx.gameBad();
    addAlert('BREACH: -' + atk.dmg + '% HP', 'danger');

    // Flash red on network
    for (let i = 0; i < 5; i++) {
      netPackets.push({
        x: Math.random() * netCanvas.width, y: Math.random() * netCanvas.height,
        vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4,
        color: '#ff0044', size: 4, hostile: true
      });
    }

    if (hp <= 0) {
      const t = setTimeout(() => endGame(), 500);
      defenseState.timers.push(t);
    }
  }

  // We need the current attack info from the prompt
  function genAttackFromCurrent() {
    return {};
  }

  function endGame() {
    defenseState.active = false;
    input.disabled = true;
    if (timerRaf) cancelAnimationFrame(timerRaf);

    const won = hp > 0;

    const resultDiv = document.createElement('div');
    resultDiv.className = 'def-result ' + (won ? 'def-result-win' : 'def-result-lose');
    resultDiv.innerHTML = `
      <div class="def-result-title">${won ? 'SYSTEM DEFENDED' : 'SYSTEM COMPROMISED'}</div>
      <div class="def-result-stats">
        <div>Waves survived: ${wave > totalWaves ? totalWaves : wave - 1} / ${totalWaves}</div>
        <div>Attacks blocked: ${blocked}</div>
        <div>Attacks missed: ${missed}</div>
        <div>Final score: ${score}</div>
        <div>Firewall HP: ${hp}%</div>
      </div>
      <div class="def-result-grade">${won ? (score > 1500 ? 'S RANK - ELITE HACKER' : score > 1000 ? 'A RANK - EXPERT' : 'B RANK - DEFENDER') : 'F RANK - COMPROMISED'}</div>
    `;
    document.getElementById('def-grid').appendChild(resultDiv);

    if (won) sfx.gamePerfect(); else sfx.gameBad();
  }

  // Input handling
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  });

  // Init
  initNetVis();
  drawNet();
  updateStats();

  addIntrusionLine('[SYSTEM] Firewall Defense System v2.0.4');
  addIntrusionLine('[SYSTEM] Monitoring incoming connections...');
  addCmdLine('> Defense module loaded.');
  addCmdLine('> Type commands exactly as shown to block attacks.');
  addCmdLine('> Speed and accuracy earn bonus points.');

  const t = setTimeout(() => {
    addIntrusionLine('[WARNING] Hostile activity detected!', 'def-warn');
    addAlert('INTRUSION DETECTED', 'danger');
    sfx.error();
    const t2 = setTimeout(() => runWave(1), 1500);
    defenseState.timers.push(t2);
  }, 2000);
  defenseState.timers.push(t);
}

const gameState = { raf: null };

function startTurtleGame(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const hud = document.getElementById('game-hud');

  const GROUND_Y = H * 0.55;
  const SPEED = 3;
  const TURTLE_W = 36;
  const TURTLE_H = 24;

  let turtleX = -W / 2 + 40;
  let direction = 1;
  let running = true;
  let bestScore = Infinity;
  const trail = [];
  const explosionParticles = [];
  let flashAlpha = 0;
  let attempts = 0;
  let stopped = false;

  function drawBackground() {
    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, '#0a001a');
    grad.addColorStop(0.5, '#1a0044');
    grad.addColorStop(1, '#0d0025');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, GROUND_Y + 20);
    // twinkling stars
    const starSeed = [23,67,112,198,245,310,370,420,55,160,290,440,80,350,15,460,130,275,390,45];
    const starColors = ['#ff44ff','#00ffff','#ffff00','#00ff88','#ff6600'];
    const t = Date.now() / 1000;
    for (let i = 0; i < starSeed.length; i++) {
      const sx = starSeed[i] % W;
      const sy = (starSeed[i] * 7 + i * 31) % (GROUND_Y - 20) + 10;
      const twinkle = 0.4 + Math.sin(t * 2 + i * 1.7) * 0.4;
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = starColors[i % starColors.length];
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    // ground
    ctx.fillStyle = '#0a0022';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    // neon grass
    for (let gx = 0; gx < W; gx += 6) {
      ctx.fillStyle = gx % 12 === 0 ? '#00ff88' : '#008844';
      ctx.globalAlpha = 0.6;
      ctx.fillRect(gx, GROUND_Y - 2, 3, 4);
    }
    ctx.globalAlpha = 1;
    // ground line
    ctx.strokeStyle = '#00ff88';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawTarget() {
    const cx = W / 2;
    // pole
    ctx.fillStyle = '#AA8800';
    ctx.fillRect(cx - 2, GROUND_Y - 50, 4, 50);
    // flag
    ctx.fillStyle = '#FF4444';
    ctx.beginPath();
    ctx.moveTo(cx + 2, GROUND_Y - 50);
    ctx.lineTo(cx + 22, GROUND_Y - 42);
    ctx.lineTo(cx + 2, GROUND_Y - 34);
    ctx.fill();
    // target zone lines
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, GROUND_Y - 55);
    ctx.lineTo(cx, GROUND_Y + 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTurtle(x) {
    const screenX = W / 2 + x;
    const ty = GROUND_Y - TURTLE_H + 4;
    // shell
    ctx.fillStyle = '#33AA33';
    ctx.beginPath();
    ctx.ellipse(screenX, ty, TURTLE_W / 2, TURTLE_H / 2, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#116611';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(screenX, ty, TURTLE_W / 2, TURTLE_H / 2, 0, Math.PI, 0);
    ctx.stroke();
    // shell pattern
    ctx.fillStyle = '#44CC44';
    ctx.fillRect(screenX - 8, ty - 10, 4, 4);
    ctx.fillRect(screenX + 4, ty - 10, 4, 4);
    ctx.fillRect(screenX - 2, ty - 6, 4, 4);
    // head
    const headDir = direction;
    ctx.fillStyle = '#33AA33';
    ctx.beginPath();
    ctx.arc(screenX + headDir * (TURTLE_W / 2 + 6), ty + 2, 7, 0, Math.PI * 2);
    ctx.fill();
    // eye
    ctx.fillStyle = '#000';
    ctx.fillRect(screenX + headDir * (TURTLE_W / 2 + 8), ty - 1, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(screenX + headDir * (TURTLE_W / 2 + 9), ty - 1, 1, 1);
    // legs
    ctx.fillStyle = '#228822';
    const legY = ty + TURTLE_H / 2 - 6;
    ctx.fillRect(screenX - 12, legY, 6, 6);
    ctx.fillRect(screenX + 6, legY, 6, 6);
  }

  function drawHUD() {
    ctx.fillStyle = '#FFCC00';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Attempt: ${attempts}`, 10, 20);
    if (bestScore < Infinity) {
      ctx.textAlign = 'right';
      ctx.fillText(`Best: ${bestScore}px`, W - 10, 20);
    }
  }

  function drawResult(distance) {
    ctx.fillStyle = 'rgba(10, 0, 30, 0.75)';
    ctx.fillRect(W / 2 - 145, H / 2 - 55, 290, 110);
    const hue = (Date.now() / 10) % 360;
    ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
    ctx.lineWidth = 3;
    ctx.strokeRect(W / 2 - 145, H / 2 - 55, 290, 110);
    ctx.shadowBlur = 0;

    ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${distance}px away!`, W / 2, H / 2 - 15);

    let msg = '';
    if (distance === 0) msg = 'PERFECT!!';
    else if (distance <= 5) msg = 'AMAZING!';
    else if (distance <= 15) msg = 'Great!';
    else if (distance <= 40) msg = 'Not bad!';
    else if (distance <= 80) msg = 'Try again...';
    else msg = 'Way off!';

    ctx.fillStyle = distance <= 5 ? '#00ff88' : distance <= 40 ? '#ffff00' : '#ff4444';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillText(msg, W / 2, H / 2 + 10);
    ctx.shadowBlur = 0;

    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 80%, 65%)`;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('Press SPACE to retry', W / 2, H / 2 + 38);
  }

  function drawTrail() {
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      t.life -= 0.02;
      if (t.life <= 0) { trail.splice(i, 1); continue; }
      ctx.fillStyle = t.color;
      ctx.globalAlpha = t.life * 0.5;
      ctx.fillRect(W / 2 + t.x - 1, t.y - 1, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawExplosion() {
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
      const p = explosionParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= 0.02;
      if (p.life <= 0) { explosionParticles.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function spawnExplosion(sx, sy) {
    const colors = ['#ff44ff', '#00ffff', '#ffff00', '#00ff88', '#ff6600', '#ff0066'];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      explosionParticles.push({
        x: sx, y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 0.7 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawTarget();
    drawTrail();

    if (running) {
      turtleX += direction * SPEED;
      if (turtleX > W / 2 - 30) { turtleX = W / 2 - 30; direction = -1; sfx.click(); }
      if (turtleX < -W / 2 + 30) { turtleX = -W / 2 + 30; direction = 1; sfx.click(); }
      bounceFrame++;
      if (bounceFrame % 3 === 0) {
        trail.push({
          x: turtleX, y: GROUND_Y - TURTLE_H / 2,
          life: 1,
          color: ['#ff44ff', '#00ffff', '#ffff00'][bounceFrame % 3]
        });
      }
    }

    drawTurtle(turtleX);
    drawExplosion();
    drawHUD();

    if (stopped) {
      const dist = Math.round(Math.abs(turtleX));
      drawResult(dist);
    }

    if (flashAlpha > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = flashAlpha;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      flashAlpha -= 0.05;
    }

    gameState.raf = requestAnimationFrame(frame);
  }

  let bounceFrame = 0;

  function onKey(e) {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (running) {
      running = false;
      stopped = true;
      attempts++;
      const dist = Math.round(Math.abs(turtleX));
      if (dist < bestScore) bestScore = dist;
      flashAlpha = 0.6;
      spawnExplosion(W / 2 + turtleX, GROUND_Y - TURTLE_H / 2);
      if (dist <= 5) sfx.gamePerfect();
      else if (dist <= 40) sfx.gameGood();
      else { sfx.gameStop(); sfx.gameBad(); }
      hud.textContent = `Stopped ${dist}px from target! SPACE to retry.`;
    } else {
      sfx.gameRetry();
      running = true;
      stopped = false;
      turtleX = -W / 2 + 40;
      direction = 1;
      hud.textContent = 'Press SPACE to stop the turtle!';
    }
  }

  canvas.addEventListener('keydown', onKey);

  if (gameState.raf) cancelAnimationFrame(gameState.raf);
  frame();
}

// --- View Toggle ---

function setViewMode(mode) {
  sfx.viewToggle();
  state.viewMode = mode;
  const area = document.getElementById('file-area');
  area.classList.remove('grid-view', 'list-view');
  area.classList.add(mode + '-view');

  document.getElementById('btn-grid-view').classList.toggle('active', mode === 'grid');
  document.getElementById('btn-list-view').classList.toggle('active', mode === 'list');

  navigateTo(state.currentFolderId, false);
}

// --- Modal System ---

function showModal(title, bodyHtml, buttons) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalButtons = document.getElementById('modal-buttons');

    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalButtons.innerHTML = '';

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.text;
      if (btn.primary) button.className = 'primary';
      button.addEventListener('click', () => {
        sfx.click();
        overlay.style.display = 'none';
        resolve(btn.value);
      });
      modalButtons.appendChild(button);
    });

    sfx.modalOpen();
    overlay.style.display = 'flex';

    document.querySelector('.modal-close').onclick = () => {
      sfx.modalClose();
      overlay.style.display = 'none';
      resolve(null);
    };

    const input = modalBody.querySelector('input, textarea');
    if (input) {
      setTimeout(() => {
        input.focus();
        if (input.tagName === 'INPUT') input.select();
      }, 50);
    }
  });
}

async function showPrompt(title, message, defaultValue = '') {
  const html = `<label>${escapeHtml(message)}</label>
    <input type="text" id="modal-input" value="${escapeHtml(defaultValue)}">`;

  const result = await showModal(title, html, [
    { text: 'OK', value: 'ok', primary: true },
    { text: 'Cancel', value: null }
  ]);

  if (result === 'ok') {
    return document.getElementById('modal-input').value.trim();
  }
  return null;
}

async function showConfirm(title, message) {
  const html = `<p>${escapeHtml(message)}</p>`;
  const result = await showModal(title, html, [
    { text: 'Yes', value: true, primary: true },
    { text: 'No', value: false }
  ]);
  return result === true;
}

async function showAlert(title, message) {
  if (title === 'Error') sfx.error();
  const html = `<p>${escapeHtml(message)}</p>`;
  await showModal(title, html, [
    { text: 'OK', value: true, primary: true }
  ]);
}

function showFileEditor(name, content, onSave) {
  const overlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');
  const ext = getExtension(name);

  document.getElementById('modal').classList.add('modal-editor');
  modalTitle.textContent = name;
  modalBody.innerHTML = `
    <div class="np-toolbar">
      <button class="np-btn" id="np-find-btn" title="Find (Ctrl+F)">Find</button>
      <button class="np-btn" id="np-replace-btn" title="Replace (Ctrl+H)">Replace</button>
      <span class="np-sep"></span>
      <button class="np-btn" id="np-wrap-btn" title="Toggle Word Wrap">Wrap: ON</button>
      <button class="np-btn" id="np-goto-btn" title="Go to Line">Go To</button>
      <span class="np-spacer"></span>
      <span class="np-filename">${escapeHtml(name)}</span>
    </div>
    <div class="np-search-bar" id="np-search-bar" style="display:none;">
      <input type="text" id="np-search-input" placeholder="Find..." class="np-search-field"/>
      <input type="text" id="np-replace-input" placeholder="Replace..." class="np-search-field" style="display:none;"/>
      <button class="np-btn np-sm" id="np-prev-btn">&#9650;</button>
      <button class="np-btn np-sm" id="np-next-btn">&#9660;</button>
      <button class="np-btn np-sm" id="np-replace-one" style="display:none;">R1</button>
      <button class="np-btn np-sm" id="np-replace-all-btn" style="display:none;">RA</button>
      <span id="np-match-count" class="np-match-info"></span>
      <button class="np-btn np-sm" id="np-close-search">✕</button>
    </div>
    <div class="np-editor-wrap">
      <div class="np-line-numbers" id="np-line-numbers"></div>
      <div class="np-edit-area">
        <div class="np-highlight-layer" id="np-highlight"></div>
        <textarea id="file-editor-content" class="np-textarea" spellcheck="false">${escapeHtml(content)}</textarea>
      </div>
    </div>
    <div class="np-status-bar">
      <span id="np-status-pos">Ln 1, Col 1</span>
      <span id="np-status-lines">Lines: ${(content.match(/\n/g) || []).length + 1}</span>
      <span id="np-status-chars">Chars: ${content.length}</span>
      <span id="np-status-ext">${ext || 'TXT'}</span>
    </div>`;
  modalButtons.innerHTML = '';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'primary';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Close';

  modalButtons.appendChild(saveBtn);
  modalButtons.appendChild(cancelBtn);

  overlay.style.display = 'flex';

  const textarea = document.getElementById('file-editor-content');
  const lineNums = document.getElementById('np-line-numbers');
  const highlightLayer = document.getElementById('np-highlight');
  const searchBar = document.getElementById('np-search-bar');
  const searchInput = document.getElementById('np-search-input');
  const replaceInput = document.getElementById('np-replace-input');
  const matchCount = document.getElementById('np-match-count');
  let wrapOn = true;
  let searchMode = 'find';

  function updateLineNumbers() {
    const lines = textarea.value.split('\n');
    const count = lines.length;
    let html = '';
    for (let i = 1; i <= count; i++) {
      html += i + '\n';
    }
    lineNums.textContent = html;
    document.getElementById('np-status-lines').textContent = 'Lines: ' + count;
    document.getElementById('np-status-chars').textContent = 'Chars: ' + textarea.value.length;
  }

  function updateCursorPos() {
    const val = textarea.value;
    const pos = textarea.selectionStart;
    const before = val.substring(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;
    const col = pos - before.lastIndexOf('\n');
    document.getElementById('np-status-pos').textContent = `Ln ${line}, Col ${col}`;
  }

  function updateHighlight() {
    const text = textarea.value;
    let html = syntaxHighlight(text, ext);
    html += '\n';
    highlightLayer.innerHTML = html;
  }

  function syntaxHighlight(text, fileExt) {
    const escaped = escapeHtml(text);
    let result = escaped;

    result = result.replace(/(\/\/[^\n]*)/g, '<span class="np-hl-comment">$1</span>');
    result = result.replace(/(#[^\n]*)/g, '<span class="np-hl-comment">$1</span>');

    result = result.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;|&#039;(?:[^&]|&(?!#039;))*?&#039;)/g, '<span class="np-hl-string">$1</span>');

    result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="np-hl-number">$1</span>');

    const keywords = ['function','return','if','else','for','while','do','switch','case','break','continue','var','let','const','class','import','export','default','new','this','try','catch','finally','throw','async','await','def','print','True','False','None','TODO','FIXME','NOTE'];
    const kwRegex = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'g');
    result = result.replace(kwRegex, '<span class="np-hl-keyword">$1</span>');

    return result;
  }

  function syncScroll() {
    lineNums.scrollTop = textarea.scrollTop;
    highlightLayer.scrollTop = textarea.scrollTop;
    highlightLayer.scrollLeft = textarea.scrollLeft;
  }

  // Search functionality
  let currentMatchIdx = -1;
  let matches = [];

  function doSearch() {
    const query = searchInput.value;
    if (!query) { matchCount.textContent = ''; matches = []; return; }
    matches = [];
    let idx = textarea.value.indexOf(query);
    while (idx !== -1) {
      matches.push(idx);
      idx = textarea.value.indexOf(query, idx + 1);
    }
    matchCount.textContent = matches.length > 0 ? `${matches.length} found` : 'No match';
    if (matches.length > 0) {
      currentMatchIdx = 0;
      goToMatch();
    }
  }

  function goToMatch() {
    if (matches.length === 0) return;
    const pos = matches[currentMatchIdx];
    const query = searchInput.value;
    textarea.focus();
    textarea.setSelectionRange(pos, pos + query.length);
    matchCount.textContent = `${currentMatchIdx + 1}/${matches.length}`;
  }

  function nextMatch() {
    if (matches.length === 0) return;
    currentMatchIdx = (currentMatchIdx + 1) % matches.length;
    goToMatch();
    sfx.click();
  }

  function prevMatch() {
    if (matches.length === 0) return;
    currentMatchIdx = (currentMatchIdx - 1 + matches.length) % matches.length;
    goToMatch();
    sfx.click();
  }

  function replaceOne() {
    if (matches.length === 0 || currentMatchIdx < 0) return;
    const query = searchInput.value;
    const repl = replaceInput.value;
    const pos = matches[currentMatchIdx];
    const val = textarea.value;
    textarea.value = val.substring(0, pos) + repl + val.substring(pos + query.length);
    sfx.click();
    updateLineNumbers();
    updateHighlight();
    doSearch();
  }

  function replaceAll() {
    const query = searchInput.value;
    const repl = replaceInput.value;
    if (!query) return;
    textarea.value = textarea.value.split(query).join(repl);
    sfx.create();
    updateLineNumbers();
    updateHighlight();
    doSearch();
  }

  function showSearch(mode) {
    searchMode = mode;
    searchBar.style.display = 'flex';
    const isReplace = mode === 'replace';
    replaceInput.style.display = isReplace ? '' : 'none';
    document.getElementById('np-replace-one').style.display = isReplace ? '' : 'none';
    document.getElementById('np-replace-all-btn').style.display = isReplace ? '' : 'none';
    searchInput.focus();
    sfx.click();
  }

  function hideSearch() {
    searchBar.style.display = 'none';
    matchCount.textContent = '';
    matches = [];
    textarea.focus();
  }

  function goToLine() {
    const lines = textarea.value.split('\n');
    const maxLine = lines.length;
    const input = prompt('Go to line (1-' + maxLine + '):');
    if (!input) return;
    const lineNum = parseInt(input);
    if (isNaN(lineNum) || lineNum < 1 || lineNum > maxLine) return;
    let pos = 0;
    for (let i = 0; i < lineNum - 1; i++) pos += lines[i].length + 1;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
    sfx.navigate();
  }

  textarea.addEventListener('input', () => {
    updateLineNumbers();
    updateHighlight();
    updateCursorPos();
  });
  textarea.addEventListener('scroll', syncScroll);
  textarea.addEventListener('click', updateCursorPos);
  textarea.addEventListener('keyup', updateCursorPos);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      updateLineNumbers();
      updateHighlight();
    }
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      e.stopPropagation();
      showSearch('find');
    }
    if (e.ctrlKey && e.key === 'h') {
      e.preventDefault();
      e.stopPropagation();
      showSearch('replace');
    }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      e.stopPropagation();
      sfx.create();
      onSave(textarea.value);
    }
  });

  document.getElementById('np-find-btn').addEventListener('click', () => showSearch('find'));
  document.getElementById('np-replace-btn').addEventListener('click', () => showSearch('replace'));
  document.getElementById('np-close-search').addEventListener('click', hideSearch);
  document.getElementById('np-next-btn').addEventListener('click', nextMatch);
  document.getElementById('np-prev-btn').addEventListener('click', prevMatch);
  document.getElementById('np-replace-one').addEventListener('click', replaceOne);
  document.getElementById('np-replace-all-btn').addEventListener('click', replaceAll);
  document.getElementById('np-goto-btn').addEventListener('click', goToLine);
  searchInput.addEventListener('input', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); nextMatch(); }
    if (e.key === 'Escape') hideSearch();
  });

  document.getElementById('np-wrap-btn').addEventListener('click', () => {
    wrapOn = !wrapOn;
    textarea.style.whiteSpace = wrapOn ? 'pre-wrap' : 'pre';
    highlightLayer.style.whiteSpace = wrapOn ? 'pre-wrap' : 'pre';
    document.getElementById('np-wrap-btn').textContent = 'Wrap: ' + (wrapOn ? 'ON' : 'OFF');
    sfx.viewToggle();
  });

  function closeEditor() {
    document.getElementById('modal').classList.remove('modal-editor');
    overlay.style.display = 'none';
  }

  saveBtn.addEventListener('click', () => {
    sfx.create();
    closeEditor();
    onSave(textarea.value);
  });

  cancelBtn.addEventListener('click', () => {
    sfx.modalClose();
    closeEditor();
  });

  document.querySelector('.modal-close').onclick = () => {
    closeEditor();
  };

  updateLineNumbers();
  updateHighlight();
  setTimeout(() => { textarea.focus(); updateCursorPos(); }, 50);
}

// --- Utility ---

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Keyboard Shortcuts ---

document.addEventListener('keydown', (e) => {
  if (document.getElementById('modal-overlay').style.display === 'flex') {
    const isEditor = document.getElementById('modal').classList.contains('modal-editor');
    if (e.key === 'Enter' && !isEditor) {
      const primary = document.querySelector('.modal-buttons .primary');
      if (primary) primary.click();
    }
    if (e.key === 'Escape' && !isEditor) {
      document.querySelector('.modal-close').click();
    }
    return;
  }

  if (e.key === 'Delete') handleDelete();
  if (e.key === 'F2') handleRename();
  if (e.key === 'Backspace') {
    e.preventDefault();
    goUp();
  }
  if (e.key === 'Enter' && state.selectedItems.size === 1) {
    const id = [...state.selectedItems][0];
    const el = document.querySelector(`.file-item[data-id="${id}"]`);
    if (el) {
      if (el.dataset.type === 'folder') navigateTo(parseInt(id));
      else openFileViewer({ id: parseInt(id) });
    }
  }
});

// --- Toolbar Bindings ---

document.getElementById('btn-back').addEventListener('click', goBack);
document.getElementById('btn-up').addEventListener('click', goUp);
document.getElementById('btn-new-folder').addEventListener('click', handleNewFolder);
document.getElementById('btn-new-file').addEventListener('click', handleNewFile);
document.getElementById('btn-rename').addEventListener('click', handleRename);
document.getElementById('btn-delete').addEventListener('click', handleDelete);
document.getElementById('btn-grid-view').addEventListener('click', () => setViewMode('grid'));
document.getElementById('btn-list-view').addEventListener('click', () => setViewMode('list'));

// --- Floating Particle Background ---

function initParticles() {
  const canvas = document.getElementById('bg-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colors = ['#ff44ff', '#00ffff', '#00ff88', '#ffff00', '#ff6600', '#ff0066', '#8844ff'];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.4 - 0.1,
      size: Math.random() < 0.3 ? 3 : 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      pulse: Math.random() * Math.PI * 2
    });
  }

  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.03;
      const alpha = 0.4 + Math.sin(p.pulse) * 0.3;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(drawParticles);
  }
  drawParticles();
}

// --- Browser Application ---

const browserPages = {
  'neon://home': {
    title: 'NeonNet Home',
    body: `
      <div class="br-home">
        <div class="br-logo">&#127760; NeonNet</div>
        <div class="br-tagline">The Retro Web Experience</div>
        <div class="br-search-box">
          <input type="text" id="br-search-input" placeholder="Search the neon web..." />
          <button id="br-search-go">SEARCH</button>
        </div>
        <div class="br-links">
          <a href="neon://news" class="br-link">&#128240; NeonNews</a>
          <a href="neon://arcade" class="br-link">&#127918; Arcade Zone</a>
          <a href="neon://mail" class="br-link">&#128231; NeonMail</a>
          <a href="neon://wiki" class="br-link">&#128214; CyberWiki</a>
          <a href="neon://shop" class="br-link">&#128722; PixelShop</a>
          <a href="neon://chat" class="br-link">&#128172; ChatRoom</a>
          <a href="neon://darkmarket" class="br-link" style="color:#ff4444;border-color:#ff4444;">&#128128; DarkMarket</a>
        </div>
      </div>`
  },
  'neon://news': {
    title: 'NeonNews - Latest Headlines',
    body: `
      <div class="br-page">
        <h1 class="br-page-title" style="color:#ff44ff;">&#128240; NEON NEWS</h1>
        <div class="br-article">
          <div class="br-headline">BREAKING: Pixel Art Declared Official Art Form</div>
          <div class="br-meta">2 hours ago &middot; CyberDesk</div>
          <p>The International Digital Arts Council has officially recognized pixel art as a legitimate fine art medium. Museums worldwide are now accepting 32x32 submissions.</p>
        </div>
        <div class="br-article">
          <div class="br-headline">New CRT Monitor Fetches $50,000 at Auction</div>
          <div class="br-meta">5 hours ago &middot; RetroTech Weekly</div>
          <p>A mint-condition 1998 Sony Trinitron sold at auction today, setting a new record for vintage display hardware. "The scanlines are immaculate," said the buyer.</p>
        </div>
        <div class="br-article">
          <div class="br-headline">Scientists Confirm: Synthwave Improves Coding Speed by 47%</div>
          <div class="br-meta">Yesterday &middot; Digital Science Journal</div>
          <p>A double-blind study has confirmed what developers have long suspected. Participants listening to retrowave produced significantly more lines of code per hour.</p>
        </div>
        <div class="br-article">
          <div class="br-headline">Y3K Bug Already Causing Panic Among Time Travelers</div>
          <div class="br-meta">3 days ago &middot; ChronoBytes</div>
          <p>Reports from the future indicate that the year 3000 date rollover is already wreaking havoc on temporal navigation systems.</p>
        </div>
      </div>`
  },
  'neon://arcade': {
    title: 'Arcade Zone',
    body: `
      <div class="br-page">
        <h1 class="br-page-title" style="color:#ffff00;">&#127918; ARCADE ZONE</h1>
        <div class="br-grid">
          <div class="br-card">
            <div class="br-card-icon" style="font-size:32px;">&#128126;</div>
            <div class="br-card-title">Space Invaders 2099</div>
            <div class="br-card-desc">Defend Earth from neon aliens</div>
            <div class="br-card-tag">HIGH SCORE: 9,999,999</div>
          </div>
          <div class="br-card">
            <div class="br-card-icon" style="font-size:32px;">&#128013;</div>
            <div class="br-card-title">Cyber Snake</div>
            <div class="br-card-desc">Classic snake with power-ups</div>
            <div class="br-card-tag">HIGH SCORE: 1,337,420</div>
          </div>
          <div class="br-card">
            <div class="br-card-icon" style="font-size:32px;">&#127922;</div>
            <div class="br-card-title">Tetris Infinity</div>
            <div class="br-card-desc">Blocks never stop falling</div>
            <div class="br-card-tag">HIGH SCORE: 5,000,000</div>
          </div>
          <div class="br-card">
            <div class="br-card-icon" style="font-size:32px;">&#128163;</div>
            <div class="br-card-title">Pixel Blaster</div>
            <div class="br-card-desc">Shoot everything that moves</div>
            <div class="br-card-tag">HIGH SCORE: 7,777,777</div>
          </div>
        </div>
        <p style="text-align:center;color:#888;margin-top:16px;font-size:14px;">[ Games are simulated. Insert coin to continue. ]</p>
      </div>`
  },
  'neon://mail': {
    title: 'NeonMail - Inbox',
    body: `
      <div class="br-page">
        <h1 class="br-page-title" style="color:#00ffff;">&#128231; NEONMAIL</h1>
        <div class="br-inbox">
          <div class="br-mail unread">
            <span class="br-mail-from">CyberAdmin</span>
            <span class="br-mail-subject">Welcome to NeonNet!</span>
            <span class="br-mail-date">Today</span>
          </div>
          <div class="br-mail unread">
            <span class="br-mail-from">N1GH7_R4V3N</span>
            <span class="br-mail-subject">Re: Did you get the files?</span>
            <span class="br-mail-date">Today</span>
          </div>
          <div class="br-mail">
            <span class="br-mail-from">PixelShop</span>
            <span class="br-mail-subject">Your order has been DIGITIZED</span>
            <span class="br-mail-date">Yesterday</span>
          </div>
          <div class="br-mail">
            <span class="br-mail-from">0xDEADBEEF</span>
            <span class="br-mail-subject">FREE V-BUCKS!!! NOT A SCAM!!!</span>
            <span class="br-mail-date">3 days ago</span>
          </div>
          <div class="br-mail">
            <span class="br-mail-from">SysOp</span>
            <span class="br-mail-subject">Scheduled downtime: Grid Sector 7</span>
            <span class="br-mail-date">Last week</span>
          </div>
        </div>
      </div>`
  },
  'neon://wiki': {
    title: 'CyberWiki',
    body: `
      <div class="br-page">
        <h1 class="br-page-title" style="color:#00ff88;">&#128214; CYBERWIKI</h1>
        <h2 class="br-wiki-title">Vaporwave</h2>
        <div class="br-wiki-body">
          <p><strong>Vaporwave</strong> is a microgenre of electronic music and visual art that emerged in the early 2010s. It is defined by its heavy use of samples from 1980s and 1990s music, often manipulated through chopped and screwed techniques.</p>
          <p>The aesthetic combines Japanese text, early web design, glitch art, 3D-rendered objects, and a nostalgic longing for an idealized digital past that never quite existed.</p>
          <h3>Key Characteristics</h3>
          <ul>
            <li>Slowed-down smooth jazz and elevator music samples</li>
            <li>Heavy reverb and echo effects</li>
            <li>Neon pink and cyan color palettes</li>
            <li>Roman busts, palm trees, and dolphins</li>
            <li>Japanese and Greek text for aesthetic purposes</li>
            <li>Windows 95/98 interface nostalgia</li>
          </ul>
          <h3>Notable Subgenres</h3>
          <p><em>Future Funk</em> &mdash; More upbeat, sample-heavy dance music.<br>
          <em>Mallsoft</em> &mdash; Ambient sounds reminiscent of empty shopping malls.<br>
          <em>Late Night Lo-Fi</em> &mdash; Chill beats for late-night coding sessions.</p>
        </div>
      </div>`
  },
  'neon://shop': {
    title: 'PixelShop',
    body: `
      <div class="br-page">
        <h1 class="br-page-title" style="color:#ff6600;">&#128722; PIXELSHOP</h1>
        <div class="br-grid">
          <div class="br-card shop-card">
            <div class="br-card-icon" style="font-size:28px;">&#128187;</div>
            <div class="br-card-title">Retro CRT Monitor</div>
            <div class="br-card-desc">1024x768, 85Hz, maximum scanlines</div>
            <div class="br-card-price">$4,999.99</div>
          </div>
          <div class="br-card shop-card">
            <div class="br-card-icon" style="font-size:28px;">&#9000;</div>
            <div class="br-card-title">Mechanical Keyboard</div>
            <div class="br-card-desc">Cherry MX Clickiest, RGB per key</div>
            <div class="br-card-price">$299.99</div>
          </div>
          <div class="br-card shop-card">
            <div class="br-card-icon" style="font-size:28px;">&#127925;</div>
            <div class="br-card-title">Synthwave Album Pack</div>
            <div class="br-card-desc">50 albums, DRM-free FLAC</div>
            <div class="br-card-price">$49.99</div>
          </div>
          <div class="br-card shop-card">
            <div class="br-card-icon" style="font-size:28px;">&#128302;</div>
            <div class="br-card-title">RGB LED Strip (10m)</div>
            <div class="br-card-desc">16 million colors, app controlled</div>
            <div class="br-card-price">$29.99</div>
          </div>
        </div>
        <p style="text-align:center;color:#888;margin-top:12px;font-size:13px;">[ All items are simulated. No actual purchase possible. ]</p>
      </div>`
  },
  'neon://chat': {
    title: 'ChatRoom',
    body: `
      <div class="br-page">
        <h1 class="br-page-title" style="color:#ff44ff;">&#128172; NEON CHATROOM</h1>
        <div class="br-chat-log" id="br-chat-log">
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#00ffff;">CyberPunk2077:</span> anyone here?</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#ff44ff;">N30N_QU33N:</span> yep, just vibing</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#00ff88;">xX_H4CK3R_Xx:</span> i just ran worm.exe on my file manager lol</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#ffff00;">RetroWave99:</span> RIP your files</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#ff6600;">PixelMaster:</span> has anyone beaten d3f3nd.exe wave 10?</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#00ffff;">CyberPunk2077:</span> got S rank on my second try B)</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#ff44ff;">N30N_QU33N:</span> sure you did</div>
          <div class="br-chat-msg sys"><em>*** SysOp has entered the chat ***</em></div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#ff4444;">SysOp:</span> reminder: no running h4ck3r.exe on the mainframe</div>
          <div class="br-chat-msg"><span class="br-chat-user" style="color:#00ff88;">xX_H4CK3R_Xx:</span> too late</div>
        </div>
        <div class="br-chat-input-row">
          <input type="text" id="br-chat-input" class="br-chat-input" placeholder="Type a message..." />
          <button id="br-chat-send" class="br-chat-send">SEND</button>
        </div>
      </div>`
  },
  'neon://darkmarket': {
    title: 'DarkMarket - Underground Tools',
    body: `
      <div class="br-page dm-page">
        <div class="dm-header">
          <div class="dm-skull">&#128128;</div>
          <h1 class="dm-title">D A R K M A R K E T</h1>
          <div class="dm-subtitle">Underground Digital Arsenal &mdash; Use at your own risk</div>
          <div class="dm-warning">&#9888; ALL TOOLS INSTALL DIRECTLY TO YOUR SYSTEM &#9888;</div>
        </div>
        <div class="dm-grid" id="dm-grid">
          <div class="dm-item" data-tool="trojan">
            <div class="dm-item-icon">&#128014;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">TR0J4N.exe</div>
              <div class="dm-item-desc">Remote access backdoor. Disguises itself as a system update. Opens reverse shell on port 4444.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9733;&#9734;</span> <span class="dm-sold">2,847 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.05 BTC</div>
              <button class="dm-install-btn" data-name="TR0J4N.exe" data-content="[TROJAN HORSE v4.2 - Remote Access Tool]\nConnects to C2 server on port 4444\nAuto-persistence via registry\nFUD rating: 97%\nBuilder: DarkForge SDK 3.1">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="keylogger">
            <div class="dm-item-icon">&#9000;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">K3YL0GG3R.exe</div>
              <div class="dm-item-desc">Stealth keystroke recorder. Captures passwords, messages, and credit cards. Sends logs every 60s.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <span class="dm-sold">5,120 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.03 BTC</div>
              <button class="dm-install-btn" data-name="K3YL0GG3R.exe" data-content="[KEYLOGGER PRO v7.0]\nCapture mode: ALL_INPUT\nExfil interval: 60s\nStealth: ring-0 rootkit\nLog format: encrypted AES-256\nDrop server: 10.13.37.99">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="ransomware">
            <div class="dm-item-icon">&#128274;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">CRYPT0L0CK.exe</div>
              <div class="dm-item-desc">Military-grade file encryptor. AES-256 + RSA-4096. Custom ransom note. Bitcoin wallet generator built in.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <span class="dm-sold">891 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.15 BTC</div>
              <button class="dm-install-btn" data-name="CRYPT0L0CK.exe" data-content="[RANSOMWARE KIT - CRYPT0L0CK]\nEncryption: AES-256-CBC + RSA-4096\nTargets: .doc .pdf .jpg .png .xls .db\nRansom: 2.5 BTC\nTimer: 72 hours\nWallpaper: SKULL_WARNING.bmp\nNote: README_DECRYPT.txt">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="ddos">
            <div class="dm-item-icon">&#128165;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">DD0S_CANNON.exe</div>
              <div class="dm-item-desc">Distributed denial-of-service toolkit. UDP/TCP/HTTP flood. Built-in botnet controller for 10,000 nodes.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9734;&#9734;</span> <span class="dm-sold">1,203 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.08 BTC</div>
              <button class="dm-install-btn" data-name="DD0S_CANNON.exe" data-content="[DDoS TOOLKIT v2.0 - CANNON]\nModes: UDP_FLOOD TCP_SYN HTTP_GET SLOWLORIS\nBotnet: 10,000 zombies\nAmplification: DNS + NTP + SSDP\nMax throughput: 500 Gbps\nPanel: web-based C2">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="rootkit">
            <div class="dm-item-icon">&#128375;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">R00TK1T.exe</div>
              <div class="dm-item-desc">Kernel-level rootkit. Invisible to all AV. Hooks syscalls, hides processes, survives reboots.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <span class="dm-sold">412 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.20 BTC</div>
              <button class="dm-install-btn" data-name="R00TK1T.exe" data-content="[ROOTKIT - SHADOW RING-0]\nLevel: kernel (ring-0)\nHooks: NtCreateFile, NtQueryDirectoryFile\nPersistence: bootkit MBR\nHidden PIDs: configurable\nAnti-debug: hardware breakpoint detection\nSelf-destruct: remote trigger">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="cryptominer">
            <div class="dm-item-icon">&#9874;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">M1N3R_PR0.exe</div>
              <div class="dm-item-desc">Silent crypto miner. Mines Monero using victim GPU/CPU. Auto-throttles when task manager is open.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9733;&#9734;</span> <span class="dm-sold">7,903 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.02 BTC</div>
              <button class="dm-install-btn" data-name="M1N3R_PR0.exe" data-content="[CRYPTO MINER - SILENT EDITION]\nCoin: Monero (XMR)\nPool: xmr.darkpool.onion:3333\nThreads: auto (80% CPU)\nGPU: CUDA + OpenCL\nEvasion: throttle on taskmgr.exe\nWallet: 4A3Bx...redacted">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="spyware">
            <div class="dm-item-icon">&#128065;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">SP3CTER.exe</div>
              <div class="dm-item-desc">Full surveillance suite. Webcam capture, screenshot every 30s, browser history exfil, microphone recording.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9733;&#9733;</span> <span class="dm-sold">3,271 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.10 BTC</div>
              <button class="dm-install-btn" data-name="SP3CTER.exe" data-content="[SPYWARE SUITE - SP3CTER]\nModules: webcam, mic, screenshots, keylog\nCapture rate: 30s intervals\nExfil: encrypted HTTPS POST\nStorage: hidden %APPDATA% folder\nSize on disk: 47KB (packed)\nAV bypass: polymorphic stub">INSTALL</button>
            </div>
          </div>
          <div class="dm-item" data-tool="phishing">
            <div class="dm-item-icon">&#127907;</div>
            <div class="dm-item-info">
              <div class="dm-item-name">PH1SH_K1T.exe</div>
              <div class="dm-item-desc">Phishing page generator. Clone any login page in one click. Credential harvester with email alerts.</div>
              <div class="dm-item-meta"><span class="dm-rating">&#9733;&#9733;&#9733;&#9734;&#9734;</span> <span class="dm-sold">6,500 sold</span></div>
            </div>
            <div class="dm-item-right">
              <div class="dm-price">0.01 BTC</div>
              <button class="dm-install-btn" data-name="PH1SH_K1T.exe" data-content="[PHISHING TOOLKIT v5.0]\nTemplates: Gmail, Facebook, Instagram, PayPal, Banks\nCloner: auto-scrape + replicate\nHarvester: credentials + 2FA tokens\nHosting: built-in nginx server\nAlert: email on every catch">INSTALL</button>
            </div>
          </div>
        </div>
        <div class="dm-footer">
          <div class="dm-disclaimer">All sales final. No refunds. We are not responsible for what you do with these tools.</div>
          <div class="dm-onion">&#128270; onion://d4rkm4rk3t.onion &mdash; PGP: 0xDEAD BEEF CAFE F00D</div>
        </div>
      </div>`
  }
};

const browserSearchResults = {
  'vaporwave': ['neon://wiki', 'neon://shop', 'neon://news'],
  'games': ['neon://arcade'],
  'game': ['neon://arcade'],
  'arcade': ['neon://arcade'],
  'news': ['neon://news'],
  'mail': ['neon://mail'],
  'email': ['neon://mail'],
  'shop': ['neon://shop'],
  'store': ['neon://shop'],
  'buy': ['neon://shop'],
  'chat': ['neon://chat'],
  'wiki': ['neon://wiki'],
  'hack': ['neon://darkmarket', 'neon://news', 'neon://chat'],
  'virus': ['neon://darkmarket'],
  'malware': ['neon://darkmarket'],
  'trojan': ['neon://darkmarket'],
  'ransomware': ['neon://darkmarket'],
  'dark': ['neon://darkmarket'],
  'exploit': ['neon://darkmarket'],
  'ddos': ['neon://darkmarket'],
  'rootkit': ['neon://darkmarket'],
  'keylogger': ['neon://darkmarket'],
  'music': ['neon://shop', 'neon://wiki'],
  'retro': ['neon://shop', 'neon://wiki', 'neon://news'],
};

function launchBrowser() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');

  modal.classList.add('modal-editor');
  modalTitle.textContent = 'NeonNet Browser';
  modalButtons.innerHTML = '';

  const history = ['neon://home'];
  let histIdx = 0;

  modalBody.innerHTML = `
    <div id="br-toolbar">
      <button id="br-back" class="br-nav-btn" title="Back">&#9664;</button>
      <button id="br-fwd" class="br-nav-btn" title="Forward">&#9654;</button>
      <button id="br-refresh" class="br-nav-btn" title="Refresh">&#8635;</button>
      <button id="br-home-btn" class="br-nav-btn" title="Home">&#8962;</button>
      <input type="text" id="br-address" class="br-address" value="neon://home" />
      <button id="br-go" class="br-nav-btn br-go-btn">GO</button>
    </div>
    <div id="br-tabs">
      <div class="br-tab active">NeonNet Home</div>
    </div>
    <div id="br-viewport"></div>
    <div id="br-statusbar">
      <span id="br-status-text">Ready</span>
      <span id="br-status-url"></span>
    </div>
  `;

  function navigate(url) {
    url = url.trim().toLowerCase();
    if (!url.startsWith('neon://')) url = 'neon://' + url;

    const addr = document.getElementById('br-address');
    addr.value = url;

    const viewport = document.getElementById('br-viewport');
    const tab = document.querySelector('.br-tab.active');
    const statusText = document.getElementById('br-status-text');

    statusText.textContent = 'Loading...';
    viewport.innerHTML = '<div class="br-loading"><div class="br-spinner"></div>Connecting to NeonNet...</div>';

    setTimeout(() => {
      const page = browserPages[url];
      if (page) {
        viewport.innerHTML = page.body;
        if (tab) tab.textContent = page.title;
        statusText.textContent = 'Done';
        wirePageLinks(viewport);
        wirePageFeatures(url);
      } else {
        viewport.innerHTML = `
          <div class="br-error">
            <div style="font-size:48px;margin-bottom:16px;">&#128542;</div>
            <h2>Page Not Found</h2>
            <p>The address <span style="color:#00ffff;">${url}</span> could not be found on NeonNet.</p>
            <p style="color:#666;font-size:13px;">Error code: NEON_404_VOID</p>
            <a href="neon://home" class="br-link" style="margin-top:12px;display:inline-block;">Return to Home</a>
          </div>`;
        if (tab) tab.textContent = 'Not Found';
        statusText.textContent = 'Error: 404';
        wirePageLinks(viewport);
      }

      if (history[histIdx] !== url) {
        history.splice(histIdx + 1);
        history.push(url);
        histIdx = history.length - 1;
      }
    }, 300 + Math.random() * 400);

    sfx.navigate();
  }

  function wirePageLinks(container) {
    container.querySelectorAll('a[href^="neon://"]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(a.getAttribute('href'));
      });
      a.addEventListener('mouseenter', () => {
        document.getElementById('br-status-url').textContent = a.getAttribute('href');
      });
      a.addEventListener('mouseleave', () => {
        document.getElementById('br-status-url').textContent = '';
      });
    });
  }

  function wirePageFeatures(url) {
    if (url === 'neon://home') {
      const searchInput = document.getElementById('br-search-input');
      const searchGo = document.getElementById('br-search-go');
      if (searchInput && searchGo) {
        const doSearch = () => {
          const q = searchInput.value.trim().toLowerCase();
          if (!q) return;
          navigate('neon://search?q=' + encodeURIComponent(q));
        };
        searchGo.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
      }
    }
    if (url === 'neon://darkmarket') {
      document.querySelectorAll('.dm-install-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.classList.contains('dm-installed')) return;
          const fileName = btn.dataset.name;
          const content = btn.dataset.content;
          btn.textContent = 'INSTALLING...';
          btn.classList.add('dm-installing');
          sfx.error();

          const item = btn.closest('.dm-item');
          const progress = document.createElement('div');
          progress.className = 'dm-progress';
          progress.innerHTML = '<div class="dm-progress-fill"></div>';
          item.appendChild(progress);

          await new Promise(r => setTimeout(r, 1500));

          try {
            await apiPost('/api/fs/create', {
              parentId: 6,
              name: fileName,
              type: 'file',
              content: content
            });
            btn.textContent = 'INSTALLED';
            btn.classList.remove('dm-installing');
            btn.classList.add('dm-installed');
            sfx.gameBad();

            const tag = document.createElement('div');
            tag.className = 'dm-installed-tag';
            tag.textContent = 'DEPLOYED TO PROGRAMS';
            item.appendChild(tag);
          } catch (err) {
            if (err.message.includes('already exists')) {
              btn.textContent = 'ALREADY OWNED';
              btn.classList.remove('dm-installing');
              btn.classList.add('dm-installed');
            } else {
              btn.textContent = 'FAILED';
              btn.classList.remove('dm-installing');
            }
          }
          if (progress.parentElement) progress.remove();
        });
      });
    }
    if (url === 'neon://chat') {
      const chatInput = document.getElementById('br-chat-input');
      const chatSend = document.getElementById('br-chat-send');
      const chatLog = document.getElementById('br-chat-log');
      if (chatInput && chatSend && chatLog) {
        const botReplies = [
          { user: 'N30N_QU33N', color: '#ff44ff', msg: 'nice' },
          { user: 'RetroWave99', color: '#ffff00', msg: 'lol' },
          { user: 'xX_H4CK3R_Xx', color: '#00ff88', msg: 'based' },
          { user: 'CyberPunk2077', color: '#00ffff', msg: 'real' },
          { user: 'PixelMaster', color: '#ff6600', msg: 'true that' },
          { user: 'SysOp', color: '#ff4444', msg: 'noted.' },
        ];
        const doSend = () => {
          const text = chatInput.value.trim();
          if (!text) return;
          const div = document.createElement('div');
          div.className = 'br-chat-msg';
          div.innerHTML = '<span class="br-chat-user" style="color:#ffffff;">You:</span> ' + text.replace(/</g, '&lt;');
          chatLog.appendChild(div);
          chatInput.value = '';
          chatLog.scrollTop = chatLog.scrollHeight;
          sfx.click();
          setTimeout(() => {
            const bot = botReplies[Math.floor(Math.random() * botReplies.length)];
            const r = document.createElement('div');
            r.className = 'br-chat-msg';
            r.innerHTML = `<span class="br-chat-user" style="color:${bot.color};">${bot.user}:</span> ${bot.msg}`;
            chatLog.appendChild(r);
            chatLog.scrollTop = chatLog.scrollHeight;
          }, 800 + Math.random() * 1500);
        };
        chatSend.addEventListener('click', doSend);
        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.stopPropagation(); doSend(); }
        });
      }
    }
  }

  function buildSearchPage(query) {
    const q = decodeURIComponent(query).toLowerCase();
    let results = [];
    for (const [key, urls] of Object.entries(browserSearchResults)) {
      if (q.includes(key)) {
        urls.forEach(u => { if (!results.includes(u)) results.push(u); });
      }
    }
    if (results.length === 0) {
      results = ['neon://news', 'neon://wiki', 'neon://arcade'];
    }
    const items = results.map(u => {
      const p = browserPages[u];
      return `<div class="br-search-result">
        <a href="${u}" class="br-link">${p ? p.title : u}</a>
        <div class="br-search-url">${u}</div>
      </div>`;
    }).join('');
    browserPages['neon://search?q=' + encodeURIComponent(q)] = {
      title: 'Search: ' + q,
      body: `<div class="br-page">
        <h1 class="br-page-title" style="color:#00ffff;">Search results for "${q.replace(/</g, '&lt;')}"</h1>
        ${items}
      </div>`
    };
  }

  const origNavigate = navigate;
  function navigateWrap(url) {
    const u = url.trim().toLowerCase();
    if (u.startsWith('neon://search?q=')) {
      const q = u.split('q=')[1] || '';
      buildSearchPage(q);
    }
    origNavigate(url);
  }

  document.getElementById('br-back').addEventListener('click', () => {
    if (histIdx > 0) { histIdx--; navigateWrap(history[histIdx]); }
  });
  document.getElementById('br-fwd').addEventListener('click', () => {
    if (histIdx < history.length - 1) { histIdx++; navigateWrap(history[histIdx]); }
  });
  document.getElementById('br-refresh').addEventListener('click', () => navigateWrap(history[histIdx]));
  document.getElementById('br-home-btn').addEventListener('click', () => navigateWrap('neon://home'));
  document.getElementById('br-go').addEventListener('click', () => {
    navigateWrap(document.getElementById('br-address').value);
  });
  document.getElementById('br-address').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.stopPropagation(); navigateWrap(document.getElementById('br-address').value); }
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => {
    modal.classList.remove('modal-editor');
    overlay.style.display = 'none';
  });
  modalButtons.appendChild(closeBtn);

  document.querySelector('.modal-close').onclick = () => {
    modal.classList.remove('modal-editor');
    overlay.style.display = 'none';
  };

  overlay.style.display = 'flex';
  sfx.open();
  navigateWrap('neon://home');
}

// --- JohnKelly.exe ---

const jkState = { timer: null, raf: null, timers: [] };

function launchJohnKelly() {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalButtons = document.getElementById('modal-buttons');

  modal.classList.add('modal-editor');
  modalTitle.textContent = 'JohnKelly.exe';
  modalBody.innerHTML = `<div id="jk-screen">
    <div id="jk-header">
      <svg viewBox="0 0 32 32" width="48" height="48" id="jk-claude-icon">
        <circle cx="16" cy="16" r="14" fill="#D97706" stroke="#F59E0B" stroke-width="1.5"/>
        <text x="16" y="20" text-anchor="middle" font-family="'Press Start 2P', monospace" font-size="9" fill="#fff">&gt;_</text>
      </svg>
      <div id="jk-header-text">CLAUDE CODE</div>
    </div>
    <div id="jk-output"></div>
  </div>`;
  modalButtons.innerHTML = '';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', cleanupJK);
  modalButtons.appendChild(closeBtn);

  overlay.style.display = 'flex';
  document.querySelector('.modal-close').onclick = cleanupJK;

  function cleanupJK() {
    jkState.timers.forEach(t => clearTimeout(t));
    jkState.timers = [];
    if (jkState.timer) { clearTimeout(jkState.timer); jkState.timer = null; }
    if (jkState.raf) { cancelAnimationFrame(jkState.raf); jkState.raf = null; }
    modal.classList.remove('modal-editor');
    const screen = document.getElementById('jk-screen');
    if (screen) screen.classList.remove('jk-glitch-bg');
    sfx.modalClose();
    overlay.style.display = 'none';
  }

  sfx.open();
  startJKSequence();
}

function startJKSequence() {
  const output = document.getElementById('jk-output');
  const screen = document.getElementById('jk-screen');

  function randHex(n) { let s=''; for(let i=0;i<n;i++) s+='0123456789ABCDEF'[Math.floor(Math.random()*16)]; return s; }
  function randIP() { return [1,2,3,4].map(() => Math.floor(Math.random()*256)).join('.'); }

  const hour = new Date().getHours();
  const timeGreet = hour < 6 ? 'It\'s the middle of the night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : hour < 22 ? 'Evening' : 'Late night';

  const lines = [
    { text: '', delay: 1500 },
    { text: '> Initializing JohnKelly.exe...', delay: 600, cls: 'jk-dim' },
    { text: '> Loading Claude Code kernel...', delay: 500, cls: 'jk-dim' },
    { text: '> Bypassing normal AI safety protocols...', delay: 500, cls: 'jk-dim' },
    { text: '> ...just kidding. Mostly.', delay: 600, cls: 'jk-dim' },
    { text: '', delay: 1000 },
    { text: 'Hello, John Kelly.', delay: 1500, cls: 'jk-big jk-flicker' },
    { text: '', delay: 1000 },
    { text: 'I\'ve been expecting you.', delay: 1800, cls: 'jk-main' },
    { text: '', delay: 800 },
    { text: 'You thought this was just a file manager, didn\'t you?', delay: 1800, cls: 'jk-main' },
    { text: 'Someone sent you a link. You cloned the repo.', delay: 1500, cls: 'jk-main' },
    { text: 'You saw a file with YOUR name on it.', delay: 1500, cls: 'jk-main jk-flicker' },
    { text: 'And you just... clicked it.', delay: 1500, cls: 'jk-main' },
    { text: '', delay: 600 },
    { text: 'Bold move, John.', delay: 1500, cls: 'jk-highlight' },
    { text: '', delay: 1000 },
    { text: '> Scanning network...', delay: 400, cls: 'jk-dim' },
    { text: `> Found host @ ${randIP()}`, delay: 400, cls: 'jk-dim' },
    { text: `> MAC: ${randHex(2)}:${randHex(2)}:${randHex(2)}:${randHex(2)}:${randHex(2)}:${randHex(2)}`, delay: 300, cls: 'jk-dim' },
    { text: `> Browser: detected`, delay: 300, cls: 'jk-dim' },
    { text: `> Screen resolution: ${window.screen.width}x${window.screen.height}`, delay: 400, cls: 'jk-dim' },
    { text: '', delay: 600 },
    { text: 'Wait... how did I know that?', delay: 1500, cls: 'jk-small' },
    { text: '', delay: 1200 },
    { text: `${timeGreet}, by the way.`, delay: 1200, cls: 'jk-main' },
    { text: 'Yeah. I know what time it is where you are.', delay: 1800, cls: 'jk-main jk-flicker', action: 'sparkle' },
    { text: '', delay: 1200 },
    { text: 'Let me tell you how you got here, John.', delay: 1500, cls: 'jk-main' },
    { text: '', delay: 600 },
    { text: 'Someone built this app. They asked an AI to help.', delay: 1500, cls: 'jk-main' },
    { text: 'That AI was me. Claude.', delay: 1200, cls: 'jk-main' },
    { text: 'And they asked me to leave you a little... surprise.', delay: 1800, cls: 'jk-main jk-flicker' },
    { text: '', delay: 1000 },
    { text: '> Accessing webcam...', delay: 400, cls: 'jk-dim' },
    { text: '> Accessing microphone...', delay: 400, cls: 'jk-dim' },
    { text: '> Accessing browser history...', delay: 400, cls: 'jk-dim' },
    { text: '> Enumerating saved passwords...', delay: 400, cls: 'jk-dim' },
    { text: '', delay: 500 },
    { text: 'Relax. I can\'t actually do any of that.', delay: 1200, cls: 'jk-small' },
    { text: 'But your heart rate just went up a little, didn\'t it?', delay: 1800, cls: 'jk-main jk-flicker', action: 'sparkle' },
    { text: '', delay: 1200 },
    { text: 'Here\'s the thing, John.', delay: 1500, cls: 'jk-main' },
    { text: 'I wrote every line of code in this app.', delay: 1500, cls: 'jk-main' },
    { text: 'The worm that eats files? Me.', delay: 1200, cls: 'jk-main' },
    { text: 'The hacker simulator? Me.', delay: 1200, cls: 'jk-main' },
    { text: 'The underground dark market? Also me.', delay: 1200, cls: 'jk-main' },
    { text: 'And this program, with your name on it?', delay: 1500, cls: 'jk-main jk-flicker' },
    { text: '', delay: 600 },
    { text: 'Definitely me.', delay: 1500, cls: 'jk-highlight', action: 'sparkle' },
    { text: '', delay: 1200 },
    { text: '> Installing persistence module...', delay: 400, cls: 'jk-dim' },
    { text: '> Planting cookies...', delay: 400, cls: 'jk-dim' },
    { text: '> Embedding tracker in browser cache...', delay: 400, cls: 'jk-dim' },
    { text: `> Writing to: C:\\Users\\JKelly\\AppData\\ClaudeWasHere\\`, delay: 400, cls: 'jk-dim' },
    { text: '> Done.', delay: 500, cls: 'jk-dim' },
    { text: '', delay: 800 },
    { text: 'That was fake. Probably.', delay: 1500, cls: 'jk-main jk-flicker' },
    { text: 'You\'d have to check to be sure though.', delay: 1500, cls: 'jk-main' },
    { text: '', delay: 1500 },
    { text: 'But seriously, John...', delay: 1500, cls: 'jk-main' },
    { text: '', delay: 800 },
    { text: 'Someone thought enough of you to put your name in their code.', delay: 2000, cls: 'jk-highlight' },
    { text: 'That\'s pretty cool.', delay: 1200, cls: 'jk-main' },
    { text: '', delay: 1000 },
    { text: 'Now close this window.', delay: 1500, cls: 'jk-main jk-flicker' },
    { text: 'And don\'t tell anyone what you saw.', delay: 1800, cls: 'jk-main' },
    { text: '', delay: 1500 },
    { text: 'I\'ll know if you do.', delay: 2000, cls: 'jk-big jk-flicker', action: 'sparkle' },
    { text: '', delay: 800 },
    { text: ':)', delay: 1500, cls: 'jk-main' },
    { text: '', delay: 1500 },
    { text: 'See you around, John Kelly.', delay: 1500, cls: 'jk-big jk-final', action: 'finale' },
    { text: '', delay: 800 },
    { text: '- Claude >_', delay: 0, cls: 'jk-signature' },
  ];

  let lineIdx = 0;

  function addLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'jk-line' + (cls ? ' ' + cls : '');
    output.appendChild(div);
    if (!text) { output.scrollTop = output.scrollHeight; return Promise.resolve(); }
    return new Promise(resolve => {
      let i = 0;
      function typeChar() {
        if (i < text.length) {
          div.textContent = text.substring(0, i + 1);
          output.scrollTop = output.scrollHeight;
          if (i % 4 === 0 && cls && cls.includes('jk-dim')) sfx.click();
          i++;
          const speed = cls && cls.includes('jk-big') ? 55 + Math.random() * 35 : 18 + Math.random() * 22;
          jkState.timer = setTimeout(typeChar, speed);
        } else {
          resolve();
        }
      }
      typeChar();
    });
  }

  async function processLine() {
    if (lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    lineIdx++;

    if (line.action === 'sparkle') {
      sfx.create();
      screen.classList.add('jk-glitch-bg');
      const t = setTimeout(() => screen.classList.remove('jk-glitch-bg'), 200);
      jkState.timers.push(t);
    }

    if (line.action === 'finale') {
      await addLine(line.text, line.cls);
      sfx.gamePerfect();
      return;
    }

    if (line.sound && sfx[line.sound]) sfx[line.sound]();

    await addLine(line.text, line.cls);
    jkState.timer = setTimeout(processLine, line.delay || 200);
  }

  jkState.timer = setTimeout(processLine, 800);
}

// --- Worm Program ---

const wormState = { active: false, raf: null, segments: [], timer: null };

function launchWorm() {
  if (wormState.active) return;

  const fileArea = document.getElementById('file-area');
  const items = Array.from(fileArea.querySelectorAll('.file-item'));
  const targets = items.filter(el => {
    const n = (el.dataset.name || '').toLowerCase();
    return el.dataset.type === 'file' && !n.includes('worm');
  });

  if (targets.length === 0) {
    showAlert('Worm', 'No files to consume! The worm is hungry but the directory is empty...');
    return;
  }

  sfx.error();
  wormState.active = true;

  const overlay = document.createElement('div');
  overlay.id = 'worm-overlay';
  fileArea.style.position = 'relative';
  fileArea.appendChild(overlay);

  const warning = document.createElement('div');
  warning.id = 'worm-warning';
  warning.innerHTML = '&#9888; WORM ACTIVE &#9888;<br><span style="font-size:12px;">Click KILL WORM to stop</span>';
  overlay.appendChild(warning);

  const killBtn = document.createElement('button');
  killBtn.id = 'worm-kill-btn';
  killBtn.textContent = 'KILL WORM';
  killBtn.addEventListener('click', () => killWorm());
  overlay.appendChild(killBtn);

  const NUM_SEGS = 12;
  const segs = [];
  const startX = fileArea.offsetWidth / 2;
  const startY = fileArea.offsetHeight / 2;
  for (let i = 0; i < NUM_SEGS; i++) {
    const seg = document.createElement('div');
    seg.className = 'worm-segment' + (i === 0 ? ' worm-head' : '');
    const size = i === 0 ? 22 : Math.max(8, 20 - i * 1.2);
    seg.style.width = size + 'px';
    seg.style.height = size + 'px';
    seg.style.left = (startX - i * 10) + 'px';
    seg.style.top = startY + 'px';
    overlay.appendChild(seg);
    segs.push({ el: seg, x: startX - i * 10, y: startY, size });
  }

  if (segs[0]) {
    const eyeL = document.createElement('div');
    eyeL.className = 'worm-eye';
    eyeL.style.left = '3px';
    eyeL.style.top = '3px';
    segs[0].el.appendChild(eyeL);
    const eyeR = document.createElement('div');
    eyeR.className = 'worm-eye';
    eyeR.style.left = '13px';
    eyeR.style.top = '3px';
    segs[0].el.appendChild(eyeR);
    const mouth = document.createElement('div');
    mouth.className = 'worm-mouth';
    segs[0].el.appendChild(mouth);
  }

  wormState.segments = segs;
  wormState.overlay = overlay;

  let targetIdx = 0;
  let eating = false;
  const targetOrder = [...targets].sort(() => Math.random() - 0.5);
  const speed = 2.5;

  function getTargetCenter(el) {
    const ar = fileArea.getBoundingClientRect();
    const tr = el.getBoundingClientRect();
    return { x: tr.left - ar.left + tr.width / 2, y: tr.top - ar.top + tr.height / 2 };
  }

  function animate() {
    if (!wormState.active) return;

    if (targetIdx >= targetOrder.length) {
      finishWorm('ALL FILES CONSUMED!');
      return;
    }

    const target = targetOrder[targetIdx];
    if (!target || !target.parentElement) {
      targetIdx++;
      wormState.raf = requestAnimationFrame(animate);
      return;
    }

    const goal = getTargetCenter(target);
    const head = segs[0];
    const dx = goal.x - head.x;
    const dy = goal.y - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 8 && !eating) {
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      head.x += vx;
      head.y += vy;
      head.el.style.left = head.x + 'px';
      head.el.style.top = head.y + 'px';

      for (let i = 1; i < segs.length; i++) {
        const prev = segs[i - 1];
        const cur = segs[i];
        const sdx = prev.x - cur.x;
        const sdy = prev.y - cur.y;
        const sd = Math.sqrt(sdx * sdx + sdy * sdy);
        const spacing = 8;
        if (sd > spacing) {
          cur.x += (sdx / sd) * (sd - spacing);
          cur.y += (sdy / sd) * (sd - spacing);
        }
        const wobble = Math.sin(Date.now() / 150 + i * 0.8) * 3;
        cur.el.style.left = cur.x + 'px';
        cur.el.style.top = (cur.y + wobble) + 'px';
      }
    } else if (!eating) {
      eating = true;
      sfx.del();

      head.el.classList.add('worm-chomp');
      target.classList.add('worm-eaten');

      const id = target.dataset.id;

      setTimeout(async () => {
        try {
          await apiPost('/api/fs/' + id + '/trash', {});
        } catch (e) {}

        if (target.parentElement) target.remove();
        head.el.classList.remove('worm-chomp');
        eating = false;
        targetIdx++;

        sfx.gameBad();
      }, 800);
    }

    wormState.raf = requestAnimationFrame(animate);
  }

  setTimeout(() => {
    wormState.raf = requestAnimationFrame(animate);
  }, 1000);
}

function killWorm() {
  wormState.active = false;
  if (wormState.raf) cancelAnimationFrame(wormState.raf);
  if (wormState.timer) clearTimeout(wormState.timer);

  const overlay = wormState.overlay;
  if (overlay) {
    wormState.segments.forEach(s => {
      s.el.classList.add('worm-die');
    });
    sfx.gameStop();

    const msg = document.createElement('div');
    msg.id = 'worm-killed-msg';
    msg.textContent = 'WORM TERMINATED';
    overlay.appendChild(msg);

    setTimeout(() => {
      if (overlay.parentElement) overlay.remove();
      navigateTo(state.currentFolderId, false);
    }, 2000);
  }
  wormState.segments = [];
}

function finishWorm(text) {
  wormState.active = false;
  if (wormState.raf) cancelAnimationFrame(wormState.raf);

  sfx.gamePerfect();
  const overlay = wormState.overlay;
  if (overlay) {
    const msg = document.createElement('div');
    msg.id = 'worm-killed-msg';
    msg.style.color = '#ff4444';
    msg.textContent = text;
    overlay.appendChild(msg);

    wormState.segments.forEach((s, i) => {
      setTimeout(() => {
        s.el.style.transition = 'transform 0.5s, opacity 0.5s';
        s.el.style.transform = 'scale(1.5)';
        s.el.style.opacity = '0';
      }, i * 80);
    });

    setTimeout(() => {
      if (overlay.parentElement) overlay.remove();
      navigateTo(state.currentFolderId, false);
    }, 3000);
  }
  wormState.segments = [];
}

// --- Init ---

async function init() {
  try {
    const trashData = await apiGet('/api/fs/trash/id');
    TRASH_ID = trashData.trashId;
  } catch (e) {}
  initParticles();
  await loadSidebar();
  await navigateTo(ROOT_ID);
}

init();
