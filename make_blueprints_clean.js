const fs = require('fs');

class CleanPdfWriter {
  constructor() {
    this.pages = [];
  }

  addPage(w = 841.89, h = 595.28) { // A4 Landscape
    const page = new Sheet(w, h);
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
      allObjs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /Font << /F1 ${fontHId} 0 R /F2 ${fontBId} 0 R /F3 ${fontOId} 0 R >> /ProcSet [/PDF /Text /ImageB /ImageC /ImageI] >> /Contents ${contentRef} >>`);
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

class Sheet {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.ops = [];
  }

  escape(s) {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  save() { this.ops.push('q'); return this; }
  restore() { this.ops.push('Q'); return this; }
  lineWidth(w) { this.ops.push(`${w.toFixed(2)} w`); return this; }
  lineCap(c) { this.ops.push(`${c} J`); return this; }
  lineJoin(j) { this.ops.push(`${j} j`); return this; }
  dash(arr = []) {
    if (arr.length === 0) this.ops.push('[] 0 d');
    else this.ops.push(`[${arr.join(' ')}] 0 d`);
    return this;
  }
  strokeColor(r, g, b) { this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`); return this; }
  fillColor(r, g, b) { this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`); return this; }

  line(x1, y1, x2, y2) {
    this.ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }

  rect(x, y, w, h, stroke = true, fill = false) {
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (stroke && fill) this.ops.push('B');
    else if (fill) this.ops.push('f');
    else if (stroke) this.ops.push('S');
    return this;
  }

  polygon(pts, stroke = true, fill = false) {
    if (pts.length < 2) return this;
    this.ops.push(`${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} m`);
    for (let i = 1; i < pts.length; i++) {
      this.ops.push(`${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} l`);
    }
    this.ops.push('h');
    if (stroke && fill) this.ops.push('B');
    else if (fill) this.ops.push('f');
    else if (stroke) this.ops.push('S');
    return this;
  }

  circle(cx, cy, r, stroke = true, fill = false) {
    const k = 0.55228475 * r;
    this.ops.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`);
    this.ops.push(`${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`);
    this.ops.push(`${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`);
    this.ops.push(`${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`);
    this.ops.push(`${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`);
    this.ops.push('h');
    if (stroke && fill) this.ops.push('B');
    else if (fill) this.ops.push('f');
    else if (stroke) this.ops.push('S');
    return this;
  }

  text(str, x, y, size = 10, font = '/F1', align = 'left', rotDeg = 0) {
    this.save();
    const safe = this.escape(str);
    const approxW = str.length * size * 0.55;
    let ox = x;
    if (align === 'center') ox -= approxW / 2;
    else if (align === 'right') ox -= approxW;

    if (rotDeg === 0) {
      this.ops.push(`BT ${font} ${size} Tf ${ox.toFixed(2)} ${y.toFixed(2)} Td (${safe}) Tj ET`);
    } else {
      const rad = (rotDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      let tx = 0, ty = 0;
      if (align === 'center') tx = -approxW / 2;
      else if (align === 'right') tx = -approxW;
      this.ops.push(`BT ${font} ${size} Tf ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${x.toFixed(2)} ${y.toFixed(2)} Tm ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${safe}) Tj ET`);
    }
    this.restore();
    return this;
  }

  // Clear, legible Horizontal Dimension
  dimH(x1, x2, y, label, extStartY = null, tickLen = 4) {
    this.save();
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    this.strokeColor(0.2, 0.2, 0.2).lineWidth(0.7).dash([]);

    // Optional extension lines
    if (extStartY !== null) {
      const dir = y > extStartY ? 1 : -1;
      this.line(x1, extStartY, x1, y + 4 * dir);
      this.line(x2, extStartY, x2, y + 4 * dir);
    }

    // Main line
    this.line(minX, y, maxX, y);

    // Architectural ticks
    this.lineWidth(1.2);
    this.line(x1 - tickLen, y - tickLen, x1 + tickLen, y + tickLen);
    this.line(x2 - tickLen, y - tickLen, x2 + tickLen, y + tickLen);

    // Text with mask
    const midX = (x1 + x2) / 2;
    const textW = label.length * 5.8 + 6;
    this.fillColor(1, 1, 1).rect(midX - textW / 2, y - 5, textW, 11, false, true);
    this.fillColor(0.05, 0.05, 0.05).text(label, midX, y - 3, 9, '/F2', 'center');
    this.restore();
    return this;
  }

  // Clear, legible Vertical Dimension
  dimV(y1, y2, x, label, extStartX = null, tickLen = 4) {
    this.save();
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    this.strokeColor(0.2, 0.2, 0.2).lineWidth(0.7).dash([]);

    // Extension lines
    if (extStartX !== null) {
      const dir = x > extStartX ? 1 : -1;
      this.line(extStartX, y1, x + 4 * dir, y1);
      this.line(extStartX, y2, x + 4 * dir, y2);
    }

    // Main line
    this.line(x, minY, x, maxY);

    // Architectural ticks
    this.lineWidth(1.2);
    this.line(x - tickLen, y1 - tickLen, x + tickLen, y1 + tickLen);
    this.line(x - tickLen, y2 - tickLen, x + tickLen, y2 + tickLen);

    // Text with mask
    const midY = (y1 + y2) / 2;
    const textW = label.length * 5.8 + 6;
    this.fillColor(1, 1, 1).rect(x - 6, midY - textW / 2, 12, textW, false, true);
    this.fillColor(0.05, 0.05, 0.05).text(label, x - 3.2, midY, 9, '/F2', 'center', 90);
    this.restore();
    return this;
  }

  // Level tag (clean)
  levelTag(x, y, label, val) {
    this.save();
    this.strokeColor(0.1, 0.1, 0.1).lineWidth(0.8);
    this.polygon([[x, y], [x - 5, y + 6], [x + 5, y + 6]], true, false);
    this.fillColor(0.1, 0.1, 0.1).polygon([[x, y], [x - 5, y + 6], [x, y + 6]], true, true);
    this.line(x, y + 6, x + 50, y + 6);
    this.fillColor(0.1, 0.1, 0.1).text(label, x + 4, y + 8, 7.5, '/F2');
    this.fillColor(0.3, 0.3, 0.3).text(val, x + 4, y - 1, 7.5, '/F1');
    this.restore();
    return this;
  }

  // Clean, uncluttered Title Block
  drawTitleBlock(sheetNo, totalSheets, code, sheetTitle, scaleStr = '1 : 50') {
    const margin = 25;
    const W = this.w;
    const H = this.h;
    const tbH = 42;

    this.save();
    // Border
    this.strokeColor(0.15, 0.15, 0.15).lineWidth(1.2);
    this.rect(margin, margin, W - 2 * margin, H - 2 * margin, true, false);

    // Title box at bottom
    const bx = margin;
    const by = margin;
    const bw = W - 2 * margin;

    this.fillColor(0.96, 0.97, 0.98).strokeColor(0.2, 0.2, 0.2).lineWidth(1.0);
    this.rect(bx, by, bw, tbH, true, true);

    // Dividers
    this.line(bx + 260, by, bx + 260, by + tbH);
    this.line(bx + bw - 140, by, bx + bw - 140, by + tbH);

    // Box 1: Project info
    this.fillColor(0.1, 0.1, 0.1).text('GALPÓN AVÍCOLA 360 GALLINAS (CLIMA CÁLIDO)', bx + 12, by + 26, 10, '/F2');
    this.fillColor(0.4, 0.4, 0.4).text('Área: 72.00 m² (6.00 x 12.00 m)  |  Densidad: 5 aves/m²', bx + 12, by + 12, 8, '/F1');

    // Box 2: Sheet title
    this.fillColor(0.3, 0.3, 0.3).text('PLANO:', bx + 275, by + 28, 7.5, '/F1');
    this.fillColor(0.0, 0.2, 0.5).text(sheetTitle, bx + 275, by + 14, 11, '/F2');

    // Box 3: Sheet Number & Scale
    this.fillColor(0.1, 0.25, 0.55).rect(bx + bw - 140, by, 140, tbH, true, true);
    this.fillColor(1, 1, 1).text(`LÁMINA ${code}`, bx + bw - 70, by + 24, 11, '/F2', 'center');
    this.fillColor(0.85, 0.9, 0.95).text(`${sheetNo} de ${totalSheets}  |  Escala: ${scaleStr}`, bx + bw - 70, by + 10, 8, '/F1', 'center');

    this.restore();
    return this;
  }

  getStream() {
    return this.ops.join('\n');
  }
}

