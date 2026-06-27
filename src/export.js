import { toSVGElement } from './shapes.js';

export function exportSVG(doc) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('viewBox', `0 0 ${doc.width} ${doc.height}`);
  svg.setAttribute('width', doc.width);
  svg.setAttribute('height', doc.height);
  svg.setAttribute('version', '1.1');

  for (const shape of doc.shapes) {
    svg.appendChild(toSVGElement(shape));
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);

  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name + '.svg' || 'untitled.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}