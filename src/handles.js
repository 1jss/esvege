import { getBoundingBox, cloneShape } from './shapes.js';

/**
 * Draw selection bounding-box handles for a list of shapes.
 * Returns an array of handle descriptors used for drag-resize.
 */
export function drawSelectionHandles(svg, shapes, zoom) {
  const ns = 'http://www.w3.org/2000/svg';
  const handlesLayer = svg.querySelector('#handles-layer');
  if (!handlesLayer || shapes.length === 0) return [];

  // Compute combined bounding box
  let bbox = null;
  for (const s of shapes) {
    const bb = getBoundingBox(s);
    if (!bbox) {
      bbox = bb;
    } else {
      const x1 = Math.min(bbox.x, bb.x);
      const y1 = Math.min(bbox.y, bb.y);
      const x2 = Math.max(bbox.x + bbox.width, bb.x + bb.width);
      const y2 = Math.max(bbox.y + bbox.height, bb.y + bb.height);
      bbox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
  }
  if (!bbox) return [];

  // Bounding box rect (dashed outline)
  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', bbox.x);
  rect.setAttribute('y', bbox.y);
  rect.setAttribute('width', bbox.width);
  rect.setAttribute('height', bbox.height);
  rect.classList.add('shape-handle');
  handlesLayer.appendChild(rect);

  // 8 resize handles
  const handles = [];
  const positions = [
    { id: 'nw', x: bbox.x, y: bbox.y, cursor: 'nw-resize' },
    { id: 'n', x: bbox.x + bbox.width / 2, y: bbox.y, cursor: 'n-resize' },
    { id: 'ne', x: bbox.x + bbox.width, y: bbox.y, cursor: 'ne-resize' },
    { id: 'w', x: bbox.x, y: bbox.y + bbox.height / 2, cursor: 'w-resize' },
    { id: 'e', x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2, cursor: 'e-resize' },
    { id: 'sw', x: bbox.x, y: bbox.y + bbox.height, cursor: 'sw-resize' },
    { id: 's', x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height, cursor: 's-resize' },
    { id: 'se', x: bbox.x + bbox.width, y: bbox.y + bbox.height, cursor: 'se-resize' },
  ];

  for (const pos of positions) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', 6 / zoom);
    circle.classList.add('resize-handle');
    circle.style.cursor = pos.cursor;
    circle.dataset.handleId = pos.id;
    handlesLayer.appendChild(circle);
    handles.push({ id: pos.id, x: pos.x, y: pos.y, el: circle });
  }

  return { bbox, handles };
}

/**
 * Compute resize deltas for a given handle drag.
 */
export function computeResizeDelta(handleId, startBbox, dx, dy, shapeType) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  const b = startBbox;
  let newBbox = { x: b.x, y: b.y, width: b.width, height: b.height };

  switch (handleId) {
    case 'nw':
      newBbox.x = b.x + dx;
      newBbox.y = b.y + dy;
      newBbox.width = b.width - dx;
      newBbox.height = b.height - dy;
      break;
    case 'n':
      newBbox.y = b.y + dy;
      newBbox.height = b.height - dy;
      break;
    case 'ne':
      newBbox.y = b.y + dy;
      newBbox.width = b.width + dx;
      newBbox.height = b.height - dy;
      break;
    case 'w':
      newBbox.x = b.x + dx;
      newBbox.width = b.width - dx;
      break;
    case 'e':
      newBbox.width = b.width + dx;
      break;
    case 'sw':
      newBbox.x = b.x + dx;
      newBbox.width = b.width - dx;
      newBbox.height = b.height + dy;
      break;
    case 's':
      newBbox.height = b.height + dy;
      break;
    case 'se':
      newBbox.width = b.width + dx;
      newBbox.height = b.height + dy;
      break;
  }

  // Enforce min size
  if (newBbox.width < 1) newBbox.width = 1;
  if (newBbox.height < 1) newBbox.height = 1;

  return newBbox;
}

/**
 * Apply a new bounding box to a shape (for resize).
 */
