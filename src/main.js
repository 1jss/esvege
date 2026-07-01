import './style.css';
import { icon } from './icons.js';
import { listDocuments, loadDocument, saveDocument, setActive, getActive } from './store.js';
import { toSVGElement, cloneShape } from './shapes.js';
import { drawSelectionHandles, drawNodeHandles } from './handles.js';
import { setupToolHandlers, updateToolUI } from './tools.js';
import { buildStartupScreen, enterEditor, exitEditor, initUI, updatePropertiesPanel, showToast, setActiveTool, updateNodeToolVisibility, updateCanvasTransform } from './ui.js';
import { exportSVG } from './export.js';

// App state singleton
const appState = {
  doc: null,
  selectedIds: [],
  tool: 'select',
  bezierPoints: [],
  activePointIndex: -1,
  undoStack: [],
  redoStack: [],
  panOffset: { x: 0, y: 0 },
  zoom: 1,
  _preview: null,
  // Callbacks wired by init
  onUndo: null,
  onRedo: null,
  onExport: null,
  onPushSnapshot: null
};

function init() {
  // Init UI module with callbacks
  initUI(appState, render, exitEditor);

  // Build startup screen
  buildStartupScreen();

  // Wire undo/redo callbacks
  appState.onUndo = undo;
  appState.onRedo = redo;
  appState.onExport = () => {
    if (appState.doc) exportSVG(appState.doc);
  };
  appState.onPushSnapshot = pushSnapshot;

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);

  // Check if there's an active doc to auto-open (optional)
  const activeId = getActive();
  if (activeId) {
    const doc = loadDocument(activeId);
    if (doc) {
      enterEditor(doc);
      return;
    }
  }
}

function render() {
  const doc = appState.doc;
  if (!doc) return;

  const svg = document.getElementById('editor-svg');
  if (!svg) return;

  const shapesLayer = svg.querySelector('#shapes-layer');
  const handlesLayer = svg.querySelector('#handles-layer');
  if (!shapesLayer || !handlesLayer) return;

  // Clear layers
  shapesLayer.innerHTML = '';
  handlesLayer.innerHTML = '';

  // Render shapes
  for (const shape of doc.shapes) {
    const el = toSVGElement(shape);
    shapesLayer.appendChild(el);
  }

  // Render preview shape (during creation)
  if (appState._preview) {
    const preview = appState._preview;
    const ns = 'http://www.w3.org/2000/svg';
    let el;
    if (preview.type === 'circle') {
      el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', preview.cx);
      el.setAttribute('cy', preview.cy);
      el.setAttribute('rx', Math.max(0, preview.rx));
      el.setAttribute('ry', Math.max(0, preview.ry));
      el.classList.add('preview-shape');
    } else if (preview.type === 'rect') {
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', preview.x);
      el.setAttribute('y', preview.y);
      el.setAttribute('width', Math.max(0, preview.width));
      el.setAttribute('height', Math.max(0, preview.height));
      el.classList.add('preview-shape');
    }
    if (el) handlesLayer.appendChild(el);
  }

  // Render bezier preview (while drawing)
  if (appState.tool === 'bezier' && appState.bezierPoints && appState.bezierPoints.length > 0) {
    const pts = appState.bezierPoints;
    const ns = 'http://www.w3.org/2000/svg';
    // Draw lines between points
    for (let i = 1; i < pts.length; i++) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', pts[i-1].x);
      line.setAttribute('y1', pts[i-1].y);
      line.setAttribute('x2', pts[i].x);
      line.setAttribute('y2', pts[i].y);
      line.classList.add('bezier-preview-line');
      handlesLayer.appendChild(line);
    }
    // Draw points
    for (const pt of pts) {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', 6 / appState.zoom);
      circle.classList.add('bezier-preview-point');
      handlesLayer.appendChild(circle);
    }
  }

  // Render selection handles
  if (appState.tool === 'select' && appState.selectedIds.length > 0) {
    const selectedShapes = doc.shapes.filter(s => appState.selectedIds.includes(s.id));
    if (selectedShapes.length > 0) {
      drawSelectionHandles(svg, selectedShapes, appState.zoom);
    }
  }

  // Render node handles
  if (appState.tool === 'node' && appState.selectedIds.length === 1) {
    const bezier = doc.shapes.find(
      s => s.id === appState.selectedIds[0] && s.type === 'bezier'
    );
    if (bezier) {
      drawNodeHandles(svg, bezier, appState.activePointIndex, appState.zoom);
    }
  }

  // Update properties panel
  updateNodeToolVisibility();
  updatePropertiesPanel();
}