// Generate the simplified, clean blueprints
function buildCleanBlueprints() {
  const engine = new CleanPdfWriter();

  // =========================================================================
  // LÁMINA 1: PLANTA GENERAL (ARQ-01) - ONE CLEAN VIEW
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawTitleBlock(1, 4, 'ARQ-01', 'PLANTA ARQUITECTÓNICA Y DE TECHOS', '1 : 50');

    // Drawing origin and scale:
    // Galpón: 12.00 m long x 6.00 m wide.
    // Scale: 42 pt per meter.
    // 12m -> 504 pt, 6m -> 252 pt.
    // Center in sheet: W=842, margin=25, titleBlock=42 bottom. Available H: 595 - 67 = 528.
    const sc = 42;
    const ox = (842 - 12 * sc) / 2; // 169
    const oy = 67 + (528 - 6 * sc) / 2; // ~205

    const gL = 12 * sc; // 504 pt
    const gW = 6 * sc;  // 252 pt
    const eLat = 1.20 * sc; // 50.4 pt (Alerón lateral)
    const eGable = 0.60 * sc; // 25.2 pt (Alerón culata)

    // 1. Sidewalk (Andén de concreto 0.60 m)
    const andW = 0.60 * sc;
    p.save();
    p.fillColor(0.95, 0.95, 0.95).strokeColor(0.7, 0.7, 0.7).lineWidth(0.8);
    p.rect(ox - andW, oy - andW, gL + 2 * andW, gW + 2 * andW, true, true);
    p.fillColor(0.4, 0.4, 0.4).text('Andén perimetral de concreto (0.60 m)', ox + gL / 2, oy - andW - 10, 8, '/F1', 'center');
    p.restore();

    // 2. Concrete slab (72 m2)
    p.save();
    p.fillColor(1, 1, 1).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
    p.rect(ox, oy, gL, gW, true, true);
    p.restore();

    // 3. Projected Roof Overhangs (Línea de cubierta con aleros)
    p.save();
    p.strokeColor(0.8, 0.2, 0.1).lineWidth(1.2).dash([6, 3]);
    p.rect(ox - eGable, oy - eLat, gL + 2 * eGable, gW + 2 * eLat, true, false);
    // Eave annotations
    p.fillColor(0.8, 0.2, 0.1);
    p.text('ALERÓN LATERAL: 1.20 m (VOLADIZO)', ox + gL / 2, oy + gW + eLat + 5, 8.5, '/F2', 'center');
    p.text('ALERÓN LATERAL: 1.20 m (VOLADIZO)', ox + gL / 2, oy - eLat - 14, 8.5, '/F2', 'center');
    p.text('ALERÓN: 0.60 m', ox - eGable - 5, oy + gW / 2, 8, '/F2', 'center', 90);
    p.text('ALERÓN: 0.60 m', ox + gL + eGable + 12, oy + gW / 2, 8, '/F2', 'center', 90);
    p.restore();

    // 4. Central Ridge Vent Line (Eje Caballete alzado)
    p.save();
    p.strokeColor(0.1, 0.35, 0.75).lineWidth(1.0).dash([8, 3, 2, 3]);
    p.line(ox - eGable, oy + gW / 2, ox + gL + eGable, oy + gW / 2);
    p.fillColor(0.1, 0.35, 0.75).text('EJE CABALLETE ALZADO / SALIDA DE AIRE (30 cm)', ox + gL / 2, oy + gW / 2 + 5, 8, '/F2', 'center');
    p.restore();

    // 5. Dwarf Block Wall (Pared de bloques de 40 cm)
    const wallThk = 8; // visual thickness
    p.save();
    p.fillColor(0.85, 0.85, 0.88).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
    // Top & Bottom walls
    p.rect(ox, oy + gW - wallThk, gL, wallThk, true, true);
    p.rect(ox, oy, gL, wallThk, true, true);
    // Front wall with 1.0m door
    const doorW = 1.0 * sc; // 42 pt
    const doorY = oy + (gW - doorW) / 2;
    p.rect(ox, oy, wallThk, doorY - oy, true, true);
    p.rect(ox, doorY + doorW, wallThk, oy + gW - (doorY + doorW), true, true);
    // Rear wall with 1.0m door
    p.rect(ox + gL - wallThk, oy, wallThk, doorY - oy, true, true);
    p.rect(ox + gL - wallThk, doorY + doorW, wallThk, oy + gW - (doorY + doorW), true, true);

    // Door swings
    p.strokeColor(0.1, 0.5, 0.2).lineWidth(1.0);
    p.line(ox, doorY, ox - doorW, doorY);
    p.dash([2, 2]).circle(ox, doorY, doorW, true, false);
    p.fillColor(0.1, 0.5, 0.2).text('Puerta Principal (1.00 m)', ox - 10, doorY + doorW + 5, 8, '/F2', 'right');

    p.line(ox + gL, doorY, ox + gL + doorW, doorY);
    p.dash([2, 2]).circle(ox + gL, doorY, doorW, true, false);
    p.fillColor(0.1, 0.5, 0.2).text('Puerta Servicio (1.00 m)', ox + gL + 10, doorY + doorW + 5, 8, '/F2', 'left');
    p.restore();

    // 6. Structural Columns (10 columns at grid intersections)
    p.save();
    p.fillColor(0.15, 0.15, 0.15);
    const colSz = 9;
    for (let i = 0; i < 5; i++) {
      const cx = ox + i * 3.0 * sc;
      p.rect(cx - colSz / 2, oy + gW - colSz / 2, colSz, colSz, false, true);
      p.rect(cx - colSz / 2, oy - colSz / 2, colSz, colSz, false, true);
    }
    p.restore();

    // 7. Grid Axes & Bubbles
    p.save();
    p.strokeColor(0.5, 0.5, 0.5).lineWidth(0.5).dash([6, 2, 1, 2]);
    const axisLabels = ['1', '2', '3', '4', '5'];
    for (let i = 0; i < 5; i++) {
      const cx = ox + i * 3.0 * sc;
      p.line(cx, oy - andW - 22, cx, oy + gW + andW + 22);
      // Top bubble
      p.circle(cx, oy + gW + andW + 32, 9, true, true);
      p.fillColor(0.1, 0.1, 0.1).text(axisLabels[i], cx, oy + gW + andW + 29, 9, '/F2', 'center');
      // Bottom bubble
      p.circle(cx, oy - andW - 32, 9, true, true);
      p.fillColor(0.1, 0.1, 0.1).text(axisLabels[i], cx, oy - andW - 35, 9, '/F2', 'center');
    }
    // Transverse axes A and B
    p.line(ox - andW - 22, oy, ox + gL + andW + 22, oy);
    p.circle(ox - andW - 32, oy, 9, true, true);
    p.fillColor(0.1, 0.1, 0.1).text('B', ox - andW - 32, oy - 3, 9, '/F2', 'center');

    p.line(ox - andW - 22, oy + gW, ox + gL + andW + 22, oy + gW);
    p.circle(ox - andW - 32, oy + gW, 9, true, true);
    p.fillColor(0.1, 0.1, 0.1).text('A', ox - andW - 32, oy + gW - 3, 9, '/F2', 'center');
    p.restore();

    // 8. Clean Internal Zoning & Floor Slope (No visual noise)
    p.save();
    // Central Aisle (1.20m)
    p.strokeColor(0.6, 0.7, 0.6).lineWidth(0.8).dash([4, 2]).fillColor(0.97, 0.99, 0.97);
    p.rect(ox + wallThk + 5, oy + 2.4 * sc, gL - 2 * wallThk - 10, 1.2 * sc, true, true);
    p.fillColor(0.2, 0.45, 0.2).text('PASILLO CENTRAL DE MANEJO (1.20 m)', ox + gL / 2, oy + gW / 2 - 3, 8.5, '/F2', 'center');

    // Clean zones for poultry
    p.fillColor(0.3, 0.35, 0.4);
    p.text('ZONA DE ALIMENTACIÓN Y NIDOS', ox + gL / 2, oy + 4.6 * sc, 8, '/F1', 'center');
    p.text('ZONA DE BEBEDEROS Y PERCHAS', ox + gL / 2, oy + 1.2 * sc, 8, '/F1', 'center');

    // Floor Slope Arrow
    p.strokeColor(0.2, 0.4, 0.7).lineWidth(1.0).dash([]);
    p.line(ox + 80, oy + gW / 2 + 15, ox + 80, oy + gW - 20);
    p.polygon([[ox + 80, oy + gW - 15], [ox + 77, oy + gW - 22], [ox + 83, oy + gW - 22]], true, true);
    p.fillColor(0.1, 0.3, 0.6).text('PENDIENTE 1.0%', ox + 95, oy + gW - 35, 8, '/F2');
    p.restore();

    // 9. Clear, Uncrowded Dimensions (Horizontal & Vertical)
    // Horizontal bay-to-bay
    const dimY1 = oy - andW - 16;
    for (let i = 0; i < 4; i++) {
      p.dimH(ox + i * 3 * sc, ox + (i + 1) * 3 * sc, dimY1, '3.00 m', oy);
    }
    // Total Galpón Length (12.00 m)
    p.dimH(ox, ox + gL, dimY1 - 20, '12.00 m (LARGO GALPÓN)', oy);
    // Total Roof Length (13.20 m)
    p.dimH(ox - eGable, ox + gL + eGable, dimY1 - 40, '13.20 m (LARGO TOTAL CUBIERTA)', oy - eLat);

    // Vertical Galpón Width (6.00 m)
    const dimX1 = ox - andW - 16;
    p.dimV(oy, oy + gW, dimX1, '6.00 m (ANCHO GALPÓN)', ox);
    // Total Roof Width (8.40 m)
    p.dimV(oy - eLat, oy + gW + eLat, dimX1 - 22, '8.40 m (ANCHO TOTAL CUBIERTA)', ox - eGable);

    // Orientation Indicator (Este - Oeste)
    p.save();
    const compX = 740;
    const compY = 500;
    p.strokeColor(0.2, 0.2, 0.2).lineWidth(1.0);
    p.circle(compX, compY, 20, true, false);
    // North pointer
    p.fillColor(0.1, 0.1, 0.1).polygon([[compX, compY], [compX - 4, compY], [compX, compY + 18]], true, true);
    p.line(compX - 25, compY, compX + 25, compY);
    p.text('N', compX, compY + 22, 9, '/F2', 'center');
    p.fillColor(0.8, 0.2, 0.1).text('E', compX + 30, compY - 3, 9, '/F2', 'left');
    p.text('O', compX - 30, compY - 3, 9, '/F2', 'right');
    p.fillColor(0.1, 0.2, 0.4).text('ORIENTACIÓN:', compX, compY - 28, 7.5, '/F2', 'center');
    p.text('ESTE A OESTE', compX, compY - 38, 8, '/F2', 'center');
    p.restore();
  }

  // =========================================================================
  // LÁMINA 2: CORTE TRANSVERSAL A-A' (ARQ-02) - FULL SHEET DEDICATED VIEW
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawTitleBlock(2, 4, 'ARQ-02', 'CORTE TRANSVERSAL A-A\' (SECCIÓN BIOCLIMÁTICA)', '1 : 25');

    // Center one large, high-impact architectural cross-section
    // Galpón width = 6.00 m, Roof width = 8.40 m.
    // Scale: 55 pt per meter!
    // 6.00 m = 330 pt, 8.40 m = 462 pt.
    // Height: 4.00 m = 220 pt (total height with floor ~240 pt).
    const sc = 52;
    const secX = (842 - 6 * sc) / 2; // 265
    const secY = 175; // NTN ground level

    const gW = 6.0 * sc; // 312 pt
    const oH = 1.20 * sc; // 62.4 pt
    const flrH = 0.20 * sc; // 10.4 pt (Elevación 20 cm)
    const blkH = 0.40 * sc; // 20.8 pt (Pared bloques 40 cm)
    const eavH = 3.00 * sc; // 156 pt (Pared lateral 3.00 m)
    const lowRidgeH = 3.70 * sc; // 192.4 pt (Caballete bajo 3.70 m)
    const highRidgeH = 4.00 * sc; // 208 pt (Caballete alto 4.00 m)
    const ventGap = 0.30 * sc; // 15.6 pt (Abertura 30 cm)
    const overlapW = 0.40 * sc; // 20.8 pt (Traslape 40 cm)

    const midX = secX + gW / 2;
    const eaveY = secY + flrH + eavH;
    const lowRidgeY = secY + flrH + lowRidgeH;
    const highRidgeY = secY + flrH + highRidgeH;

    // 1. Natural Ground Line (NTN +-0.00)
    p.save();
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.5);
    p.line(secX - oH - 45, secY, secX + gW + oH + 45, secY);
    p.levelTag(secX - oH - 40, secY, 'N.T.N.', '±0.00 m');
    p.restore();

    // 2. Concrete Base & Sidewalks (+0.20 m)
    p.save();
    const andW = 0.60 * sc;
    p.fillColor(0.92, 0.92, 0.94).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
    // Platform
    p.rect(secX, secY, gW, flrH, true, true);
    // Sidewalk slopes
    p.polygon([[secX - andW, secY], [secX, secY + flrH], [secX, secY]], true, true);
    p.polygon([[secX + gW + andW, secY], [secX + gW, secY + flrH], [secX + gW, secY]], true, true);
    p.levelTag(secX - oH - 40, secY + flrH, 'N.P.T.', '+0.20 m');

    // Floor slope label (1.0%)
    p.fillColor(0.1, 0.25, 0.55).text('PENDIENTE PISO: 1.0% (1 cm/m)', midX, secY + flrH + 4, 8, '/F2', 'center');
    p.restore();

    // 3. Dwarf Block Wall (0.40 m)
    const wallThk = 10;
    p.save();
    p.fillColor(0.8, 0.82, 0.85).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
    p.rect(secX, secY + flrH, wallThk, blkH, true, true);
    p.rect(secX + gW - wallThk, secY + flrH, wallThk, blkH, true, true);
    p.fillColor(0.1, 0.1, 0.1).text('Pared bloques (0.40 m)', secX - 8, secY + flrH + blkH / 2 - 3, 7.5, '/F2', 'right');
    p.text('Pared bloques (0.40 m)', secX + gW + 8, secY + flrH + blkH / 2 - 3, 7.5, '/F2', 'left');
    p.restore();

    // 4. Columns & Wire Mesh (2.60 m free mesh up to 3.00 m)
    p.save();
    // Columns
    p.strokeColor(0.1, 0.1, 0.1).lineWidth(2.0);
    p.line(secX + wallThk / 2, secY + flrH + blkH, secX + wallThk / 2, eaveY);
    p.line(secX + gW - wallThk / 2, secY + flrH + blkH, secX + gW - wallThk / 2, eaveY);
    // Mesh symbol
    p.strokeColor(0.35, 0.5, 0.65).lineWidth(0.6).dash([3, 2]);
    p.line(secX + wallThk / 2, secY + flrH + blkH, secX + wallThk / 2, eaveY);
    p.line(secX + gW - wallThk / 2, secY + flrH + blkH, secX + gW - wallThk / 2, eaveY);
    p.fillColor(0.2, 0.4, 0.6).text('Malla galvanizada (2.60 m)', secX + 15, secY + flrH + blkH + 60, 8, '/F2');
    p.restore();

    // 5. Roof Truss & Slopes
    p.save();
    // Horizontal tie beam at eave level
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.2);
    p.line(secX, eaveY, secX + gW, eaveY);

    // Main roof slope lines (leaving gap in center for air exit)
    const gapHalf = 0.35 * sc; // ~18 pt
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(2.5);
    // Left roof sheet (including 1.20m overhang)
    const leftEaveY = eaveY - (oH * (lowRidgeH - eavH)) / (gW / 2);
    p.line(secX - oH, leftEaveY, midX - gapHalf, lowRidgeY);
    // Right roof sheet
    p.line(secX + gW + oH, leftEaveY, midX + gapHalf, lowRidgeY);

    // Truss diagonal webs
    p.strokeColor(0.4, 0.45, 0.5).lineWidth(0.8);
    const q1 = secX + gW * 0.25;
    const q3 = secX + gW * 0.75;
    p.line(secX, eaveY, q1, eaveY + (lowRidgeY - eaveY) * 0.5);
    p.line(q1, eaveY, q1, eaveY + (lowRidgeY - eaveY) * 0.5);
    p.line(q1, eaveY, midX, lowRidgeY - 15);
    p.line(midX, eaveY, midX, lowRidgeY - 15);
    p.line(midX, lowRidgeY - 15, q3, eaveY);
    p.line(q3, eaveY, q3, eaveY + (lowRidgeY - eaveY) * 0.5);
    p.line(q3, eaveY + (lowRidgeY - eaveY) * 0.5, secX + gW, eaveY);
    p.restore();

    // 6. Raised Ridge Cap (Caballete Alzado con Salida de Aire 30 cm y Traslape 40 cm)
    p.save();
    // Vertical supports
    p.strokeColor(0.2, 0.2, 0.2).lineWidth(1.5);
    p.line(midX - gapHalf, lowRidgeY, midX - gapHalf, highRidgeY - 5);
    p.line(midX + gapHalf, lowRidgeY, midX + gapHalf, highRidgeY - 5);

    // Wire mesh in the 30 cm opening
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.0).dash([2, 2]);
    p.line(midX - gapHalf, lowRidgeY, midX - gapHalf, highRidgeY);
    p.line(midX + gapHalf, lowRidgeY, midX + gapHalf, highRidgeY);

    // Upper Cap Sheet with 40 cm overlap
    const capHalfW = gapHalf + overlapW;
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(3.0).dash([]);
    p.line(midX - capHalfW, highRidgeY - 6, midX, highRidgeY);
    p.line(midX, highRidgeY, midX + capHalfW, highRidgeY - 6);

    // Callout labels on ridge
    p.fillColor(0.75, 0.2, 0.15).text('CABALLETE ALZADO (PUNTO MÁS ALTO: 4.00 m)', midX, highRidgeY + 14, 9, '/F2', 'center');
    p.fillColor(0.1, 0.55, 0.25).text('Abertura de ventilación: 30 cm', midX + gapHalf + 6, lowRidgeY + 6, 7.5, '/F2');
    p.fillColor(0.1, 0.2, 0.5).text('Traslape: 40 cm', midX - capHalfW - 5, highRidgeY + 2, 7.5, '/F2', 'right');
    p.restore();

    // 7. Clear Dimensions on Section A-A'
    // Horizontal (Top):
    const dimYTop = highRidgeY + 35;
    p.dimH(secX - oH, secX, dimYTop, '1.20 m (ALERÓN)');
    p.dimH(secX, secX + gW, dimYTop, '6.00 m (ANCHO DEL GALPÓN)');
    p.dimH(secX + gW, secX + gW + oH, dimYTop, '1.20 m (ALERÓN)');
    p.dimH(secX - oH, secX + gW + oH, dimYTop + 20, '8.40 m (ANCHO TOTAL CUBIERTA)');

    // Vertical (Right side):
    const dimXR = secX + gW + oH + 30;
    p.dimV(secY, secY + flrH, dimXR, '0.20 m');
    p.dimV(secY + flrH, secY + flrH + blkH, dimXR, '0.40 m');
    p.dimV(secY + flrH, eaveY, dimXR + 22, '3.00 m (ALTURA PARED LATERAL)');
    p.dimV(secY + flrH, lowRidgeY, dimXR + 44, '3.70 m (CABALLETE BAJO)');
    p.dimV(secY + flrH, highRidgeY, dimXR + 66, '4.00 m (PUNTO MÁS ALTO)');
    p.dimV(lowRidgeY, highRidgeY, midX - capHalfW - 25, '30 cm');

    // Level tags on left side
    p.levelTag(secX - oH - 40, eaveY, 'ALERO', '+3.20 m (h=3.00m)');
    p.levelTag(secX - oH - 40, lowRidgeY, 'CUMBRERA BAJA', '+3.90 m (h=3.70m)');
    p.levelTag(secX - oH - 40, highRidgeY, 'CUMBRERA ALTA', '+4.20 m (h=4.00m)');
  }

  // =========================================================================
  // LÁMINA 3: ELEVACIÓN LONGITUDINAL (ARQ-03) - 12.00 M FAÇADE
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawTitleBlock(3, 4, 'ARQ-03', 'ELEVACIÓN LONGITUDINAL (FACHADA LATERAL)', '1 : 50');

    // Scale: 42 pt per meter
    // Length: 12.00 m = 504 pt. Height: 4.00 m = 168 pt.
    const sc = 42;
    const longX = (842 - 12 * sc) / 2; // 169
    const longY = 200;

    const gL = 12 * sc; // 504 pt
    const eGable = 0.60 * sc; // 25.2 pt
    const flrH = 0.20 * sc; // 8.4 pt
    const blkH = 0.40 * sc; // 16.8 pt
    const eavH = 3.00 * sc; // 126 pt
    const lowRdH = 3.70 * sc; // 155.4 pt
    const highRdH = 4.00 * sc; // 168 pt
    const ventH = 0.30 * sc; // 12.6 pt

    // 1. Ground
    p.save();
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.5);
    p.line(longX - eGable - 35, longY, longX + gL + eGable + 35, longY);
    p.levelTag(longX - eGable - 30, longY, 'N.T.N.', '±0.00 m');
    p.restore();

    // 2. Concrete Base (+0.20 m) & Sidewalk
    p.save();
    const andW = 0.60 * sc;
    p.fillColor(0.92, 0.92, 0.94).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
    p.rect(longX, longY, gL, flrH, true, true);
    p.rect(longX - andW, longY, andW, flrH, true, true);
    p.rect(longX + gL, longY, andW, flrH, true, true);
    p.levelTag(longX - eGable - 30, longY + flrH, 'N.P.T.', '+0.20 m');
    p.restore();

    // 3. Continuous Dwarf Block Wall (0.40 m)
    p.save();
    p.fillColor(0.85, 0.86, 0.89).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
    p.rect(longX, longY + flrH, gL, blkH, true, true);
    p.strokeColor(0.6, 0.6, 0.6).lineWidth(0.6).line(longX, longY + flrH + blkH / 2, longX + gL, longY + flrH + blkH / 2);
    p.fillColor(0.1, 0.1, 0.1).text('PARED DE BLOQUES (h = 0.40 m)', longX + gL / 2, longY + flrH + blkH / 2 - 3, 8, '/F2', 'center');
    p.restore();

    // 4. Columns (5 columns at 3.00 m spacing)
    const colW = 10;
    p.save();
    p.fillColor(0.2, 0.2, 0.2).strokeColor(0.1, 0.1, 0.1).lineWidth(1.0);
    for (let i = 0; i < 5; i++) {
      const cx = longX + i * 3.0 * sc;
      p.rect(cx - colW / 2, longY + flrH, colW, eavH, true, true);
    }
    p.restore();

    // 5. Wire Mesh (2.60 m height)
    p.save();
    p.strokeColor(0.4, 0.55, 0.7).lineWidth(0.5).dash([3, 2]);
    for (let i = 0; i < 4; i++) {
      const cx1 = longX + i * 3.0 * sc + colW / 2;
      const bayW = 3.0 * sc - colW;
      p.rect(cx1, longY + flrH + blkH, bayW, eavH - blkH, false, false);
    }
    p.fillColor(0.2, 0.4, 0.6).text('CERRAMIENTO TOTAL DE MALLA GALVANIZADA (h libre = 2.60 m)', longX + gL / 2, longY + flrH + blkH + 45, 9, '/F2', 'center');
    p.restore();

    // 6. Eave Profile & Continuous Overhang
    p.save();
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(3.0).dash([]);
    p.line(longX - eGable, longY + flrH + eavH, longX + gL + eGable, longY + flrH + eavH);
    p.fillColor(0.75, 0.2, 0.15);
    p.text('ALERÓN FRONTAL: 0.60 m', longX - eGable - 5, longY + flrH + eavH + 12, 8, '/F2', 'right');
    p.text('ALERÓN TRASERO: 0.60 m', longX + gL + eGable + 5, longY + flrH + eavH + 12, 8, '/F2', 'left');
    p.restore();

    // 7. Continuous Ridge Monitor (Linternilla continua de 12.00 m)
    p.save();
    // Lower ridge background line
    p.strokeColor(0.5, 0.5, 0.5).lineWidth(0.8).dash([4, 2]);
    p.line(longX - eGable, longY + flrH + lowRdH, longX + gL + eGable, longY + flrH + lowRdH);

    // Continuous 30 cm opening with wire mesh
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(0.8).dash([2, 1]);
    p.rect(longX - eGable, longY + flrH + lowRdH, gL + 2 * eGable, ventH, false, false);

    // Top ridge cap continuous line
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(3.0).dash([]);
    p.line(longX - eGable - 4, longY + flrH + highRdH, longX + gL + eGable + 4, longY + flrH + highRdH);

    p.fillColor(0.75, 0.2, 0.15).text('CABALLETE ALZADO CONTINUO (PUNTO MÁS ALTO: 4.00 m)', longX + gL / 2, longY + flrH + highRdH + 10, 9, '/F2', 'center');
    p.fillColor(0.1, 0.55, 0.25).text('Salida vertical de aire: 30 cm continuo con malla anti-aves', longX + gL / 2, longY + flrH + lowRdH + 3, 7.5, '/F2', 'center');
    p.restore();

    // 8. Dimensions on Elevation
    // Top Horizontal
    const dimYTop = longY + flrH + highRdH + 30;
    for (let i = 0; i < 4; i++) {
      p.dimH(longX + i * 3 * sc, longX + (i + 1) * 3 * sc, dimYTop, '3.00 m');
    }
    p.dimH(longX, longX + gL, dimYTop + 18, '12.00 m (LARGO TOTAL GALPÓN)');
    p.dimH(longX - eGable, longX + gL + eGable, dimYTop + 36, '13.20 m (LARGO TOTAL CUBIERTA CON ALEROS)');

    // Vertical on Right
    const dimXR = longX + gL + eGable + 30;
    p.dimV(longY, longY + flrH, dimXR, '0.20 m');
    p.dimV(longY + flrH, longY + flrH + blkH, dimXR, '0.40 m');
    p.dimV(longY + flrH, longY + flrH + eavH, dimXR + 20, '3.00 m (PARED LATERAL)');
    p.dimV(longY + flrH, longY + flrH + highRdH, dimXR + 44, '4.00 m (CUMBRERA)');

    // Grid Axis Bubbles below
    const axisLabels = ['1', '2', '3', '4', '5'];
    for (let i = 0; i < 5; i++) {
      const cx = longX + i * 3.0 * sc;
      p.circle(cx, longY - 25, 9, true, true);
      p.fillColor(0.1, 0.1, 0.1).text(axisLabels[i], cx, longY - 28, 9, '/F2', 'center');
    }
  }

  // =========================================================================
  // LÁMINA 4: DETALLES CONSTRUCTIVOS CLAVE (DET-01) - 2 DETALLES AMPLIOS
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawTitleBlock(4, 4, 'DET-01', 'DETALLES CONSTRUCTIVOS PRINCIPALES', '1 : 15');

    // Divide into 2 clean, spacious sections:
    // Left: DETALLE 1 - CABALLETE ALZADO (LINTERNILLA)
    // Right: DETALLE 2 - MURO DE BLOQUES, PISO Y ELEVACIÓN

    // -------------------------------------------------------------
    // DETALLE 1: CABALLETE ALZADO (Scale 1:15)
    // -------------------------------------------------------------
    {
      const d1X = 50;
      const d1Y = 85;
      const d1W = 350;
      const d1H = 420;

      p.save();
      p.fillColor(0.99, 0.99, 1.0).strokeColor(0.7, 0.75, 0.8).lineWidth(1.0);
      p.rect(d1X, d1Y, d1W, d1H, true, true);

      // Title
      p.fillColor(0.05, 0.2, 0.5).text('DETALLE 1: CABALLETE ALZADO / LINTERNILLA', d1X + 16, d1Y + d1H - 25, 11, '/F2');
      p.fillColor(0.4, 0.4, 0.4).text('Detalle de Abertura (30 cm) y Traslape (40 cm)', d1X + 16, d1Y + d1H - 40, 8.5, '/F1');

      const cx = d1X + d1W / 2;
      const cy = d1Y + 180;

      // Lower roof slopes
      p.strokeColor(0.75, 0.2, 0.15).lineWidth(4.0);
      p.line(cx - 150, cy - 35, cx - 45, cy);
      p.line(cx + 150, cy - 35, cx + 45, cy);
      p.fillColor(0.3, 0.3, 0.3).text('Pendiente cubierta', cx - 120, cy - 15, 8, '/F1');
      p.text('Pendiente cubierta', cx + 70, cy - 15, 8, '/F1');

      // Vertical posts
      p.strokeColor(0.15, 0.15, 0.15).lineWidth(2.5);
      p.line(cx - 45, cy, cx - 45, cy + 70);
      p.line(cx + 45, cy, cx + 45, cy + 70);

      // Wire mesh in the 30 cm opening
      p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.5).dash([4, 2]);
      p.line(cx - 45, cy, cx - 45, cy + 70);
      p.line(cx + 45, cy, cx + 45, cy + 70);

      // Upper ridge cap with 40 cm overlap
      // Overlap extends 60 pt beyond posts
      p.strokeColor(0.75, 0.2, 0.15).lineWidth(4.5).dash([]);
      p.line(cx - 105, cy + 62, cx, cy + 78);
      p.line(cx, cy + 78, cx + 105, cy + 62);

      // Clear Dimensions for Detail 1
      p.dimV(cy, cy + 70, cx - 58, '30 cm');
      p.dimH(cx - 105, cx - 45, cy + 90, '40 cm');
      p.dimH(cx + 45, cx + 105, cy + 90, '40 cm');

      p.fillColor(0.1, 0.55, 0.25).text('ABERTURA VERTICAL DE 30 cm', cx - 65, cy + 32, 8.5, '/F2', 'right');
      p.text('(Salida continua de calor)', cx - 65, cy + 20, 8, '/F1', 'right');

      p.fillColor(0.75, 0.2, 0.15).text('TRASLAPE: 40 cm', cx - 75, cy + 102, 8.5, '/F2', 'center');
      p.text('TRASLAPE: 40 cm', cx + 75, cy + 102, 8.5, '/F2', 'center');

      // Air flow arrows
      p.strokeColor(0.85, 0.25, 0.1).lineWidth(1.5);
      p.line(cx - 20, cy - 15, cx - 25, cy + 40);
      p.polygon([[cx - 28, cy + 46], [cx - 31, cy + 37], [cx - 23, cy + 38]], true, true);
      p.line(cx + 20, cy - 15, cx + 25, cy + 40);
      p.polygon([[cx + 28, cy + 46], [cx + 31, cy + 37], [cx + 23, cy + 38]], true, true);
      p.fillColor(0.85, 0.25, 0.1).text('Salida de aire caliente', cx, cy - 25, 8.5, '/F2', 'center');

      // Specifications list
      p.fillColor(0.15, 0.15, 0.15);
      p.text('NOTAS TÉCNICAS:', d1X + 20, d1Y + 65, 8.5, '/F2');
      p.text('• Malla pajarera galvanizada de 1/2" en toda la abertura.', d1X + 20, d1Y + 50, 8, '/F1');
      p.text('• El traslape de 40 cm evita el ingreso de lluvia con viento oblicuo.', d1X + 20, d1Y + 36, 8, '/F1');
      p.text('• Permite la evacuación natural del aire caliente por termosifón.', d1X + 20, d1Y + 22, 8, '/F1');
      p.restore();
    }

    // -------------------------------------------------------------
    // DETALLE 2: PARED DE BLOQUES Y PISO ELEVADO (Scale 1:15)
    // -------------------------------------------------------------
    {
      const d2X = 430;
      const d2Y = 85;
      const d2W = 360;
      const d2H = 420;

      p.save();
      p.fillColor(0.99, 0.99, 1.0).strokeColor(0.7, 0.75, 0.8).lineWidth(1.0);
      p.rect(d2X, d2Y, d2W, d2H, true, true);

      // Title
      p.fillColor(0.05, 0.2, 0.5).text('DETALLE 2: PARED DE BLOQUES Y PISO ELEVADO', d2X + 16, d2Y + d2H - 25, 11, '/F2');
      p.fillColor(0.4, 0.4, 0.4).text('Detalle de Muro (40 cm), Sobre-elevación (+0.20 m) y Andén', d2X + 16, d2Y + d2H - 40, 8.5, '/F1');

      const bx = d2X + 130;
      const by = d2Y + 140;

      // Ground NTN
      p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.5);
      p.line(d2X + 15, by, d2X + d2W - 15, by);
      p.levelTag(d2X + 25, by, 'N.T.N.', '±0.00 m (Suelo exterior)');

      // Raised compact fill (20 cm)
      p.fillColor(0.92, 0.92, 0.94).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
      p.rect(bx, by, 190, 35, true, true);
      p.levelTag(bx + 100, by + 35, 'N.P.T.', '+0.20 m (Piso galpón)');

      // Concrete sidewalk (Andén de 60 cm)
      p.polygon([[bx - 70, by], [bx, by + 35], [bx, by]], true, true);
      p.fillColor(0.2, 0.2, 0.2).text('Andén sanitario (60 cm)', bx - 65, by + 18, 7.5, '/F2');

      // Block wall (40 cm) = 2 courses of 20cm blocks
      p.fillColor(0.8, 0.82, 0.86).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
      p.rect(bx, by + 35, 30, 35, true, true); // Hilada 1
      p.rect(bx, by + 70, 30, 35, true, true); // Hilada 2

      // Concrete tie beam (Solera)
      p.fillColor(0.72, 0.75, 0.8);
      p.rect(bx, by + 105, 30, 20, true, true);
      p.fillColor(0.1, 0.1, 0.1).text('Viga solera (15x15 cm)', bx + 36, by + 110, 8, '/F2');

      // Wire mesh post
      p.strokeColor(0.1, 0.1, 0.1).lineWidth(2.5);
      p.line(bx + 15, by + 105, bx + 15, by + 190);
      p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.5).dash([3, 2]);
      p.line(bx + 15, by + 125, bx + 15, by + 190);
      p.fillColor(0.1, 0.6, 0.3).text('Malla galvanizada hacia alero (2.60 m)', bx + 22, by + 160, 8, '/F2');

      // Clear Dimensions for Detail 2
      p.dimV(by, by + 35, bx - 15, '20 cm');
      p.dimV(by + 35, by + 105, bx - 15, '40 cm');
      p.dimH(bx - 70, bx, by - 12, '60 cm');

      p.fillColor(0.1, 0.1, 0.1);
      p.text('ELEVACIÓN: 20 cm', bx - 22, by + 15, 8, '/F2', 'right');
      p.text('PARED BLOQUES: 40 cm', bx - 22, by + 68, 8, '/F2', 'right');

      // Technical notes
      p.fillColor(0.15, 0.15, 0.15);
      p.text('NOTAS TÉCNICAS:', d2X + 20, d2Y + 65, 8.5, '/F2');
      p.text('• Piso elevado 20 cm sobre el suelo exterior para evitar anegamientos.', d2X + 20, d2Y + 50, 8, '/F1');
      p.text('• Pared de 40 cm de bloque permite libre paso de brisa al nivel del ave.', d2X + 20, d2Y + 36, 8, '/F1');
      p.text('• Andén de 60 cm protege contra roedores y erosión de lluvia.', d2X + 20, d2Y + 22, 8, '/F1');

      p.restore();
    }
  }

  // Write file
  const pdfBytes = engine.build();
  const outPath = 'C:/Users/luisd/.gemini/antigravity/scratch/galpon-avicola/Planos_Galpon_360_Gallinas_Clima_Calido.pdf';
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Successfully generated simplified clean blueprints PDF at:', outPath);
  console.log('File size:', pdfBytes.length, 'bytes');
  return outPath;
}

buildCleanBlueprints();
