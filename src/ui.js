import { icon } from './icons.js';
import { listDocuments, loadDocument, saveDocument, deleteDocument, setActive } from './store.js';
import { fromSVGElement } from './shapes.js';

const PRESET_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#000000', '#ffffff'
];

let appState = null;
let renderFn = null;
let exitFn = null;

export function initUI(state, renderCallback, exitCallback) {
  appState = state;
  renderFn = renderCallback;
  exitFn = exitCallback;
}

// --- Startup screen ---

export function buildStartupScreen() {
  const screen = document.getElementById('startup-screen');
  screen.innerHTML = '';

  const h1 = document.createElement('h1');
  h1.textContent = 'esvege';
  screen.appendChild(h1);

  // Create New row
  const newRow = document.createElement('div');
  newRow.className = 'startup-row';

  const label = document.createElement('label');
  label.textContent = 'Create New';
  newRow.appendChild(label);

  const controls = document.createElement('div');
  controls.className = 'create-controls';

  const wInput = document.createElement('input');
  wInput.type = 'number';
  wInput.step = '1';
  wInput.min = '1';
  wInput.max = '4096';
  wInput.value = '64';

  const xSpan = document.createElement('span');
  xSpan.textContent = '×';

  const hInput = document.createElement('input');
  hInput.type = 'number';
  hInput.step = '1';
  hInput.min = '1';
  hInput.max = '4096';
  hInput.value = '64';

  const createBtn = document.createElement('button');
  createBtn.className = 'btn';
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const w = parseInt(wInput.value) || 64;
    const h = parseInt(hInput.value) || 64;
    onCreateNew(w, h);
  });

  controls.appendChild(wInput);
  controls.appendChild(xSpan);
  controls.appendChild(hInput);
  controls.appendChild(createBtn);
  newRow.appendChild(controls);
  screen.appendChild(newRow);

  // Open File row
  const openRow = document.createElement('div');
  openRow.className = 'startup-row';

  const openLabel = document.createElement('label');
  openLabel.textContent = 'Open File';
  openRow.appendChild(openLabel);

  const dropZone = document.createElement('div');
  dropZone.id = 'drop-zone';
  dropZone.textContent = 'Drop an SVG file here or click to browse';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'file-input';
  fileInput.accept = '.svg';
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleSVGFile(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  dropZone.addEventListener('click', () => fileInput.click());

  // Drag-and-drop events
  dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
        handleSVGFile(file);
      } else {
        showToast('Not an SVG file', true);
      }
    }
  });

  openRow.appendChild(dropZone);
  openRow.appendChild(fileInput);
  screen.appendChild(openRow);

  // Recent files
  const recentLabel = document.createElement('label');
  recentLabel.textContent = 'Recent Files';
  screen.appendChild(recentLabel);

  const grid = document.createElement('div');
  grid.id = 'recent-files';
  screen.appendChild(grid);

  refreshRecentGrid(grid);
}

function refreshRecentGrid(grid) {
  const docs = listDocuments();
  grid.innerHTML = '';
  if (docs.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'empty-message';
    msg.textContent = 'No recent files';
    grid.appendChild(msg);
    return;
  }
  for (const meta of docs) {
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.title = meta.name || 'untitled';
    if (meta.thumbnail) {
      const img = document.createElement('img');
      img.src = meta.thumbnail;
      img.alt = meta.name || 'untitled';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      card.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.className = 'empty-card';
      span.textContent = meta.name || 'untitled';
      card.appendChild(span);
    }
    card.addEventListener('click', () => {
      const doc = loadDocument(meta.id);
      if (doc) {
        setActive(meta.id);
        enterEditor(doc);
      }
    });
    grid.appendChild(card);
  }
}

function onCreateNew(w, h) {
  const doc = {
    id: crypto.randomUUID(),
    name: 'untitled',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    width: Math.max(1, Math.min(4096, w || 64)),
    height: Math.max(1, Math.min(4096, h || 64)),
    shapes: []
  };
  setActive(doc.id);
  enterEditor(doc);
}

function handleSVGFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    try {
      parseSVGImport(text);
    } catch {
      showToast('Could not parse SVG file', true);
    }
  };
  reader.onerror = () => showToast('Failed to read file', true);
  reader.readAsText(file);
}