// --- Undo / Redo ---

const MAX_UNDO = 50;

function pushSnapshot() {
  if (!appState.doc) return;
  appState.undoStack.push(cloneShape(appState.doc.shapes));
  if (appState.undoStack.length > MAX_UNDO) {
    appState.undoStack.shift();
  }
  appState.redoStack = [];
}

function undo() {
  if (appState.undoStack.length === 0) return;
  appState.redoStack.push(cloneShape(appState.doc.shapes));
  appState.doc.shapes = appState.undoStack.pop();
  appState.selectedIds = [];
  appState.activePointIndex = -1;
  appState._preview = null;
  saveDocument(appState.doc);
  render();
}

function redo() {
  if (appState.redoStack.length === 0) return;
  appState.undoStack.push(cloneShape(appState.doc.shapes));
  appState.doc.shapes = appState.redoStack.pop();
  appState.selectedIds = [];
  appState.activePointIndex = -1;
  appState._preview = null;
  saveDocument(appState.doc);
  render();
}

function onKeyDown(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
    e.preventDefault();
    redo();
    return;
  }
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.key === 'Escape') {
    // Cancel bezier drawing
    if (appState.tool === 'bezier' && appState.bezierPoints.length > 0) {
      appState.bezierPoints = [];
      appState.tool = 'select';
      setActiveTool('select');
      render();
      return;
    }
    // Deselect
    if (appState.selectedIds.length > 0) {
      appState.selectedIds = [];
      appState.activePointIndex = -1;
      render();
    }
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && appState.selectedIds.length > 0) {
    // Don't delete when typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    pushSnapshot();
    appState.doc.shapes = appState.doc.shapes.filter(s => !appState.selectedIds.includes(s.id));
    appState.selectedIds = [];
    appState.activePointIndex = -1;
    if (appState.tool === 'node' && !appState.doc.shapes.some(
      s => appState.selectedIds.includes(s.id) && s.type === 'bezier'
    )) {
      appState.tool = 'select';
      updateToolUI();
    }
    saveDocument(appState.doc);
    render();
    return;
  }
  // Tool shortcuts
  if (!e.ctrlKey && !e.metaKey && !e.target.closest('input, textarea')) {
    switch (e.key.toLowerCase()) {
      case 'v': setActiveTool('select'); render(); break;
      case 'c': setActiveTool('circle'); render(); break;
      case 'r': setActiveTool('rect'); render(); break;
      case 'b': setActiveTool('bezier'); render(); break;
      case 'n': setActiveTool('node'); render(); break;
    }
  }
}

// Wire callbacks that ui.js will call
appState.onEnterEditor = function(doc) {
  const svg = document.getElementById('editor-svg');
  if (svg) {
    setupToolHandlers(svg, appState, render);
  }
  appState.undoStack = [];
  appState.redoStack = [];
  pushSnapshot();
  requestAnimationFrame(updateCanvasTransform);
};

appState.onExitEditor = function() {
  appState.selectedIds = [];
  appState.bezierPoints = [];
  appState.activePointIndex = -1;
  appState._preview = null;
  appState.undoStack = [];
  appState.redoStack = [];
};

// Start
init();