export function applyBBoxToShape(shape, bbox) {
  switch (shape.type) {
    case 'circle': {
      shape.cx = Math.round(bbox.x + bbox.width / 2);
      shape.cy = Math.round(bbox.y + bbox.height / 2);
      shape.rx = Math.max(1, Math.round(bbox.width / 2));
      shape.ry = Math.max(1, Math.round(bbox.height / 2));
      break;
    }
    case 'rect':
      shape.x = Math.round(bbox.x);
      shape.y = Math.round(bbox.y);
      shape.width = Math.round(bbox.width);
      shape.height = Math.round(bbox.height);
      break;
    case 'bezier': {
      const oldBB = getBoundingBox(shape);
      if (oldBB.width === 0 || oldBB.height === 0) break;
      const sx = bbox.width / oldBB.width;
      const sy = bbox.height / oldBB.height;
      for (const pt of shape.points) {
        pt.x = Math.round(bbox.x + (pt.x - oldBB.x) * sx);
        pt.y = Math.round(bbox.y + (pt.y - oldBB.y) * sy);
        if (pt.cp1x != null) pt.cp1x = Math.round(bbox.x + (pt.cp1x - oldBB.x) * sx);
        if (pt.cp1y != null) pt.cp1y = Math.round(bbox.y + (pt.cp1y - oldBB.y) * sy);
        if (pt.cp2x != null) pt.cp2x = Math.round(bbox.x + (pt.cp2x - oldBB.x) * sx);
        if (pt.cp2y != null) pt.cp2y = Math.round(bbox.y + (pt.cp2y - oldBB.y) * sy);
      }
      break;
    }
  }
}

/**
 * Draw bezier node editing handles (anchor points + control handles).
 */
export function drawNodeHandles(svg, shape, activePointIndex, zoom) {
  const ns = 'http://www.w3.org/2000/svg';
  const handlesLayer = svg.querySelector('#handles-layer');
  if (!handlesLayer || !shape || shape.type !== 'bezier') return;

  const pts = shape.points;

  // Draw lines between points
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];

    // Control handle lines for active point
    if (i === activePointIndex) {
      if (pt.cp1x != null) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', pt.x);
        line.setAttribute('y1', pt.y);
        line.setAttribute('x2', pt.cp1x);
        line.setAttribute('y2', pt.cp1y);
        line.classList.add('control-line');
        handlesLayer.appendChild(line);
      }
      if (pt.cp2x != null) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', pt.x);
        line.setAttribute('y1', pt.y);
        line.setAttribute('x2', pt.cp2x);
        line.setAttribute('y2', pt.cp2y);
        line.classList.add('control-line');
        handlesLayer.appendChild(line);
      }
    }

    // Anchor point
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', pt.x);
    circle.setAttribute('cy', pt.y);
    circle.setAttribute('r', 6.5 / zoom);
    circle.classList.add('anchor-point');
    if (i === activePointIndex) circle.classList.add('active');
    circle.dataset.anchorIndex = i;
    handlesLayer.appendChild(circle);
  }

  // Control handle dots for active point
  if (activePointIndex >= 0 && activePointIndex < pts.length) {
    const pt = pts[activePointIndex];
    if (pt.cp1x != null) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pt.cp1x);
      dot.setAttribute('cy', pt.cp1y);
      dot.setAttribute('r', 6 / zoom);
      dot.classList.add('control-dot');
      dot.dataset.handle = 'cp1';
      handlesLayer.appendChild(dot);
    }
    if (pt.cp2x != null) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pt.cp2x);
      dot.setAttribute('cy', pt.cp2y);
      dot.setAttribute('r', 6 / zoom);
      dot.classList.add('control-dot');
      dot.dataset.handle = 'cp2';
      handlesLayer.appendChild(dot);
    }
  }
}

export function pointToAnchorDist(mx, my, pt) {
  return Math.hypot(mx - pt.x, my - pt.y);
}

export function pointToHandleDist(mx, my, pt, handle) {
  if (handle === 'cp1' && pt.cp1x != null) return Math.hypot(mx - pt.cp1x, my - pt.cp1y);
  if (handle === 'cp2' && pt.cp2x != null) return Math.hypot(mx - pt.cp2x, my - pt.cp2y);
  return Infinity;
}
