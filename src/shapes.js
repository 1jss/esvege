export function getId() {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

let FILLS = ['#eeeeec', '#d3d7cf', '#babdb6',
             '#888a85', '#555753', '#2e3436',
             '#fce94f', '#edd400', '#c4a000',
             '#8ae234', '#73d216', '#4e9a06',
             '#e9b96e', '#c17d11', '#8f5902',
             '#fcaf3e', '#f57900', '#ce5c00',
             '#ad7fa8', '#75507b', '#5c3566',
             '#ef2929', '#cc0000', '#a40000',
             '#729fcf', '#3465a4', '#204a87'];
let fillIdx = 0;
function nextFill() {
  const c = FILLS[fillIdx % FILLS.length];
  fillIdx++;
  return c;
}
export { nextFill as resetFill };

// --- Shape factories ---

export function createCircle(cx, cy, rx, ry, fill) {
  return {
    type: 'circle',
    id: getId(),
    fill: fill || nextFill(),
    cx: Math.round(cx),
    cy: Math.round(cy),
    rx: Math.round(rx),
    ry: Math.round(ry)
  };
}

export function createRect(x, y, w, h, fill) {
  return {
    type: 'rect',
    id: getId(),
    fill: fill || nextFill(),
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(w),
    height: Math.round(h)
  };
}

export function createBezier(points, fill) {
  return {
    type: 'bezier',
    id: getId(),
    fill: fill || nextFill(),
    points: points.map(p => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
      cp1x: p.cp1x != null ? Math.round(p.cp1x) : null,
      cp1y: p.cp1y != null ? Math.round(p.cp1y) : null,
      cp2x: p.cp2x != null ? Math.round(p.cp2x) : null,
      cp2y: p.cp2y != null ? Math.round(p.cp2y) : null
    })),
    closed: true
  };
}

// --- Serialization ---

export function toSVGElement(shape) {
  const ns = 'http://www.w3.org/2000/svg';
  switch (shape.type) {
    case 'circle': {
      const el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', shape.cx);
      el.setAttribute('cy', shape.cy);
      el.setAttribute('rx', shape.rx);
      el.setAttribute('ry', shape.ry);
      el.setAttribute('fill', shape.fill);
      el.dataset.shapeId = shape.id;
      return el;
    }
    case 'rect': {
      const el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', shape.x);
      el.setAttribute('y', shape.y);
      el.setAttribute('width', shape.width);
      el.setAttribute('height', shape.height);
      el.setAttribute('fill', shape.fill);
      el.dataset.shapeId = shape.id;
      return el;
    }
    case 'bezier': {
      const el = document.createElementNS(ns, 'path');
      el.setAttribute('d', bezierToPath(shape));
      el.setAttribute('fill', shape.fill);
      el.dataset.shapeId = shape.id;
      return el;
    }
    default:
      throw new Error('Unknown shape type: ' + shape.type);
  }
}

function bezierToPath(shape) {
  const pts = shape.points;
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const pt = pts[i];
    const cp2x = prev.cp2x;
    const cp2y = prev.cp2y;
    const cp1x = pt.cp1x;
    const cp1y = pt.cp1y;
    if (cp2x != null && cp1x != null) {
      d += `C${cp2x},${cp2y} ${cp1x},${cp1y} ${pt.x},${pt.y}`;
    } else if (cp2x != null) {
      d += `Q${cp2x},${cp2y} ${pt.x},${pt.y}`;
    } else if (cp1x != null) {
      d += `Q${cp1x},${cp1y} ${pt.x},${pt.y}`;
    } else {
      d += `L${pt.x},${pt.y}`;
    }
  }
  if (shape.closed) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    const cp2x = last.cp2x, cp2y = last.cp2y;
    const cp1x = first.cp1x, cp1y = first.cp1y;
    if (cp2x != null && cp1x != null) {
      d += `C${cp2x},${cp2y} ${cp1x},${cp1y} ${first.x},${first.y}`;
    } else if (cp2x != null) {
      d += `Q${cp2x},${cp2y} ${first.x},${first.y}`;
    } else if (cp1x != null) {
      d += `Q${cp1x},${cp1y} ${first.x},${first.y}`;
    } else {
      d += `L${first.x},${first.y}`;
    }
  }
  return d;
}

// --- SVG import ---