function parseSVGImport(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Parse error');

  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error('No SVG element');

  const viewBox = svgEl.getAttribute('viewBox');
  let w, h;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      w = Math.round(parts[2]);
      h = Math.round(parts[3]);
    }
  }
  if (!w) w = parseInt(svgEl.getAttribute('width')) || 64;
  if (!h) h = parseInt(svgEl.getAttribute('height')) || 64;

  const newDoc = {
    id: crypto.randomUUID(),
    name: 'imported',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    width: Math.max(1, Math.min(4096, w)),
    height: Math.max(1, Math.min(4096, h)),
    shapes: []
  };

  const shapes = svgEl.querySelectorAll('circle, rect, path, ellipse');
  for (const el of shapes) {
    const shape = fromSVGElement(el);
    if (shape) newDoc.shapes.push(shape);
  }

  setActive(newDoc.id);
  enterEditor(newDoc);
}

// --- Editor screen ---

export function enterEditor(doc) {
  document.getElementById('startup-screen').style.display = 'none';
  const editor = document.getElementById('editor-screen');
  editor.style.display = 'flex';

  appState.doc = doc;
  appState.selectedIds = [];
  appState.tool = 'select';
  appState.bezierPoints = [];
  appState.activePointIndex = -1;
  buildEditorLayout(doc);
  if (appState.onEnterEditor) appState.onEnterEditor(doc);
  if (renderFn) renderFn();
}

export function exitEditor() {
  if (appState.doc) {
    saveDocument(appState.doc);
  }
  appState.doc = null;
  appState.selectedIds = [];

  document.getElementById('startup-screen').style.display = 'flex';
  document.getElementById('editor-screen').style.display = 'none';

  // Refresh recent grid
  const grid = document.getElementById('recent-files');
  if (grid) refreshRecentGrid(grid);
  if (appState.onExitEditor) appState.onExitEditor();
}


function buildEditorLayout(doc) {
  const editorBody = document.getElementById('editor-body');
  editorBody.innerHTML = '';

  // Left palette
  buildToolPalette(editorBody);

  // Center canvas
  buildCanvasArea(editorBody, doc);

  // Right properties
  buildPropertiesPanel(editorBody);

  // Set up toolbar
  buildToolbar();
}

function buildToolbar() {
  const toolbar = document.getElementById('toolbar');
  toolbar.innerHTML = '';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn-icon';
  backBtn.title = 'Back to startup';
  backBtn.appendChild(icon('arrow_back'));
  backBtn.addEventListener('click', () => exitEditor());
  toolbar.appendChild(backBtn);

  const sep1 = document.createElement('div');
  sep1.className = 'separator';
  toolbar.appendChild(sep1);

  const undoBtn = document.createElement('button');
  undoBtn.className = 'btn-icon';
  undoBtn.id = 'undo-btn';
  undoBtn.title = 'Undo (Ctrl+Z)';
  undoBtn.appendChild(icon('undo'));
  undoBtn.addEventListener('click', () => {
    // Will be wired in main.js
    if (appState.onUndo) appState.onUndo();
  });
  toolbar.appendChild(undoBtn);

  const redoBtn = document.createElement('button');
  redoBtn.className = 'btn-icon';
  redoBtn.id = 'redo-btn';
  redoBtn.title = 'Redo (Ctrl+Shift+Z)';
  redoBtn.appendChild(icon('redo'));
  redoBtn.addEventListener('click', () => {
    if (appState.onRedo) appState.onRedo();
  });
  toolbar.appendChild(redoBtn);

  const sep2 = document.createElement('div');
  sep2.className = 'separator';
  toolbar.appendChild(sep2);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn-icon';
  exportBtn.title = 'Export SVG';
  exportBtn.appendChild(icon('file_download'));
  exportBtn.addEventListener('click', () => {
    if (appState.onExport) appState.onExport();
  });
  toolbar.appendChild(exportBtn);

  // Zoom selector
  const zoomLabel = document.createElement('label');
  zoomLabel.style.cssText = 'color:#888;font-size:0.8rem;margin-right:0.3rem;';
  zoomLabel.textContent = 'Zoom:';
  toolbar.appendChild(zoomLabel);

  const zoomSelect = document.createElement('select');
  zoomSelect.id = 'zoom-select';
  zoomSelect.style.cssText = 'background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:3px;padding:0.15rem 0.3rem;font-size:0.8rem;';
  const zooms = [50, 100, 200, 400, 800];
  for (const z of zooms) {
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = z/100 + 'x';
    if (z === 100) opt.selected = true;
    zoomSelect.appendChild(opt);
  }
  zoomSelect.addEventListener('change', () => {
    const scale = parseInt(zoomSelect.value) / 100;
    const container = document.getElementById('canvas-container');
    if (container) {
      container.style.transform = `scale(${scale})`;
      container.style.transformOrigin = 'top left';
    }
  });
  toolbar.appendChild(zoomSelect);

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  toolbar.appendChild(spacer);
}

