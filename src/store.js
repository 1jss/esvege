const DOCUMENTS_KEY = 'esvege-documents';
const ACTIVE_KEY = 'esvege-active';
const MAX_DOCS = 50;

function generateThumbnail(doc) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.width} ${doc.height}" width="${doc.width}" height="${doc.height}">`;
  const shapes = doc.shapes.map(s => toSVGString(s)).join('');
  return `data:image/svg+xml,${encodeURIComponent(svg + shapes + '</svg>')}`;
}

function toSVGString(shape) {
  switch (shape.type) {
    case 'circle':
      return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" fill="${shape.fill}"/>`;
    case 'rect':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${shape.fill}"/>`;
    case 'bezier':
      return bezierToSVGString(shape);
    default:
      return '';
  }
}

function bezierToSVGString(shape) {
  const pts = shape.points;
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const pt = pts[i];
    const cp2 = prev.cp2x != null ? prev.cp2x : null;
    const cp2y = prev.cp2y != null ? prev.cp2y : null;
    const cp1 = pt.cp1x != null ? pt.cp1x : null;
    const cp1y = pt.cp1y != null ? pt.cp1y : null;
    if (cp2 != null && cp1 != null) {
      d += `C${cp2},${prev.cp2y} ${cp1},${pt.cp1y} ${pt.x},${pt.y}`;
    } else if (cp2 != null) {
      d += `Q${cp2},${prev.cp2y} ${pt.x},${pt.y}`;
    } else if (cp1 != null) {
      d += `Q${cp1},${pt.cp1y} ${pt.x},${pt.y}`;
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
  return `<path d="${d}" fill="${shape.fill}"/>`;
}

function loadAll() {
  try {
    const raw = localStorage.getItem(DOCUMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(docs) {
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
}

function listDocuments() {
  const docs = loadAll();
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    thumbnail: d.thumbnail,
    updatedAt: d.updatedAt
  }));
}

function loadDocument(id) {
  const docs = loadAll();
  const doc = docs.find(d => d.id === id);
  if (!doc) return null;
  // Strip thumbnail from the shape payload
  const { thumbnail, ...rest } = doc;
  return rest;
}

function saveDocument(doc) {
  const docs = loadAll();
  const idx = docs.findIndex(d => d.id === doc.id);
  const now = Date.now();
  doc.updatedAt = now;
  const entry = {
    ...doc,
    thumbnail: generateThumbnail(doc)
  };
  if (idx >= 0) {
    docs[idx] = entry;
  } else {
    docs.push(entry);
  }
  // Evict oldest if over limit
  if (docs.length > MAX_DOCS) {
    docs.sort((a, b) => a.updatedAt - b.updatedAt);
    docs.splice(0, docs.length - MAX_DOCS);
  }
  try {
    saveAll(docs);
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      throw new Error('storage full, delete some files');
    }
    throw e;
  }
}

function deleteDocument(id) {
  const docs = loadAll();
  const filtered = docs.filter(d => d.id !== id);
  saveAll(filtered);
  if (getActive() === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

function setActive(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}

function getActive() {
  return localStorage.getItem(ACTIVE_KEY);
}

export {
  listDocuments,
  loadDocument,
  saveDocument,
  deleteDocument,
  setActive,
  getActive
};