export function fromSVGElement(el) {
  const tag = el.tagName.toLowerCase();
  const fill = el.getAttribute('fill') || '#000000';
  switch (tag) {
    case 'circle':
      return createCircle(
        parseFloat(el.getAttribute('cx')) || 0,
        parseFloat(el.getAttribute('cy')) || 0,
        parseFloat(el.getAttribute('rx')) || parseFloat(el.getAttribute('r')) || 0,
        parseFloat(el.getAttribute('ry')) || parseFloat(el.getAttribute('r')) || 0,
        fill
      );
    case 'ellipse':
      return createCircle(
        parseFloat(el.getAttribute('cx')) || 0,
        parseFloat(el.getAttribute('cy')) || 0,
        parseFloat(el.getAttribute('rx')) || 0,
        parseFloat(el.getAttribute('ry')) || 0,
        fill
      );
    case 'rect':
      return createRect(
        parseFloat(el.getAttribute('x')) || 0,
        parseFloat(el.getAttribute('y')) || 0,
        parseFloat(el.getAttribute('width')) || 0,
        parseFloat(el.getAttribute('height')) || 0,
        fill
      );
    case 'path':
      return fromSVGPath(el.getAttribute('d') || '', fill);
    default:
      return null;
  }
}

function fromSVGPath(d, fill) {
  // Parse simplified path commands: M, L, Q, C, Z
  const re = /([MLQCZ])\s*([-\d.,\s]+)/gi;
  let match;
  const commands = [];
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1].toUpperCase();
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    commands.push({ cmd, args });
  }
  if (commands.length === 0) return null;

  const points = [];
  let firstX = 0, firstY = 0;

  for (let i = 0; i < commands.length; i++) {
    const { cmd, args } = commands[i];
    if (cmd === 'M') {
      firstX = args[0];
      firstY = args[1];
      points.push({ x: args[0], y: args[1], cp1x: null, cp1y: null, cp2x: null, cp2y: null });
    } else if (cmd === 'L') {
      const prev = points[points.length - 1];
      if (prev) { prev.cp2x = null; prev.cp2y = null; }
      points.push({ x: args[0], y: args[1], cp1x: null, cp1y: null, cp2x: null, cp2y: null });
    } else if (cmd === 'Q') {
      const prev = points[points.length - 1];
      if (prev) { prev.cp2x = args[0]; prev.cp2y = args[1]; }
      points.push({ x: args[2], y: args[3], cp1x: args[0], cp1y: args[1], cp2x: null, cp2y: null });
    } else if (cmd === 'C') {
      const prev = points[points.length - 1];
      if (prev) { prev.cp2x = args[0]; prev.cp2y = args[1]; }
      points.push({ x: args[4], y: args[5], cp1x: args[2], cp1y: args[3], cp2x: null, cp2y: null });
    } else if (cmd === 'Z') {
    }
  }

  if (points.length < 2) return null;
  return createBezier(points, fill);
}

// --- Hit testing ---

export function hitTest(mx, my, shape) {
  switch (shape.type) {
    case 'circle':
      return hitTestCircle(mx, my, shape);
    case 'rect':
      return hitTestRect(mx, my, shape);
    case 'bezier':
      return hitTestBezier(mx, my, shape);
    default:
      return false;
  }
}

function hitTestCircle(mx, my, c) {
  const dx = mx - c.cx;
  const dy = my - c.cy;
  return (dx * dx) / (c.rx * c.rx) + (dy * dy) / (c.ry * c.ry) <= 1;
}

function hitTestRect(mx, my, r) {
  return mx >= r.x && mx <= r.x + r.width &&
         my >= r.y && my <= r.y + r.height;
}

function hitTestBezier(mx, my, b) {
  // Point-to-segment distance < 4px
  const pts = b.points;
  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];
    if (pointToSegmentDist(mx, my, p1.x, p1.y, p2.x, p2.y) < 4) return true;
  }
  if (b.closed && pts.length > 1) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    if (pointToSegmentDist(mx, my, last.x, last.y, first.x, first.y) < 4) return true;
  }
  const bb = getBoundingBox(b);
  return mx >= bb.x && mx <= bb.x + bb.width &&
         my >= bb.y && my <= bb.y + bb.height;
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearX = ax + t * dx;
  const nearY = ay + t * dy;
  return Math.hypot(px - nearX, py - nearY);
}

// --- Bounding box ---

export function getBoundingBox(shape) {
  switch (shape.type) {
    case 'circle':
      return {
        x: shape.cx - shape.rx,
        y: shape.cy - shape.ry,
        width: 2 * shape.rx,
        height: 2 * shape.ry
      };
    case 'rect':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'bezier': {
      const pts = shape.points;
      if (pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.cp1x != null && p.cp1x < minX) minX = p.cp1x;
        if (p.cp1y != null && p.cp1y < minY) minY = p.cp1y;
        if (p.cp1x != null && p.cp1x > maxX) maxX = p.cp1x;
        if (p.cp1y != null && p.cp1y > maxY) maxY = p.cp1y;
        if (p.cp2x != null && p.cp2x < minX) minX = p.cp2x;
        if (p.cp2y != null && p.cp2y < minY) minY = p.cp2y;
        if (p.cp2x != null && p.cp2x > maxX) maxX = p.cp2x;
        if (p.cp2y != null && p.cp2y > maxY) maxY = p.cp2y;
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}

// --- Deep clone ---

export function cloneShape(shape) {
  return JSON.parse(JSON.stringify(shape));
}