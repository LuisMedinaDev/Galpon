// Blueprint generator math & drawing library
const fs = require('fs');

class PdfEngine {
  constructor() {
    this.pages = [];
  }

  addPage(w = 841.89, h = 595.28) { // A4 Landscape
    const page = new SheetPage(w, h);
    this.pages.push(page);
    return page;
  }

  build() {
    const fontHelvetica = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    const fontBold = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
    const fontOblique = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`;

    const allObjs = [];
    const numPages = this.pages.length;
    const fontHId = 3;
    const fontBId = 4;
    const fontOId = 5;
    const firstPageObjId = 6;
    const firstContentObjId = firstPageObjId + numPages;

    allObjs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    const kidsStr = this.pages.map((_, i) => `${firstPageObjId + i} 0 R`).join(' ');
    allObjs.push(`<< /Type /Pages /Kids [${kidsStr}] /Count ${numPages} >>`);
    allObjs.push(fontHelvetica);
    allObjs.push(fontBold);
    allObjs.push(fontOblique);

    this.pages.forEach((p, i) => {
      const contentRef = `${firstContentObjId + i} 0 R`;
      allObjs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Resources << /Font << /F1 ${fontHId} 0 R /F2 ${fontBId} 0 R /F3 ${fontOId} 0 R >> /ProcSet [/PDF /Text /ImageB /ImageC /ImageI] >> /Contents ${contentRef} >>`);
    });

    this.pages.forEach((p) => {
      const stream = p.getStream();
      const streamLen = Buffer.byteLength(stream, 'latin1');
      allObjs.push(`<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`);
    });

    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];

    allObjs.forEach((obj, idx) => {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${allObjs.length + 1}\n`;
    out += `0000000000 65535 f \n`;
    for (let i = 1; i <= allObjs.length; i++) {
      out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }

    out += `trailer\n<< /Size ${allObjs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}

class SheetPage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.commands = [];
  }

  escapeText(str) {
    return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  save() { this.commands.push('q'); return this; }
  restore() { this.commands.push('Q'); return this; }
  lineWidth(w) { this.commands.push(`${w.toFixed(2)} w`); return this; }
  lineCap(c) { this.commands.push(`${c} J`); return this; }
  lineJoin(j) { this.commands.push(`${j} j`); return this; }
  dash(arr, phase = 0) {
    if (!arr || arr.length === 0) this.commands.push('[] 0 d');
    else this.commands.push(`[${arr.join(' ')}] ${phase} d`);
    return this;
  }
  strokeColor(r, g, b) { this.commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`); return this; }
  fillColor(r, g, b) { this.commands.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`); return this; }

  line(x1, y1, x2, y2) {
    this.commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }

  rect(x, y, w, h, stroke = true, fill = false) {
    this.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (stroke && fill) this.commands.push('B');
    else if (fill) this.commands.push('f');
    else if (stroke) this.commands.push('S');
    return this;
  }

  polygon(pts, stroke = true, fill = false) {
    if (pts.length < 2) return this;
    this.commands.push(`${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} m`);
    for (let i = 1; i < pts.length; i++) {
      this.commands.push(`${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} l`);
    }
    this.commands.push('h');
    if (stroke && fill) this.commands.push('B');
    else if (fill) this.commands.push('f');
    else if (stroke) this.commands.push('S');
    return this;
  }

  circle(cx, cy, r, stroke = true, fill = false) {
    const k = 0.552284749831 * r;
    this.commands.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`);
    this.commands.push(`${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`);
    this.commands.push(`${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`);
    this.commands.push(`${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`);
    this.commands.push(`${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`);
    this.commands.push('h');
    if (stroke && fill) this.commands.push('B');
    else if (fill) this.commands.push('f');
    else if (stroke) this.commands.push('S');
    return this;
  }

  text(str, x, y, size = 10, font = '/F1', align = 'left', rotDeg = 0) {
    this.save();
    const safeStr = this.escapeText(str);
    const approxWidth = str.length * size * 0.52;
    let ox = x;
    if (align === 'center') ox -= approxWidth / 2;
    else if (align === 'right') ox -= approxWidth;

    if (rotDeg === 0) {
      this.commands.push(`BT ${font} ${size} Tf ${ox.toFixed(2)} ${y.toFixed(2)} Td (${safeStr}) Tj ET`);
    } else {
      const rad = (rotDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let tx = 0, ty = 0;
      if (align === 'center') { tx = -approxWidth / 2; }
      else if (align === 'right') { tx = -approxWidth; }
      this.commands.push(`BT ${font} ${size} Tf ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} Tm ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${safeStr}) Tj ET`);
    }
    this.restore();
    return this;
  }

  // Dimension lines with architectural ticks & labels
  dimH(x1, x2, y, label, extOffset = 15, tickSize = 3) {
    this.save();
    this.strokeColor(0.2, 0.25, 0.3).lineWidth(0.6).dash([]);
    // extension lines
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const extDir = extOffset >= 0 ? 1 : -1;
    this.line(x1, y - (extOffset > 0 ? 4 : -4), x1, y + 5 * extDir);
    this.line(x2, y - (extOffset > 0 ? 4 : -4), x2, y + 5 * extDir);
    // main dimension line
    this.line(minX, y, maxX, y);
    // architectural ticks at 45 degrees
    this.lineWidth(0.9);
    this.line(x1 - tickSize, y - tickSize, x1 + tickSize, y + tickSize);
    this.line(x2 - tickSize, y - tickSize, x2 + tickSize, y + tickSize);
    // label with white background mask
    const midX = (x1 + x2) / 2;
    const approxW = label.length * 6.5 + 4;
    this.fillColor(1, 1, 1).rect(midX - approxW / 2, y - 4, approxW, 9, false, true);
    this.fillColor(0.1, 0.15, 0.2).text(label, midX, y - 2.5, 7.5, '/F2', 'center');
    this.restore();
    return this;
  }

  dimV(y1, y2, x, label, extOffset = 15, tickSize = 3) {
    this.save();
    this.strokeColor(0.2, 0.25, 0.3).lineWidth(0.6).dash([]);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const extDir = extOffset >= 0 ? 1 : -1;
    this.line(x - (extOffset > 0 ? 4 : -4), y1, x + 5 * extDir, y1);
    this.line(x - (extOffset > 0 ? 4 : -4), y2, x + 5 * extDir, y2);
    this.line(x, minY, x, maxY);
    this.lineWidth(0.9);
    this.line(x - tickSize, y1 - tickSize, x + tickSize, y1 + tickSize);
    this.line(x - tickSize, y2 - tickSize, x + tickSize, y2 + tickSize);
    const midY = (y1 + y2) / 2;
    const approxW = label.length * 6.5 + 4;
    this.fillColor(1, 1, 1).rect(x - 5, midY - approxW / 2, 10, approxW, false, true);
    this.fillColor(0.1, 0.15, 0.2).text(label, x - 2.5, midY, 7.5, '/F2', 'center', 90);
    this.restore();
    return this;
  }

  // Level indicator symbol (Cota de Nivel en Sección)
  levelTag(x, y, label, value) {
    this.save();
    this.strokeColor(0.1, 0.15, 0.25).lineWidth(0.8);
    // downward triangle
    this.polygon([[x, y], [x - 6, y + 8], [x + 6, y + 8]], true, false);
    this.fillColor(0.1, 0.15, 0.25).polygon([[x, y], [x - 6, y + 8], [x, y + 8]], true, true);
    this.line(x, y + 8, x + 40, y + 8);
    this.text(label, x + 2, y + 10, 6.5, '/F2', 'left');
    this.text(value, x + 2, y + 1, 6.5, '/F1', 'left');
    this.restore();
    return this;
  }

  // Axis bubble with letter or number
  axisBubble(cx, cy, label, r = 9) {
    this.save();
    this.fillColor(1, 1, 1).strokeColor(0.15, 0.2, 0.3).lineWidth(1);
    this.circle(cx, cy, r, true, true);
    this.fillColor(0.1, 0.15, 0.25).text(label, cx, cy - 3, 9, '/F2', 'center');
    this.restore();
    return this;
  }

  // Architectural Frame and Title Block (Cajetín)
  drawSheetBorderAndTitleBlock(sheetNo, totalSheets, code, title, subtitle, scaleStr = 'INDICADA') {
    const W = this.width;
    const H = this.height;
    const margin = 20;

    this.save();
    // Background subtle tone
    this.fillColor(0.99, 0.99, 1.0).rect(0, 0, W, H, false, true);

    // Double border
    this.strokeColor(0.15, 0.2, 0.3).lineWidth(1.5).rect(margin, margin, W - 2 * margin, H - 2 * margin, true, false);
    this.strokeColor(0.4, 0.45, 0.55).lineWidth(0.5).rect(margin + 4, margin + 4, W - 2 * margin - 8, H - 2 * margin - 8, true, false);

    // Grid coordinates markers along border
    this.fillColor(0.5, 0.55, 0.65);
    const coordsX = ['A', 'B', 'C', 'D', 'E', 'F'];
    const stepX = (W - 2 * margin) / 6;
    for (let i = 0; i < 6; i++) {
      this.text(coordsX[i], margin + (i + 0.5) * stepX, H - margin - 3, 6, '/F2', 'center');
      this.text(coordsX[i], margin + (i + 0.5) * stepX, margin + 0.5, 6, '/F2', 'center');
    }
    const coordsY = ['1', '2', '3', '4'];
    const stepY = (H - 2 * margin) / 4;
    for (let i = 0; i < 4; i++) {
      this.text(coordsY[i], margin + 1, margin + (i + 0.5) * stepY, 6, '/F2', 'center');
      this.text(coordsY[i], W - margin - 3, margin + (i + 0.5) * stepY, 6, '/F2', 'center');
    }

    // Title Block (Cajetín Arquitectónico) at bottom
    const tbX = margin + 4;
    const tbY = margin + 4;
    const tbW = W - 2 * margin - 8;
    const tbH = 50;

    // Background for Title block
    this.fillColor(0.94, 0.96, 0.98).strokeColor(0.2, 0.25, 0.35).lineWidth(1);
    this.rect(tbX, tbY, tbW, tbH, true, true);

    // Vertical dividers in title block
    // Box 1: Project & Client (width 260)
    // Box 2: Sheet Title & Subtitle (width 320)
    // Box 3: Technical parameters (width 120)
    // Box 4: Sheet Number & Scale (rest)
    const d1 = tbX + 240;
    const d2 = d1 + 280;
    const d3 = d2 + 130;
    this.line(d1, tbY, d1, tbY + tbH);
    this.line(d2, tbY, d2, tbY + tbH);
    this.line(d3, tbY, d3, tbY + tbH);

    // Content Box 1: Proyecto
    this.fillColor(0.05, 0.2, 0.45).text('PROYECTO AGROPRODUCTIVO BIOCLIMÁTICO', tbX + 10, tbY + 36, 8, '/F2');
    this.fillColor(0.15, 0.2, 0.3).text('GALPÓN AVÍCOLA 360 GALLINAS (CLIMA CÁLIDO)', tbX + 10, tbY + 24, 9, '/F2');
    this.fillColor(0.4, 0.45, 0.5).text('Densidad: 5 Aves/m² | Área Galpón: 72.00 m² (6x12m) | Techo: 110.88 m²', tbX + 10, tbY + 12, 6.5, '/F1');
    this.fillColor(0.4, 0.45, 0.5).text('Orientación Eje Longitudinal: ESTE - OESTE | Elevación: +0.20 m', tbX + 10, tbY + 3.5, 6, '/F3');

    // Content Box 2: Plano
    this.fillColor(0.4, 0.45, 0.5).text('CONTENIDO DE LA LÁMINA:', d1 + 10, tbY + 38, 6.5, '/F2');
    this.fillColor(0.08, 0.12, 0.25).text(title, d1 + 10, tbY + 23, 11, '/F2');
    this.fillColor(0.3, 0.35, 0.45).text(subtitle, d1 + 10, tbY + 10, 7.5, '/F1');

    // Content Box 3: Datos Técnicos
    this.fillColor(0.4, 0.45, 0.5).text('ESPECIFICACIONES:', d2 + 8, tbY + 38, 6.5, '/F2');
    this.fillColor(0.2, 0.25, 0.3).text(`ESCALA: ${scaleStr}`, d2 + 8, tbY + 27, 7, '/F2');
    this.fillColor(0.2, 0.25, 0.3).text('FECHA: NOVIEMBRE 2026', d2 + 8, tbY + 17, 7, '/F1');
    this.fillColor(0.2, 0.25, 0.3).text('UNIDADES: METROS (m)', d2 + 8, tbY + 7, 7, '/F1');

    // Content Box 4: Código y Número de Lámina
    this.fillColor(0.08, 0.2, 0.45).rect(d3, tbY, tbX + tbW - d3, tbH, true, true);
    this.fillColor(1, 1, 1).text('LÁMINA', (d3 + tbX + tbW) / 2, tbY + 35, 8, '/F2', 'center');
    this.fillColor(1, 1, 1).text(code, (d3 + tbX + tbW) / 2, tbY + 18, 14, '/F2', 'center');
    this.fillColor(0.85, 0.9, 0.95).text(`${sheetNo} DE ${totalSheets}`, (d3 + tbX + tbW) / 2, tbY + 6, 7, '/F1', 'center');

    this.restore();
    return this;
  }

  // North Arrow with East-West orientation emphasis
  drawCompass(cx, cy, r = 18) {
    this.save();
    this.strokeColor(0.2, 0.25, 0.35).lineWidth(0.8);
    this.circle(cx, cy, r, true, false);
    // North pointer (upwards)
    this.fillColor(0.1, 0.15, 0.25).polygon([[cx, cy], [cx - 4, cy], [cx, cy + r - 2]], true, true);
    this.fillColor(1, 1, 1).strokeColor(0.1, 0.15, 0.25).polygon([[cx, cy], [cx + 4, cy], [cx, cy + r - 2]], true, false);
    // South pointer
    this.fillColor(0.7, 0.75, 0.8).polygon([[cx, cy], [cx + 3, cy], [cx, cy - r + 2]], true, true);
    // East-West axis
    this.strokeColor(0.8, 0.2, 0.1).lineWidth(1.2);
    this.line(cx - r - 8, cy, cx + r + 8, cy);
    // Text labels
    this.fillColor(0.1, 0.15, 0.25).text('N', cx, cy + r + 1, 7.5, '/F2', 'center');
    this.fillColor(0.4, 0.45, 0.5).text('S', cx, cy - r - 7, 6.5, '/F1', 'center');
    this.fillColor(0.8, 0.2, 0.1).text('E (Saliente)', cx + r + 10, cy - 2.5, 6.5, '/F2', 'left');
    this.fillColor(0.8, 0.2, 0.1).text('O (Poniente)', cx - r - 10, cy - 2.5, 6.5, '/F2', 'right');
    this.fillColor(0.05, 0.35, 0.1).text('EJE PRINCIPAL GALPÓN: ESTE - OESTE', cx, cy - r - 16, 6, '/F2', 'center');
    this.restore();
    return this;
  }

  getStream() {
    return this.commands.join('\n');
  }
}

module.exports = { PdfEngine };
