import { toSVGCoords } from './canvas.js';
import { createCircle, createRect, createBezier, getBoundingBox, hitTest } from './shapes.js';
import { drawSelectionHandles, drawNodeHandles, computeResizeDelta, applyBBoxToShape, pointToAnchorDist, pointToHandleDist } from './handles.js';
import { saveDocument } from './store.js';
import { showToast } from './ui.js';

let appState = null;
let renderFn = null;

// Pointer drag state
let dragState = null;

// Double-click detection (manual, since dblclick events are unreliable with DOM thrash)
let lastClickTime = 0;
let lastClickSvgX = 0;
let lastClickSvgY = 0;

export function setupToolHandlers(svgEl, state, render) {
  appState = state;
  renderFn = render;

  svgEl.addEventListener('pointerdown', onPointerDown);
  svgEl.addEventListener('pointermove', onPointerMove);
  svgEl.addEventListener('pointerup', onPointerUp);
  svgEl.addEventListener('pointerleave', onPointerUp);
}

function onPointerDown(e) {
  if (!appState.doc) return;
  const svg = e.currentTarget;
  const coords = toSVGCoords(svg, e.clientX, e.clientY);
  const mx = coords.x;
  const my = coords.y;

  // Manual double-click detection
  const now = Date.now();
  const isDblClick = (now - lastClickTime < 350 && Math.hypot(mx - lastClickSvgX, my - lastClickSvgY) < 4);
  lastClickTime = now;
  lastClickSvgX = mx;
  lastClickSvgY = my;

  // Node tool: double-click anchor → create handles, double-click handle → remove
  if (isDblClick && appState.tool === 'node' && appState.selectedIds.length === 1) {
    const bezier = appState.doc.shapes.find(
      s => s.id === appState.selectedIds[0] && s.type === 'bezier'
    );
    if (bezier) {
      // Check control dots first
      if (appState.activePointIndex >= 0 && appState.activePointIndex < bezier.points.length) {
        const pt = bezier.points[appState.activePointIndex];
        for (const handle of ['cp1', 'cp2']) {
          if (pt[handle + 'x'] != null) {
            const d = Math.hypot(mx - pt[handle + 'x'], my - pt[handle + 'y']);
            if (d <= 4) {
              pt[handle + 'x'] = null;
              pt[handle + 'y'] = null;
              pushSnapshot();
              renderFn();
              e.preventDefault();
              return;
            }
          }
        }
      }
      // Check anchor points
      for (let i = 0; i < bezier.points.length; i++) {
        const pt = bezier.points[i];
        if (Math.hypot(mx - pt.x, my - pt.y) <= 4) {
          if (pt.cp1x == null || pt.cp2x == null) {
            const pts = bezier.points;
            const n = pts.length;
            const prev = pts[(i - 1 + n) % n];
            const next = pts[(i + 1) % n];
            let dx = next.x - prev.x;
            let dy = next.y - prev.y;
            if (dx === 0 && dy === 0) {
              dx = pt.x - next.x;
              dy = pt.y - next.y;
            }
            const dirLen = Math.hypot(dx, dy);
            if (dirLen > 0) {
              dx /= dirLen;
              dy /= dirLen;
            } else {
              dx = 1; dy = 0;
            }
            const dPrev = Math.hypot(pt.x - prev.x, pt.y - prev.y);
            const dNext = Math.hypot(pt.x - next.x, pt.y - next.y);
            const handleLen = Math.min(30, Math.min(dPrev, dNext) * 0.4, Math.max(dPrev, dNext) * 0.3);
            const cw = appState.doc.width;
            const ch = appState.doc.height;
            if (pt.cp2x == null) {
              pt.cp2x = Math.round(Math.max(0, Math.min(cw, pt.x + dx * handleLen)));
              pt.cp2y = Math.round(Math.max(0, Math.min(ch, pt.y + dy * handleLen)));
            }
            if (pt.cp1x == null) {
              pt.cp1x = Math.round(Math.max(0, Math.min(cw, pt.x - dx * handleLen)));
              pt.cp1y = Math.round(Math.max(0, Math.min(ch, pt.y - dy * handleLen)));
            }
            pushSnapshot();
            renderFn();
            e.preventDefault();
          }
          return;
        }
      }
    }
  }

  // Resize handle click (select tool)
  if (appState.tool === 'select') {
    const handleEl = e.target.closest('.resize-handle');
    if (handleEl) {
      const handleId = handleEl.dataset.handleId;
      if (handleId) {
        pushSnapshot();
        const selectedShapes = appState.doc.shapes.filter(s => appState.selectedIds.includes(s.id));
        if (selectedShapes.length > 0) {
          let bbox = null;
          for (const s of selectedShapes) {
            const bb = getBoundingBox(s);
            if (!bbox) { bbox = { x: bb.x, y: bb.y, width: bb.width, height: bb.height }; }
            else {
              const x1 = Math.min(bbox.x, bb.x);
              const y1 = Math.min(bbox.y, bb.y);
              const x2 = Math.max(bbox.x + bbox.width, bb.x + bb.width);
              const y2 = Math.max(bbox.y + bbox.height, bb.y + bb.height);
              bbox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
            }
          }
          dragState = {
            mode: 'resize',
            handleId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startSvgX: mx,
            startSvgY: my,
            startBbox: bbox,
            shapes: selectedShapes
          };
          svg.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }
    }
  }

  // Node tool interaction
  if (appState.tool === 'node' && appState.selectedIds.length === 1) {
    const bezier = appState.doc.shapes.find(
      s => s.id === appState.selectedIds[0] && s.type === 'bezier'
    );
    if (bezier) {
      const handleEl = e.target.closest('.control-dot');
      if (handleEl) {
        const handleName = handleEl.dataset.handle;
        if (appState.activePointIndex >= 0 && appState.activePointIndex < bezier.points.length) {
          pushSnapshot();
          dragState = {
            mode: 'node-handle',
            shape: bezier,
            pointIndex: appState.activePointIndex,
            handle: handleName,
            startClientX: e.clientX,
            startClientY: e.clientY
          };
          svg.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }

      const anchorEl = e.target.closest('.anchor-point');
      if (anchorEl) {
        const idx = parseInt(anchorEl.dataset.anchorIndex);
        if (!isNaN(idx) && idx >= 0 && idx < bezier.points.length) {
          appState.activePointIndex = idx;
          renderFn();
          dragState = {
            mode: 'node-anchor',
            shape: bezier,
            pointIndex: idx,
            startClientX: e.clientX,
            startClientY: e.clientY
          };
          svg.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }
      if (!e.target.closest('.anchor-point, .control-dot')) {
        appState.activePointIndex = -1;
        renderFn();
      }
    }
  }

  if (appState.tool === 'select') {
    const shapes = appState.doc.shapes;
    let hitShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitTest(mx, my, shapes[i])) {
        hitShape = shapes[i];
        break;
      }
    }

    if (hitShape) {
      if (!e.shiftKey) {
        if (!(appState.selectedIds.length === 1 && appState.selectedIds[0] === hitShape.id)) {
          appState.selectedIds = [hitShape.id];
        }
      } else {
        const idx = appState.selectedIds.indexOf(hitShape.id);
        if (idx >= 0) {
          appState.selectedIds.splice(idx, 1);
        } else {
          appState.selectedIds.push(hitShape.id);
        }
      }
      renderFn();

      if (appState.selectedIds.length > 0) {
        pushSnapshot();
        const selected = appState.doc.shapes.filter(s => appState.selectedIds.includes(s.id));
        // Store original positions
        for (const s of selected) {
          storeOrigPos(s);
        }
        dragState = {
          mode: 'move',
          startClientX: e.clientX,
          startClientY: e.clientY,
          startSvgX: mx,
          startSvgY: my,
          shapes: selected
        };
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    } else {
      appState.selectedIds = [];
      appState.activePointIndex = -1;
      renderFn();
    }
  } else if (appState.tool === 'circle') {
    dragState = {
      mode: 'create-circle',
      origX: mx,
      origY: my
    };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else if (appState.tool === 'rect') {
    dragState = {
      mode: 'create-rect',
      origX: mx,
      origY: my
    };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else if (appState.tool === 'bezier') {
    const pts = appState.bezierPoints || [];
    if (pts.length > 0) {
      const first = pts[0];
      const dist = Math.hypot(mx - first.x, my - first.y);
      if (dist <= 6 && pts.length >= 2) {
        finishBezier(svg);
        return;
      }
    }
    const newPt = { x: Math.round(mx), y: Math.round(my), cp1x: null, cp1y: null, cp2x: null, cp2y: null };
    if (pts.length > 0) {
      const prev = pts[pts.length - 1];
      prev.cp2x = null;
      prev.cp2y = null;
    }
    pts.push(newPt);
    appState.bezierPoints = pts;
    renderFn();
    e.preventDefault();
  }
}

function storeOrigPos(s) {
  switch (s.type) {
    case 'circle':
      s._ocx = s.cx; s._ocy = s.cy;
      break;
    case 'rect':
      s._ox = s.x; s._oy = s.y;
      break;
    case 'bezier':
      s._opts = s.points.map(p => ({ ...p }));
      break;
  }
}

function onPointerMove(e) {
  if (!dragState || !appState.doc) return;
  const svg = e.currentTarget;
  const curCoords = toSVGCoords(svg, e.clientX, e.clientY);
  const mx = curCoords.x;
  const my = curCoords.y;

  switch (dragState.mode) {
    case 'move': {
      const dx = curCoords.x - dragState.startSvgX;
      const dy = curCoords.y - dragState.startSvgY;
      for (const shape of dragState.shapes) {
        switch (shape.type) {
          case 'circle':
            shape.cx = Math.round(shape._ocx + dx);
            shape.cy = Math.round(shape._ocy + dy);
            break;
          case 'rect':
            shape.x = Math.round(shape._ox + dx);
            shape.y = Math.round(shape._oy + dy);
            break;
          case 'bezier':
            for (let i = 0; i < shape.points.length; i++) {
              const orig = shape._opts[i];
              shape.points[i].x = Math.round(orig.x + dx);
              shape.points[i].y = Math.round(orig.y + dy);
              if (orig.cp1x != null) shape.points[i].cp1x = Math.round(orig.cp1x + dx);
              if (orig.cp1y != null) shape.points[i].cp1y = Math.round(orig.cp1y + dy);
              if (orig.cp2x != null) shape.points[i].cp2x = Math.round(orig.cp2x + dx);
              if (orig.cp2y != null) shape.points[i].cp2y = Math.round(orig.cp2y + dy);
            }
            break;
        }
      }
      renderFn();
      break;
    }
    case 'create-circle': {
      const x = Math.min(dragState.origX, mx);
      const y = Math.min(dragState.origY, my);
      const w = Math.abs(mx - dragState.origX);
      const h = Math.abs(my - dragState.origY);
      const rx = Math.round(w / 2);
      const ry = Math.round(h / 2);
      const cx2 = Math.round(x + w / 2);
      const cy2 = Math.round(y + h / 2);
      appState._preview = { type: 'circle', cx: cx2, cy: cy2, rx, ry };
      renderFn();
      break;
    }
    case 'create-rect': {
      const x = Math.min(dragState.origX, mx);
      const y = Math.min(dragState.origY, my);
      const w = Math.abs(mx - dragState.origX);
      const h = Math.abs(my - dragState.origY);
      appState._preview = { type: 'rect', x, y, width: w, height: h };
      renderFn();
      break;
    }
    case 'node-anchor': {
      const pt = dragState.shape.points[dragState.pointIndex];
      if (pt) {
        pt.x = Math.round(mx);
        pt.y = Math.round(my);
        renderFn();
      }
      break;
    }
    case 'node-handle': {
      const pt = dragState.shape.points[dragState.pointIndex];
      if (pt) {
        if (dragState.handle === 'cp1') {
          pt.cp1x = Math.round(mx);
          pt.cp1y = Math.round(my);
        } else if (dragState.handle === 'cp2') {
          pt.cp2x = Math.round(mx);
          pt.cp2y = Math.round(my);
        }
        renderFn();
      }
      break;
    }
    case 'resize': {
      const dx = curCoords.x - dragState.startSvgX;
      const dy = curCoords.y - dragState.startSvgY;
      const newBbox = computeResizeDelta(dragState.handleId, dragState.startBbox, dx, dy);
      for (const shape of dragState.shapes) {
        applyBBoxToShape(shape, newBbox);
      }
      renderFn();
      break;
    }
  }
}

function onPointerUp(e) {
  if (!dragState || !appState.doc) return;
  const svg = e.currentTarget;
  const coords = toSVGCoords(svg, e.clientX, e.clientY);
  const mx = coords.x;
  const my = coords.y;

  switch (dragState.mode) {
    case 'create-circle': {
      const x = Math.min(dragState.origX, mx);
      const y = Math.min(dragState.origY, my);
      const w = Math.abs(mx - dragState.origX);
      const h = Math.abs(my - dragState.origY);
      appState._preview = null;
      if (w > 0 && h > 0) {
        pushSnapshot();
        const cx2 = Math.round(x + w / 2);
        const cy2 = Math.round(y + h / 2);
        const rx = Math.max(1, Math.round(w / 2));
        const ry = Math.max(1, Math.round(h / 2));
        const shape = createCircle(cx2, cy2, rx, ry);
        appState.doc.shapes.push(shape);
        appState.selectedIds = [shape.id];
        appState.tool = 'select';
        updateToolUI();
      }
      renderFn();
      break;
    }
    case 'create-rect': {
      const x = Math.min(dragState.origX, mx);
      const y = Math.min(dragState.origY, my);
      const w = Math.abs(mx - dragState.origX);
      const h = Math.abs(my - dragState.origY);
      appState._preview = null;
      if (w > 0 && h > 0) {
        pushSnapshot();
        const shape = createRect(x, y, w, h);
        appState.doc.shapes.push(shape);
        appState.selectedIds = [shape.id];
        appState.tool = 'select';
        updateToolUI();
      }
      renderFn();
      break;
    }
    case 'move':
      for (const s of dragState.shapes) {
        delete s._ocx; delete s._ocy; delete s._ox; delete s._oy; delete s._opts;
      }
      renderFn();
      break;
    case 'resize':
    case 'node-anchor':
    case 'node-handle':
      renderFn();
      break;
  }

  dragState = null;
}

function finishBezier(svg) {
  const pts = appState.bezierPoints || [];
  if (pts.length >= 2) {
    pushSnapshot();
    const shape = createBezier(pts);
    appState.doc.shapes.push(shape);
    appState.selectedIds = [shape.id];
  }
  appState.bezierPoints = [];
  appState.tool = 'select';
  updateToolUI();
  renderFn();
}

function updateToolUI() {
  document.querySelectorAll('#tool-palette .btn-icon').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tool-${appState.tool}`);
  if (btn) btn.classList.add('active');
}

function pushSnapshot() {
  if (appState.onPushSnapshot) appState.onPushSnapshot();
}