function buildCanvasArea(editorBody, doc) {
  const canvasArea = document.createElement('div');
  canvasArea.id = 'canvas-area';

  const container = document.createElement('div');
  container.id = 'canvas-container';

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'editor-svg';
  svg.setAttribute('viewBox', `0 0 ${doc.width} ${doc.height}`);
  svg.setAttribute('width', doc.width);
  svg.setAttribute('height', doc.height);

  const shapesLayer = document.createElementNS(ns, 'g');
  shapesLayer.id = 'shapes-layer';
  svg.appendChild(shapesLayer);

  const handlesLayer = document.createElementNS(ns, 'g');
  handlesLayer.id = 'handles-layer';
  svg.appendChild(handlesLayer);

  container.appendChild(svg);
  canvasArea.appendChild(container);
  editorBody.appendChild(canvasArea);
}

function buildToolPalette(editorBody) {
  const palette = document.createElement('div');
  palette.id = 'tool-palette';

  const tools = [
    { id: 'select', iconName: 'touch_app', title: 'Select (V)' },
    { id: 'circle', iconName: 'circle', title: 'Circle (C)' },
    { id: 'rect', iconName: 'crop_square', title: 'Rect (R)' },
    { id: 'bezier', iconName: 'show_chart', title: 'Bezier (B)' },
    { id: 'node', iconName: 'commit', title: 'Node (N)' },
  ];

  for (const t of tools) {
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.id = `tool-${t.id}`;
    btn.title = t.title;
    btn.appendChild(icon(t.iconName));
    btn.addEventListener('click', () => {
      setActiveTool(t.id);
    });
    palette.appendChild(btn);
  }

  editorBody.appendChild(palette);
}
function setActiveTool(tool) {
  appState.activePointIndex = -1;

  // Node tool requires a selected bezier
  if (tool === 'node') {
    const hasBezier = appState.doc && appState.doc.shapes.some(
      s => appState.selectedIds.includes(s.id) && s.type === 'bezier'
    );
    if (!hasBezier) {
      showToast('Select a bezier shape first', true);
      return;
    }
  }

  appState.tool = tool;

  // Clear selection for creation tools, keep for select/node
  if (tool !== 'select' && tool !== 'node') {
    appState.selectedIds = [];
  }

  // Cancel bezier drawing if switching tools
  if (tool !== 'bezier' && appState.bezierPoints && appState.bezierPoints.length > 0) {
    appState.bezierPoints = [];
    if (renderFn) renderFn();
  }
  // Update active class on palette buttons
  document.querySelectorAll('#tool-palette .btn-icon').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tool-${tool}`);
  if (btn) btn.classList.add('active');

  if (renderFn) renderFn();
}

function buildPropertiesPanel(editorBody) {
  const panel = document.createElement('div');
  panel.id = 'properties-panel';
  panel.innerHTML = '<h3>Properties</h3>';
  editorBody.appendChild(panel);
}

export function updatePropertiesPanel() {
  const panel = document.getElementById('properties-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const doc = appState.doc;
  if (!doc) return;

  // --- Layers section ---
  const layersTitle = document.createElement('h3');
  layersTitle.textContent = 'Layers';
  panel.appendChild(layersTitle);

  const layersList = document.createElement('div');
  layersList.style.cssText = 'margin-bottom:0.75rem;max-height:180px;overflow-y:auto;';

  const shapeIconMap = { circle: 'circle', rect: 'crop_square', bezier: 'show_chart' };
  for (let i = 0; i < doc.shapes.length; i++) {
    const s = doc.shapes[i];
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;padding:0.2rem 0.3rem;border-radius:3px;cursor:pointer;font-size:0.8rem;';
    if (appState.selectedIds.includes(s.id)) {
      row.style.background = 'rgba(79,195,247,0.15)';
    }
    row.addEventListener('click', () => {
      appState.selectedIds = [s.id];
      appState.activePointIndex = -1;
      if (renderFn) renderFn();
    });

    const swatch = document.createElement('span');
    swatch.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;flex-shrink:0;';
    swatch.style.background = s.fill || '#888';
    row.appendChild(swatch);

    const typeIcon = document.createElement('span');
    typeIcon.className = 'material-symbols-outlined';
    typeIcon.style.cssText = 'font-size:1rem;color:#888;';
    typeIcon.textContent = shapeIconMap[s.type] || 'shape';
    row.appendChild(typeIcon);

    const idxLabel = document.createElement('span');
    idxLabel.style.cssText = 'color:#555;font-size:0.7rem;';
    idxLabel.textContent = '#' + i;
    row.appendChild(idxLabel);

    const upBtn = document.createElement('button');
    upBtn.className = 'layer-move-btn';
    upBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0;line-height:1;color:#888;font-size:1rem;display:flex;';
    upBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true" style="font-size:1rem;">arrow_upward</span>';
    upBtn.title = 'Move up';
    if (i === 0) upBtn.disabled = true;
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (i === 0) return;
      pushSnapshot();
      const arr = doc.shapes;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      if (renderFn) renderFn();
    });
    row.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'layer-move-btn';
    downBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0;line-height:1;color:#888;font-size:1rem;display:flex;';
    downBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true" style="font-size:1rem;">arrow_downward</span>';
    downBtn.title = 'Move down';
    if (i === doc.shapes.length - 1) downBtn.disabled = true;
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (i === doc.shapes.length - 1) return;
      pushSnapshot();
      const arr = doc.shapes;
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      if (renderFn) renderFn();
    });
    row.appendChild(downBtn);


    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'duplicate-btn';
    duplicateBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0;line-height:1;color:#888;font-size:1rem;display:flex;';
    duplicateBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true" style="font-size:1rem;">content_copy</span>';
    duplicateBtn.title = 'Duplicate';
    duplicateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pushSnapshot();
      const clone = JSON.parse(JSON.stringify(s))
      clone.id = crypto.randomUUID();
      const arr = doc.shapes;
      arr.splice(i + 1, 0, clone);
      appState.selectedIds = [clone.id];
      if (renderFn) renderFn();
    });
    row.appendChild(duplicateBtn);

    layersList.appendChild(row);
  }
  panel.appendChild(layersList);

  // --- Properties section ---
  const propsTitle = document.createElement('h3');
  propsTitle.textContent = 'Properties';
  panel.appendChild(propsTitle);

  const selected = doc.shapes.filter(s => appState.selectedIds.includes(s.id));
  if (selected.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#555;font-size:0.8rem;';
    empty.textContent = 'No selection';
    panel.appendChild(empty);
    return;
  }

  if (selected.length === 1) {
    const shape = selected[0];
    renderShapeProperties(panel, shape);
  } else {
    const multiLabel = document.createElement('p');
    multiLabel.style.cssText = 'color:#888;font-size:0.8rem;';
    multiLabel.textContent = 'Multiple selected';
    panel.appendChild(multiLabel);
    renderFillUI(panel, selected[0], true);
  }
}

function renderShapeProperties(panel, shape) {
  // Type label
  const typeLabel = document.createElement('p');
  typeLabel.style.cssText = 'color:#888;font-size:0.8rem;margin-bottom:0.5rem;text-transform:capitalize;';
  typeLabel.textContent = shape.type;
  panel.appendChild(typeLabel);

  switch (shape.type) {
    case 'circle':
      addPropRow(panel, 'cx', shape.cx, (v) => { shape.cx = v; });
      addPropRow(panel, 'cy', shape.cy, (v) => { shape.cy = v; });
      addPropRow(panel, 'rx', shape.rx, (v) => { shape.rx = Math.max(1, v); });
      addPropRow(panel, 'ry', shape.ry, (v) => { shape.ry = Math.max(1, v); });
      break;
    case 'rect':
      addPropRow(panel, 'x', shape.x, (v) => { shape.x = v; });
      addPropRow(panel, 'y', shape.y, (v) => { shape.y = v; });
      addPropRow(panel, 'w', shape.width, (v) => { shape.width = Math.max(1, v); });
      addPropRow(panel, 'h', shape.height, (v) => { shape.height = Math.max(1, v); });
      break;
    case 'bezier': {
      // Selected point props (if node-editing)
      if (appState.activePointIndex >= 0 && appState.activePointIndex < shape.points.length) {
        const pt = shape.points[appState.activePointIndex];
        const ptLabel = document.createElement('p');
        ptLabel.style.cssText = 'color:#888;font-size:0.75rem;margin:0.5rem 0 0.25rem;';
        ptLabel.textContent = `Point ${appState.activePointIndex}`;
        panel.appendChild(ptLabel);
        addPropRow(panel, 'x', pt.x, (v) => { pt.x = v; });
        addPropRow(panel, 'y', pt.y, (v) => { pt.y = v; });
        addPropRow(panel, 'c1x', pt.cp1x, (v) => { pt.cp1x = v; });
        addPropRow(panel, 'c1y', pt.cp1y, (v) => { pt.cp1y = v; });
        addPropRow(panel, 'c2x', pt.cp2x, (v) => { pt.cp2x = v; });
        addPropRow(panel, 'c2y', pt.cp2y, (v) => { pt.cp2y = v; });
      }
      break;
    }
  }

  // Fill UI
  renderFillUI(panel, shape);
}

function addPropRow(panel, label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const lbl = document.createElement('label');
  lbl.textContent = label + ':';
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '1';
  input.value = value != null ? value : '';
  input.addEventListener('change', () => {
    const v = parseInt(input.value);
    if (!isNaN(v)) {
      pushSnapshot();
      onChange(v);
      if (renderFn) renderFn();
    }
  });
  row.appendChild(lbl);
  row.appendChild(input);
  panel.appendChild(row);
}

function renderFillUI(panel, shape, multi) {
  const fillLabel = document.createElement('p');
  fillLabel.style.cssText = 'color:#888;font-size:0.8rem;margin-top:0.75rem;margin-bottom:0.25rem;';
  fillLabel.textContent = 'Fill';
  panel.appendChild(fillLabel);

  const palette = document.createElement('div');
  palette.className = 'color-palette';

  for (const c of PRESET_COLORS) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = c;
    if (!multi && shape.fill === c) swatch.classList.add('active');
    swatch.addEventListener('click', () => {
      pushSnapshot();
      if (multi) {
        for (const s of appState.doc.shapes.filter(s => appState.selectedIds.includes(s.id))) {
          s.fill = c;
        }
      } else {
        shape.fill = c;
      }
      if (renderFn) renderFn();
    });
    palette.appendChild(swatch);
  }

  // Native color picker
  const nativePicker = document.createElement('input');
  nativePicker.type = 'color';
  nativePicker.className = 'color-picker-native';
  nativePicker.value = shape.fill || '#000000';
  nativePicker.addEventListener('input', () => {
    pushSnapshot();
    if (multi) {
      for (const s of appState.doc.shapes.filter(s => appState.selectedIds.includes(s.id))) {
        s.fill = nativePicker.value;
      }
    } else {
      shape.fill = nativePicker.value;
    }
    if (renderFn) renderFn();
  });
  palette.appendChild(nativePicker);

  panel.appendChild(palette);
}

function pushSnapshot() {
  if (appState.onPushSnapshot) appState.onPushSnapshot();
}

// --- Toast ---

export function showToast(msg, isError) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3000);
}

// --- Public access to setActiveTool for keyboard shortcuts ---

export { setActiveTool };
