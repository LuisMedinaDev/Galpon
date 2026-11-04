const fs = require('fs');

class MinimalPdfWriter {
  constructor() {
    this.pages = [];
  }

  addPage(w = 841.89, h = 595.28) {
    const page = new CleanSheet(w, h);
    this.pages.push(page);
    return page;
  }

  build() {
    const fontHelvetica = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    const fontBold = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    const allObjs = [];
    const numPages = this.pages.length;
    const fontHId = 3;
    const fontBId = 4;
    const firstPageObjId = 5;
    const firstContentObjId = firstPageObjId + numPages;

    allObjs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    const kidsStr = this.pages.map((_, i) => `${firstPageObjId + i} 0 R`).join(' ');
    allObjs.push(`<< /Type /Pages /Kids [${kidsStr}] /Count ${numPages} >>`);
    allObjs.push(fontHelvetica);
    allObjs.push(fontBold);

    this.pages.forEach((p, i) => {
      const contentRef = `${firstContentObjId + i} 0 R`;
      allObjs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Resources << /Font << /F1 ${fontHId} 0 R /F2 ${fontBId} 0 R >> /ProcSet [/PDF /Text /ImageB /ImageC /ImageI] >> /Contents ${contentRef} >>`);
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

class CleanSheet {
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

  // Pure numeric horizontal dimension line
  dimH(x1, x2, y, val, extStartY = null, tickLen = 4) {
    this.save();
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    this.strokeColor(0.2, 0.2, 0.2).lineWidth(0.8).dash([]);

    if (extStartY !== null) {
      const dir = y > extStartY ? 1 : -1;
      this.line(x1, extStartY, x1, y + 4 * dir);
      this.line(x2, extStartY, x2, y + 4 * dir);
    }

    this.line(minX, y, maxX, y);

    // Architectural ticks
    this.lineWidth(1.2);
    this.line(x1 - tickLen, y - tickLen, x1 + tickLen, y + tickLen);
    this.line(x2 - tickLen, y - tickLen, x2 + tickLen, y + tickLen);

    // Text (number only)
    const midX = (x1 + x2) / 2;
    const str = String(val);
    const textW = str.length * 7.0 + 6;
    this.fillColor(1, 1, 1).rect(midX - textW / 2, y - 5, textW, 11, false, true);
    this.fillColor(0, 0, 0).text(str, midX, y - 3.5, 9.5, '/F2', 'center');
    this.restore();
    return this;
  }

  // Pure numeric vertical dimension line
  dimV(y1, y2, x, val, extStartX = null, tickLen = 4) {
    this.save();
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    this.strokeColor(0.2, 0.2, 0.2).lineWidth(0.8).dash([]);

    if (extStartX !== null) {
      const dir = x > extStartX ? 1 : -1;
      this.line(extStartX, y1, x + 4 * dir, y1);
      this.line(extStartX, y2, x + 4 * dir, y2);
    }

    this.line(x, minY, x, maxY);

    // Architectural ticks
    this.lineWidth(1.2);
    this.line(x - tickLen, y1 - tickLen, x + tickLen, y1 + tickLen);
    this.line(x - tickLen, y2 - tickLen, x + tickLen, y2 + tickLen);

    // Text (number only)
    const midY = (y1 + y2) / 2;
    const str = String(val);
    const textW = str.length * 7.0 + 6;
    this.fillColor(1, 1, 1).rect(x - 6, midY - textW / 2, 12, textW, false, true);
    this.fillColor(0, 0, 0).text(str, x - 3.5, midY, 9.5, '/F2', 'center', 90);
    this.restore();
    return this;
  }

  level(x, y, val) {
    this.save();
    this.strokeColor(0.1, 0.1, 0.1).lineWidth(0.8);
    this.polygon([[x, y], [x - 5, y + 6], [x + 5, y + 6]], true, false);
    this.fillColor(0.1, 0.1, 0.1).polygon([[x, y], [x - 5, y + 6], [x, y + 6]], true, true);
    this.line(x, y + 6, x + 35, y + 6);
    this.fillColor(0, 0, 0).text(val, x + 3, y + 8, 8, '/F2');
    this.restore();
    return this;
  }

  // Minimal Title Block (Only sheet title and number)
  drawMinimalTitle(sheetNo, totalSheets, code, title) {
    const margin = 25;
    const W = this.w;
    const H = this.h;
    const barH = 32;

    this.save();
    // Outer border
    this.strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
    this.rect(margin, margin, W - 2 * margin, H - 2 * margin, true, false);

    // Bottom strip
    const bx = margin;
    const by = margin;
    const bw = W - 2 * margin;

    this.fillColor(0.96, 0.96, 0.96).strokeColor(0.2, 0.2, 0.2).lineWidth(1.0);
    this.rect(bx, by, bw, barH, true, true);

    // Left: Project
    this.fillColor(0.1, 0.1, 0.1).text('GALPÓN 360 AVES (6.00 x 12.00 m) - TECHO ASIMÉTRICO', bx + 15, by + 11, 10, '/F2');

    // Center: Sheet title
    this.fillColor(0.1, 0.25, 0.6).text(title, bx + bw / 2, by + 11, 12, '/F2', 'center');

    // Right: Sheet No
    this.fillColor(0.1, 0.1, 0.1).text(`${code}  [${sheetNo}/${totalSheets}]`, bx + bw - 15, by + 11, 10, '/F2', 'right');

    this.restore();
    return this;
  }

  getStream() {
    return this.ops.join('\n');
  }
}

function generateAsymmetricPlans() {
  const engine = new MinimalPdfWriter();

  // =========================================================================
  // LÁMINA 1: PLANTA ARQUITECTÓNICA Y TECHOS
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawMinimalTitle(1, 4, 'ARQ-01', 'PLANTA GENERAL');

    // Scale: 42 pt per meter
    const sc = 42;
    const ox = (842 - 12 * sc) / 2; // 169
    const oy = 60 + (535 - 6 * sc) / 2; // 207

    const gL = 12 * sc; // 504 pt (12.00 m)
    const gW = 6 * sc;  // 252 pt (6.00 m)
    const eLat = 1.20 * sc; // 50.4 pt (1.20 m)
    const eGable = 0.60 * sc; // 25.2 pt (0.60 m)

    // 1. Concrete Slab (6.00 x 12.00)
    p.save();
    p.fillColor(0.98, 0.98, 0.98).strokeColor(0.1, 0.1, 0.1).lineWidth(1.5);
    p.rect(ox, oy, gL, gW, true, true);
    p.restore();

    // 2. Block Wall perimeter (0.40m high, 15cm thick)
    const wallThk = 7;
    p.save();
    p.fillColor(0.85, 0.85, 0.85).strokeColor(0.2, 0.2, 0.2).lineWidth(1.0);
    p.rect(ox, oy + gW - wallThk, gL, wallThk, true, true);
    p.rect(ox, oy, gL, wallThk, true, true);
    // Doors: 1.00 m wide
    const doorW = 1.0 * sc;
    const doorY = oy + (gW - doorW) / 2;
    p.rect(ox, oy, wallThk, doorY - oy, true, true);
    p.rect(ox, doorY + doorW, wallThk, oy + gW - (doorY + doorW), true, true);
    p.rect(ox + gL - wallThk, oy, wallThk, doorY - oy, true, true);
    p.rect(ox + gL - wallThk, doorY + doorW, wallThk, oy + gW - (doorY + doorW), true, true);
    // Door swing
    p.strokeColor(0.2, 0.2, 0.2).lineWidth(0.8);
    p.line(ox, doorY, ox - doorW, doorY);
    p.dash([2, 2]).circle(ox, doorY, doorW, true, false);
    p.line(ox + gL, doorY, ox + gL + doorW, doorY);
    p.dash([2, 2]).circle(ox + gL, doorY, doorW, true, false);
    p.restore();

    // 3. Projected Roof Overhangs (Aleros: 1.20 m laterales, 0.60 m culatas)
    p.save();
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(1.2).dash([6, 3]);
    p.rect(ox - eGable, oy - eLat, gL + 2 * eGable, gW + 2 * eLat, true, false);
    p.restore();

    // 4. Asymmetrical Roof Ridge & Overlap (Techo Asimétrico en Planta)
    // Centerline is at oy + gW/2 = oy + 3.00*sc (Top edge of lower roof)
    // Higher roof extends 0.40 m past center towards lower roof: oy + 3.00*sc - 0.40*sc
    const ridgeCenterY = oy + gW / 2; // 3.00 m
    const overlapY = ridgeCenterY - 0.40 * sc; // 2.60 m

    p.save();
    // Ridge edge of lower slope (at 3.00m)
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.0).dash([6, 2]);
    p.line(ox - eGable, ridgeCenterY, ox + gL + eGable, ridgeCenterY);

    // Overlap edge of higher slope (0.40m past center)
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(1.5).dash([]);
    p.line(ox - eGable, overlapY, ox + gL + eGable, overlapY);

    // Shading the 0.40m overlap band
    p.fillColor(0.9, 0.85, 0.85).rect(ox - eGable, overlapY, gL + 2 * eGable, 0.40 * sc, false, true);
    p.restore();

    // 5. Columns at grid points (5 columns x 2 = 10)
    p.save();
    p.fillColor(0.1, 0.1, 0.1);
    const colSz = 8;
    for (let i = 0; i < 5; i++) {
      const cx = ox + i * 3.0 * sc;
      p.rect(cx - colSz / 2, oy + gW - colSz / 2, colSz, colSz, false, true);
      p.rect(cx - colSz / 2, oy - colSz / 2, colSz, colSz, false, true);
    }
    p.restore();

    // 6. Grid Axes (1..5 and A, B)
    p.save();
    p.strokeColor(0.5, 0.5, 0.5).lineWidth(0.5).dash([6, 2, 1, 2]);
    const axisLabels = ['1', '2', '3', '4', '5'];
    for (let i = 0; i < 5; i++) {
      const cx = ox + i * 3.0 * sc;
      p.line(cx, oy - eLat - 18, cx, oy + gW + eLat + 18);
      p.circle(cx, oy + gW + eLat + 28, 9, true, true);
      p.fillColor(0, 0, 0).text(axisLabels[i], cx, oy + gW + eLat + 25, 9, '/F2', 'center');
      p.circle(cx, oy - eLat - 28, 9, true, true);
      p.fillColor(0, 0, 0).text(axisLabels[i], cx, oy - eLat - 31, 9, '/F2', 'center');
    }
    // A & B
    p.line(ox - eGable - 18, oy, ox + gL + eGable + 18, oy);
    p.circle(ox - eGable - 28, oy, 9, true, true);
    p.fillColor(0, 0, 0).text('B', ox - eGable - 28, oy - 3, 9, '/F2', 'center');

    p.line(ox - eGable - 18, oy + gW, ox + gL + eGable + 18, oy + gW);
    p.circle(ox - eGable - 28, oy + gW, 9, true, true);
    p.fillColor(0, 0, 0).text('A', ox - eGable - 28, oy + gW - 3, 9, '/F2', 'center');
    p.restore();

    // 7. Floor slope (1.0%)
    p.save();
    p.strokeColor(0.2, 0.2, 0.2).lineWidth(1.0);
    p.line(ox + 80, oy + gW / 2 + 10, ox + 80, oy + gW - 15);
    p.polygon([[ox + 80, oy + gW - 12], [ox + 77, oy + gW - 18], [ox + 83, oy + gW - 18]], true, true);
    p.fillColor(0, 0, 0).text('1.0%', ox + 92, oy + gW - 30, 9, '/F2');
    p.restore();

    // 8. Clean Dimensions (Pure numbers!)
    // Horizontal bay-to-bay (3.00)
    const dimY1 = oy - eLat - 14;
    for (let i = 0; i < 4; i++) {
      p.dimH(ox + i * 3 * sc, ox + (i + 1) * 3 * sc, dimY1, '3.00', oy);
    }
    // Total galpon length (12.00)
    p.dimH(ox, ox + gL, dimY1 - 18, '12.00', oy);
    // Overhangs front/rear (0.60)
    p.dimH(ox - eGable, ox, dimY1 - 18, '0.60', oy - eLat);
    p.dimH(ox + gL, ox + gL + eGable, dimY1 - 18, '0.60', oy - eLat);
    // Total roof length (13.20)
    p.dimH(ox - eGable, ox + gL + eGable, dimY1 - 36, '13.20', oy - eLat);

    // Vertical dimensions
    const dimX1 = ox - eGable - 14;
    p.dimV(oy, oy + gW, dimX1, '6.00', ox);
    p.dimV(oy - eLat, oy, dimX1, '1.20', ox - eGable);
    p.dimV(oy + gW, oy + gW + eLat, dimX1, '1.20', ox - eGable);
    p.dimV(oy - eLat, oy + gW + eLat, dimX1 - 18, '8.40', ox - eGable);

    // Ridge overlap dimension (0.40) inside
    p.dimV(overlapY, ridgeCenterY, ox + gL - 30, '0.40');

    // Clean Orientation (Este - Oeste)
    p.save();
    const cx = 740, cy = 490;
    p.strokeColor(0.2, 0.2, 0.2).lineWidth(1.0);
    p.circle(cx, cy, 18, true, false);
    p.fillColor(0, 0, 0).polygon([[cx, cy], [cx - 3, cy], [cx, cy + 16]], true, true);
    p.line(cx - 22, cy, cx + 22, cy);
    p.text('N', cx, cy + 20, 8.5, '/F2', 'center');
    p.text('E', cx + 27, cy - 3, 8.5, '/F2', 'left');
    p.text('O', cx - 27, cy - 3, 8.5, '/F2', 'right');
    p.restore();
  }

  // =========================================================================
  // LÁMINA 2: CORTE TRANSVERSAL A-A' - TECHO A DOS AGUAS ASIMÉTRICO (LA CLAVE)
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawMinimalTitle(2, 4, 'ARQ-02', 'CORTE TRANSVERSAL A-A\' (TECHO ASIMÉTRICO)');

    // Scale: 54 pt per meter
    const sc = 54;
    const secX = (842 - 6 * sc) / 2; // 259
    const secY = 160; // NTN Ground

    const gW = 6.0 * sc; // 324 pt (6.00 m)
    const oH = 1.20 * sc; // 64.8 pt (1.20 m)
    const flrH = 0.20 * sc; // 10.8 pt (0.20 m)
    const blkH = 0.40 * sc; // 21.6 pt (0.40 m)
    const eavH = 3.00 * sc; // 162 pt (3.00 m)
    const lowRidgeH = 3.70 * sc; // 199.8 pt (3.70 m)
    const highRidgeH = 4.00 * sc; // 216 pt (4.00 m)
    const overlapW = 0.40 * sc; // 21.6 pt (0.40 m)

    const midX = secX + gW / 2; // Centerline at 3.00 m
    const eaveY = secY + flrH + eavH;
    const lowRidgeY = secY + flrH + lowRidgeH;
    const highRidgeY = secY + flrH + highRidgeH;

    // 1. Ground NTN 0.00
    p.save();
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.5);
    p.line(secX - oH - 45, secY, secX + gW + oH + 45, secY);
    p.level(secX - oH - 40, secY, '±0.00');
    p.restore();

    // 2. Concrete slab & sidewalks (0.20m elevation)
    p.save();
    const andW = 0.60 * sc;
    p.fillColor(0.93, 0.93, 0.93).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
    p.rect(secX, secY, gW, flrH, true, true);
    p.polygon([[secX - andW, secY], [secX, secY + flrH], [secX, secY]], true, true);
    p.polygon([[secX + gW + andW, secY], [secX + gW, secY + flrH], [secX + gW, secY]], true, true);
    p.level(secX - oH - 40, secY + flrH, '+0.20');
    p.restore();

    // 3. Block Wall (0.40 m)
    const wallThk = 10;
    p.save();
    p.fillColor(0.8, 0.82, 0.85).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
    p.rect(secX, secY + flrH, wallThk, blkH, true, true);
    p.rect(secX + gW - wallThk, secY + flrH, wallThk, blkH, true, true);
    p.restore();

    // 4. Columns & Wire Mesh
    p.save();
    p.strokeColor(0.1, 0.1, 0.1).lineWidth(2.0);
    p.line(secX + wallThk / 2, secY + flrH + blkH, secX + wallThk / 2, eaveY);
    p.line(secX + gW - wallThk / 2, secY + flrH + blkH, secX + gW - wallThk / 2, eaveY);
    // Mesh
    p.strokeColor(0.4, 0.55, 0.7).lineWidth(0.5).dash([3, 2]);
    p.line(secX + wallThk / 2, secY + flrH + blkH, secX + wallThk / 2, eaveY);
    p.line(secX + gW - wallThk / 2, secY + flrH + blkH, secX + gW - wallThk / 2, eaveY);
    p.restore();

    // 5. Structural Truss (Horizontal chord at 3.00m)
    p.save();
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.2);
    p.line(secX, eaveY, secX + gW, eaveY);
    // Central king post
    p.line(midX, eaveY, midX, highRidgeY);
    // Truss webs
    const q1 = secX + gW * 0.25;
    const q3 = secX + gW * 0.75;
    p.strokeColor(0.45, 0.45, 0.45).lineWidth(0.8);
    p.line(secX, eaveY, q1, eaveY + (lowRidgeY - eaveY) * 0.5);
    p.line(q1, eaveY, q1, eaveY + (lowRidgeY - eaveY) * 0.5);
    p.line(q1, eaveY, midX, lowRidgeY - 10);
    p.line(midX, lowRidgeY - 10, q3, eaveY);
    p.line(q3, eaveY, q3, eaveY + (highRidgeY - eaveY) * 0.5);
    p.line(q3, eaveY + (highRidgeY - eaveY) * 0.5, secX + gW, eaveY);
    p.restore();

    // 6. ASYMMETRICAL ROOF PLANES (TECHO A DOS AGUAS ASIMÉTRICO / DESFASADO)
    // Left Slope (Vertiente Baja):
    // From left eave (secX - oH) through left wall (secX) to CENTER (midX) at height 3.70m!
    const leftSlope = (lowRidgeH - eavH) / (gW / 2); // rise / run = 0.70 / 3.00
    const leftEaveY = eaveY - oH * leftSlope;

    // Right Slope (Vertiente Alta):
    // From right eave (secX + gW + oH) through right wall (secX + gW) to CENTER at height 4.00m,
    // AND IT OVERLAPS 40 cm PAST THE CENTER TO THE LEFT! (midX - overlapW)
    const rightSlope = (highRidgeH - eavH) / (gW / 2); // rise / run = 1.00 / 3.00
    const rightEaveY = eaveY - oH * rightSlope;
    const overlapTipX = midX - overlapW; // 40 cm to the left of center
    const overlapTipY = highRidgeY - overlapW * rightSlope; // follows the slope down slightly

    p.save();
    // Lower Roof Sheet (Left)
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(3.0);
    p.line(secX - oH, leftEaveY, midX, lowRidgeY);

    // Higher Roof Sheet (Right) - Overlaps over the left roof
    p.strokeColor(0.2, 0.35, 0.65).lineWidth(3.5);
    p.line(secX + gW + oH, rightEaveY, overlapTipX, overlapTipY);

    // Vertical opening between roofs (30 cm) with wire mesh at center
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.5).dash([3, 2]);
    p.line(midX, lowRidgeY, midX, highRidgeY);

    // Support strut between ridges
    p.strokeColor(0.2, 0.2, 0.2).lineWidth(1.5).dash([]);
    p.line(midX, lowRidgeY, midX, highRidgeY);
    p.restore();

    // 7. PURE NUMERIC DIMENSIONS (ZERO VERBOSE TEXT)
    // Horizontal (Top):
    const dimYTop = highRidgeY + 45;
    p.dimH(secX - oH, secX, dimYTop, '1.20');
    p.dimH(secX, secX + gW, dimYTop, '6.00');
    p.dimH(secX + gW, secX + gW + oH, dimYTop, '1.20');
    p.dimH(secX - oH, secX + gW + oH, dimYTop + 20, '8.40');

    // Overlap horizontal dimension (0.40)
    p.dimH(overlapTipX, midX, highRidgeY + 18, '0.40');

    // Vertical gap dimension (0.30)
    p.dimV(lowRidgeY, highRidgeY, midX + 16, '0.30');

    // Vertical Dimensions (Right side):
    const dimXR = secX + gW + oH + 28;
    p.dimV(secY, secY + flrH, dimXR, '0.20');
    p.dimV(secY + flrH, secY + flrH + blkH, dimXR, '0.40');
    p.dimV(secY + flrH, eaveY, dimXR + 20, '3.00');
    p.dimV(secY + flrH, lowRidgeY, dimXR + 40, '3.70');
    p.dimV(secY + flrH, highRidgeY, dimXR + 60, '4.00');

    // Levels on left
    p.level(secX - oH - 40, eaveY, '+3.20');
    p.level(secX - oH - 40, lowRidgeY, '+3.90');
    p.level(secX - oH - 40, highRidgeY, '+4.20');

    // Floor slope
    p.fillColor(0, 0, 0).text('1.0%', midX - 40, secY + flrH + 4, 8.5, '/F2');
  }

  // =========================================================================
  // LÁMINA 3: ELEVACIÓN LONGITUDINAL (12.00 M)
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawMinimalTitle(3, 4, 'ARQ-03', 'FACHADA LATERAL');

    // Scale: 42 pt per meter
    const sc = 42;
    const longX = (842 - 12 * sc) / 2; // 169
    const longY = 190;

    const gL = 12 * sc; // 504 pt (12.00 m)
    const eGable = 0.60 * sc; // 25.2 pt (0.60 m)
    const flrH = 0.20 * sc;
    const blkH = 0.40 * sc;
    const eavH = 3.00 * sc;
    const highRdH = 4.00 * sc;
    const lowRdH = 3.70 * sc;

    // Ground
    p.save();
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.5);
    p.line(longX - eGable - 35, longY, longX + gL + eGable + 35, longY);
    p.level(longX - eGable - 30, longY, '±0.00');
    p.restore();

    // Raised concrete base (+0.20m) & Sidewalk
    p.save();
    const andW = 0.60 * sc;
    p.fillColor(0.92, 0.92, 0.94).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
    p.rect(longX, longY, gL, flrH, true, true);
    p.rect(longX - andW, longY, andW, flrH, true, true);
    p.rect(longX + gL, longY, andW, flrH, true, true);
    p.level(longX - eGable - 30, longY + flrH, '+0.20');
    p.restore();

    // Block Wall (0.40 m)
    p.save();
    p.fillColor(0.85, 0.86, 0.89).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
    p.rect(longX, longY + flrH, gL, blkH, true, true);
    p.strokeColor(0.6, 0.6, 0.6).lineWidth(0.5).line(longX, longY + flrH + blkH / 2, longX + gL, longY + flrH + blkH / 2);
    p.restore();

    // Columns (5 at 3.00m)
    const colW = 9;
    p.save();
    p.fillColor(0.15, 0.15, 0.15);
    for (let i = 0; i < 5; i++) {
      const cx = longX + i * 3.0 * sc;
      p.rect(cx - colW / 2, longY + flrH, colW, eavH, false, true);
    }
    p.restore();

    // Wire Mesh (2.60 m free height)
    p.save();
    p.strokeColor(0.4, 0.55, 0.7).lineWidth(0.5).dash([3, 2]);
    for (let i = 0; i < 4; i++) {
      const cx1 = longX + i * 3.0 * sc + colW / 2;
      const bayW = 3.0 * sc - colW;
      p.rect(cx1, longY + flrH + blkH, bayW, eavH - blkH, false, false);
    }
    p.restore();

    // Eave fascia line (at 3.00m)
    p.save();
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(3.0).dash([]);
    p.line(longX - eGable, longY + flrH + eavH, longX + gL + eGable, longY + flrH + eavH);

    // Continuous Asymmetric Ridge Ventilation Opening (0.30 m)
    // Lower ridge edge behind
    p.strokeColor(0.4, 0.4, 0.4).lineWidth(0.8).dash([4, 2]);
    p.line(longX - eGable, longY + flrH + lowRdH, longX + gL + eGable, longY + flrH + lowRdH);

    // 30 cm mesh opening visible
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(0.8).dash([2, 1]);
    p.rect(longX - eGable, longY + flrH + lowRdH, gL + 2 * eGable, 0.30 * sc, false, false);

    // Higher roof ridge line (at 4.00m)
    p.strokeColor(0.2, 0.35, 0.65).lineWidth(3.0).dash([]);
    p.line(longX - eGable, longY + flrH + highRdH, longX + gL + eGable, longY + flrH + highRdH);
    p.restore();

    // Dimensions (Pure numbers!)
    // Top Horizontal
    const dimYTop = longY + flrH + highRdH + 30;
    for (let i = 0; i < 4; i++) {
      p.dimH(longX + i * 3 * sc, longX + (i + 1) * 3 * sc, dimYTop, '3.00');
    }
    p.dimH(longX, longX + gL, dimYTop + 18, '12.00');
    p.dimH(longX - eGable, longX, dimYTop + 18, '0.60');
    p.dimH(longX + gL, longX + gL + eGable, dimYTop + 18, '0.60');
    p.dimH(longX - eGable, longX + gL + eGable, dimYTop + 36, '13.20');

    // Vertical on Right
    const dimXR = longX + gL + eGable + 28;
    p.dimV(longY, longY + flrH, dimXR, '0.20');
    p.dimV(longY + flrH, longY + flrH + blkH, dimXR, '0.40');
    p.dimV(longY + flrH, longY + flrH + eavH, dimXR + 20, '3.00');
    p.dimV(longY + flrH, longY + flrH + highRdH, dimXR + 40, '4.00');

    // Grid bubbles at bottom
    const axisLabels = ['1', '2', '3', '4', '5'];
    for (let i = 0; i < 5; i++) {
      const cx = longX + i * 3.0 * sc;
      p.circle(cx, longY - 25, 9, true, true);
      p.fillColor(0, 0, 0).text(axisLabels[i], cx, longY - 28, 9, '/F2', 'center');
    }
  }

  // =========================================================================
  // LÁMINA 4: DETALLES CONSTRUCTIVOS CLAVE (PURA GEOMETRÍA Y NÚMEROS)
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawMinimalTitle(4, 4, 'DET-01', 'DETALLES CONSTRUCTIVOS');

    // DETALLE 1: CUMBRERA ASIMÉTRICA DESFASADA (Scale 1:10)
    {
      const d1X = 45;
      const d1Y = 70;
      const d1W = 360;
      const d1H = 440;

      p.save();
      p.fillColor(0.99, 0.99, 0.99).strokeColor(0.7, 0.7, 0.7).lineWidth(1.0);
      p.rect(d1X, d1Y, d1W, d1H, true, true);
      p.fillColor(0.1, 0.2, 0.5).text('DETALLE CUMBRERA ASIMÉTRICA', d1X + 16, d1Y + d1H - 22, 11, '/F2');

      const cx = d1X + 195;
      const cy = d1Y + 180;

      // Lower roof slope coming from left up to cx at cy
      p.strokeColor(0.75, 0.2, 0.15).lineWidth(5.0);
      p.line(cx - 150, cy - 35, cx, cy);

      // Higher roof slope coming from right up to cx at cy + 70, and OVERLAPPING 60 pt to the left!
      const overlapTipX = cx - 60; // 0.40m representation
      const overlapTipY = cy + 70 - 15;
      p.strokeColor(0.2, 0.35, 0.65).lineWidth(5.0);
      p.line(cx + 140, cy + 30, overlapTipX, overlapTipY);

      // Vertical opening between them (0.30m) with wire mesh
      p.strokeColor(0.1, 0.6, 0.3).lineWidth(2.0).dash([4, 2]);
      p.line(cx, cy, cx, cy + 70);

      // Support post
      p.strokeColor(0.2, 0.2, 0.2).lineWidth(2.5).dash([]);
      p.line(cx, cy, cx, cy + 70);

      // Pure numeric dimensions!
      p.dimV(cy, cy + 70, cx + 22, '0.30');
      p.dimH(overlapTipX, cx, cy + 85, '0.40');

      // Small level marks
      p.level(cx - 50, cy + 5, '3.70');
      p.level(cx + 40, cy + 75, '4.00');

      p.restore();
    }

    // DETALLE 2: MURO DE BLOQUES Y PISO ELEVADO (Scale 1:10)
    {
      const d2X = 435;
      const d2Y = 70;
      const d2W = 360;
      const d2H = 440;

      p.save();
      p.fillColor(0.99, 0.99, 0.99).strokeColor(0.7, 0.7, 0.7).lineWidth(1.0);
      p.rect(d2X, d2Y, d2W, d2H, true, true);
      p.fillColor(0.1, 0.2, 0.5).text('DETALLE MURO Y PISO', d2X + 16, d2Y + d2H - 22, 11, '/F2');

      const bx = d2X + 130;
      const by = d2Y + 140;

      // Ground line
      p.strokeColor(0.3, 0.3, 0.3).lineWidth(1.5);
      p.line(d2X + 15, by, d2X + d2W - 15, by);
      p.level(d2X + 25, by, '±0.00');

      // Raised floor slab (+0.20m)
      p.fillColor(0.92, 0.92, 0.94).strokeColor(0.2, 0.2, 0.2).lineWidth(1.2);
      p.rect(bx, by, 195, 38, true, true);
      p.level(bx + 110, by + 38, '+0.20');

      // Sidewalk (0.60m)
      p.polygon([[bx - 75, by], [bx, by + 38], [bx, by]], true, true);

      // Block wall: 40 cm
      p.fillColor(0.8, 0.82, 0.86).strokeColor(0.1, 0.1, 0.1).lineWidth(1.2);
      p.rect(bx, by + 38, 32, 38, true, true); // hilada 1
      p.rect(bx, by + 76, 32, 38, true, true); // hilada 2

      // Solera
      p.fillColor(0.72, 0.75, 0.8);
      p.rect(bx, by + 114, 32, 22, true, true);

      // Mesh post
      p.strokeColor(0.1, 0.1, 0.1).lineWidth(2.5);
      p.line(bx + 16, by + 114, bx + 16, by + 210);
      p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.5).dash([3, 2]);
      p.line(bx + 16, by + 136, bx + 16, by + 210);

      // Pure numeric dimensions!
      p.dimV(by, by + 38, bx - 18, '0.20');
      p.dimV(by + 38, by + 114, bx - 18, '0.40');
      p.dimH(bx - 75, bx, by - 14, '0.60');

      p.restore();
    }
  }

  const pdfBytes = engine.build();
  const outPath = 'C:/Users/luisd/.gemini/antigravity/scratch/galpon-avicola/Planos_Galpon_360_Gallinas_Clima_Calido.pdf';
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Successfully generated asymmetric roof blueprints PDF at:', outPath);
  console.log('File size:', pdfBytes.length, 'bytes');
  return outPath;
}

generateAsymmetricPlans();
