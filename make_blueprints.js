const fs = require('fs');
const { PdfEngine } = require('./blueprint_engine');

function generateAllPlans() {
  const engine = new PdfEngine();

  // =========================================================================
  // LÁMINA 1: ARQ-01 - PLANTA GENERAL ARQUITECTÓNICA Y DISTRIBUCIÓN INTERIOR
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawSheetBorderAndTitleBlock(
      1, 4, 'ARQ-01',
      'PLANTA ARQUITECTÓNICA Y DISTRIBUCIÓN OPERATIVA',
      'Planta General con Ejes, Equipamiento Zootécnico (360 Aves), Aleros y Cotas',
      '1 : 50'
    );

    // Compass / Orientation in top-right
    p.drawCompass(740, 500, 20);

    // Scale & transformation for floor plan:
    // 12m length -> 480 pt, 6m width -> 240 pt (scale: 40 pt / meter)
    const ox = 150; // origin X for Galpon corner (0,0) -> (Eje 1, Eje B)
    const oy = 210; // origin Y for Galpon corner (0,0) -> (Eje 1, Eje B)
    const scale = 40; // 40 pt per meter

    const L = 12 * scale; // 480 pt
    const W = 6 * scale;  // 240 pt

    // 1. Surrounding concrete sidewalk / andén sanitario (0.60 m)
    const anden = 0.60 * scale; // 24 pt
    p.save();
    p.fillColor(0.93, 0.94, 0.95).strokeColor(0.65, 0.7, 0.75).lineWidth(0.8);
    p.rect(ox - anden, oy - anden, L + 2 * anden, W + 2 * anden, true, true);
    p.fillColor(0.4, 0.45, 0.5).text('Andén sanitario perimetral de concreto (0.60 m) anti-roedores', ox + L / 2, oy - anden - 8, 6.5, '/F3', 'center');
    p.restore();

    // 2. Concrete slab interior (72 m2)
    p.save();
    p.fillColor(0.98, 0.98, 0.97).strokeColor(0.1, 0.15, 0.2).lineWidth(1.2);
    p.rect(ox, oy, L, W, true, true);
    p.restore();

    // 3. Projected Roof Overhangs (Aleros proyectados en línea discontinua)
    // Lateral eaves = 1.20 m (48 pt), Gable eaves = 0.60 m (24 pt)
    const eaveLat = 1.20 * scale; // 48 pt
    const eaveGable = 0.60 * scale; // 24 pt
    p.save();
    p.strokeColor(0.75, 0.2, 0.15).lineWidth(1.0).dash([5, 3]);
    p.rect(ox - eaveGable, oy - eaveLat, L + 2 * eaveGable, W + 2 * eaveLat, true, false);
    // Eave labels
    p.fillColor(0.75, 0.2, 0.15);
    p.text('PROYECCIÓN DE ALERÓN LATERAL (VOLADIZO: 1.20 m)', ox + L / 2, oy + W + eaveLat + 3, 6.5, '/F2', 'center');
    p.text('PROYECCIÓN DE ALERÓN LATERAL (VOLADIZO: 1.20 m)', ox + L / 2, oy - eaveLat - 11, 6.5, '/F2', 'center');
    p.text('ALERÓN CULATA: 0.60 m', ox - eaveGable - 2, oy + W / 2, 6, '/F2', 'center', 90);
    p.text('ALERÓN CULATA: 0.60 m', ox + L + eaveGable + 8, oy + W / 2, 6, '/F2', 'center', 90);
    p.restore();

    // 4. Ridge centerline (Caballete / Linternilla central)
    p.save();
    p.strokeColor(0.1, 0.4, 0.8).lineWidth(0.8).dash([8, 2, 2, 2]);
    p.line(ox - eaveGable - 10, oy + W / 2, ox + L + eaveGable + 10, oy + W / 2);
    p.fillColor(0.1, 0.4, 0.8).text('EJE CENTRAL CABALLETE ALZADO / LINTERNILLA DE VENTILACIÓN (30 cm)', ox + L / 2, oy + W / 2 + 3, 6, '/F2', 'center');
    p.restore();

    // 5. Floor slope indicators (1.0% towards lateral drain channels)
    p.save();
    p.strokeColor(0.3, 0.5, 0.7).lineWidth(0.8);
    // Upper half slope arrow pointing up
    p.line(ox + 80, oy + W / 2 + 20, ox + 80, oy + W - 15);
    p.polygon([[ox + 80, oy + W - 10], [ox + 77, oy + W - 16], [ox + 83, oy + W - 16]], true, true);
    p.fillColor(0.2, 0.4, 0.6).text('Pendiente piso 1.0%', ox + 85, oy + W / 2 + 45, 6, '/F1', 'left', 90);
    // Lower half slope arrow pointing down
    p.line(ox + 80, oy + W / 2 - 20, ox + 80, oy + 15);
    p.polygon([[ox + 80, oy + 10], [ox + 77, oy + 16], [ox + 83, oy + 16]], true, true);
    p.fillColor(0.2, 0.4, 0.6).text('Pendiente piso 1.0%', ox + 85, oy + W / 2 - 45, 6, '/F1', 'left', 90);
    // Floor level mark
    p.text('N.P.T. +0.20 m (Sobre-elevación 20 cm)', ox + 140, oy + W / 2 + 15, 6.5, '/F2', 'center');
    p.restore();

    // 6. Perimeter block dwarf wall (40 cm height) - represented as wall band
    const wallThick = 0.15 * scale; // 6 pt
    p.save();
    p.strokeColor(0.2, 0.25, 0.3).lineWidth(1.2).fillColor(0.85, 0.88, 0.9);
    // Top wall
    p.rect(ox, oy + W - wallThick, L, wallThick, true, true);
    // Bottom wall
    p.rect(ox, oy, L, wallThick, true, true);
    // Left wall with door opening (1.00 m at center)
    const doorW = 1.0 * scale; // 40 pt
    const doorY = oy + (W - doorW) / 2;
    p.rect(ox, oy, wallThick, doorY - oy, true, true);
    p.rect(ox, doorY + doorW, wallThick, oy + W - (doorY + doorW), true, true);
    // Right wall with service door
    p.rect(ox + L - wallThick, oy, wallThick, doorY - oy, true, true);
    p.rect(ox + L - wallThick, doorY + doorW, wallThick, oy + W - (doorY + doorW), true, true);

    // Door swings
    p.strokeColor(0.1, 0.4, 0.2).lineWidth(1.0);
    // Front door opening outward
    p.line(ox, doorY, ox - doorW, doorY);
    p.dash([2, 2]).circle(ox, doorY, doorW, true, false); // arc approx
    p.fillColor(0.1, 0.4, 0.2).text('Puerta Principal 1.00x2.10m', ox - 5, doorY + doorW / 2 - 2, 6, '/F2', 'right');
    // Sanitizing footbath (Pediluvio)
    p.fillColor(0.8, 0.88, 0.95).strokeColor(0.2, 0.4, 0.6).lineWidth(0.8);
    p.rect(ox - doorW - 20, doorY - 4, 18, doorW + 8, true, true);
    p.fillColor(0.1, 0.3, 0.6).text('Filtro Sanitario / Pediluvio', ox - doorW - 22, doorY + doorW / 2 - 2, 5.5, '/F2', 'right');

    // Rear door
    p.strokeColor(0.1, 0.4, 0.2).lineWidth(1.0).dash([]);
    p.line(ox + L, doorY, ox + L + doorW, doorY);
    p.fillColor(0.1, 0.4, 0.2).text('Puerta Servicio 1.00m', ox + L + 5, doorY + doorW / 2 - 2, 6, '/F2', 'left');
    p.restore();

    // 7. Structural Columns (10 columns at grid intersections)
    // Axes: 1 (0m), 2 (3m), 3 (6m), 4 (9m), 5 (12m)
    // Lateral A (6m), B (0m)
    const colSize = 0.20 * scale; // 8 pt
    p.save();
    p.fillColor(0.15, 0.2, 0.25).strokeColor(0.05, 0.05, 0.05).lineWidth(0.8);
    for (let i = 0; i < 5; i++) {
      const colX = ox + i * 3.0 * scale;
      // Top col (Eje A)
      p.rect(colX - colSize / 2, oy + W - colSize / 2, colSize, colSize, true, true);
      // Bottom col (Eje B)
      p.rect(colX - colSize / 2, oy - colSize / 2, colSize, colSize, true, true);
    }
    p.restore();

    // 8. Structural Grid Lines & Bubbles
    p.save();
    p.strokeColor(0.4, 0.45, 0.55).lineWidth(0.5).dash([6, 2, 1, 2]);
    // Longitudinal axes 1..5
    const axisLabelsX = ['1', '2', '3', '4', '5'];
    for (let i = 0; i < 5; i++) {
      const curX = ox + i * 3.0 * scale;
      p.line(curX, oy - anden - 25, curX, oy + W + anden + 25);
      p.axisBubble(curX, oy + W + anden + 35, axisLabelsX[i]);
      p.axisBubble(curX, oy - anden - 35, axisLabelsX[i]);
    }
    // Transverse axes A & B
    const axisLabelsY = ['B', 'A'];
    const curYs = [oy, oy + W];
    for (let i = 0; i < 2; i++) {
      p.line(ox - anden - 25, curYs[i], ox + L + anden + 25, curYs[i]);
      p.axisBubble(ox - anden - 35, curYs[i], axisLabelsY[i]);
      p.axisBubble(ox + L + anden + 35, curYs[i], axisLabelsY[i]);
    }
    p.restore();

    // 9. Interior Poultry Equipment (360 Gallinas)
    // Pasillo central: Width 1.20 m (48 pt) -> from Y = oy + 2.40m to Y = oy + 3.60m
    const aisleY1 = oy + 2.40 * scale;
    const aisleY2 = oy + 3.60 * scale;
    p.save();
    p.fillColor(0.94, 0.95, 0.93).strokeColor(0.7, 0.75, 0.7).lineWidth(0.6).dash([2, 2]);
    p.rect(ox + wallThick + 5, aisleY1, L - 2 * wallThick - 10, aisleY2 - aisleY1, true, true);
    p.fillColor(0.35, 0.45, 0.35).text('PASILLO CENTRAL DE MANEJO Y RECOLECCIÓN (Ancho: 1.20 m)', ox + L / 2, (aisleY1 + aisleY2) / 2 - 2, 7, '/F2', 'center');
    p.restore();

    // A. Nest Boxes (Nidales): 2 banks of 36 holes = 72 holes total
    // Placed in darker/fresher zone along walls
    const nestDepth = 0.40 * scale; // 16 pt
    const nestLength = 2.40 * scale; // 96 pt (2 modules of 1.20m)
    p.save();
    p.fillColor(0.88, 0.82, 0.72).strokeColor(0.4, 0.3, 0.2).lineWidth(0.8).dash([]);
    // Nest Module 1: Upper wall between col 2 and 3
    p.rect(ox + 3.5 * scale, oy + W - wallThick - nestDepth, nestLength, nestDepth, true, true);
    p.fillColor(0.3, 0.2, 0.1).text('Módulo Nidales (36 huecos en 3 niveles)', ox + 3.5 * scale + nestLength / 2, oy + W - wallThick - nestDepth + 5, 5.5, '/F2', 'center');
    // Nest Module 2: Lower wall between col 2 and 3
    p.rect(ox + 3.5 * scale, oy + wallThick, nestLength, nestDepth, true, true);
    p.fillColor(0.3, 0.2, 0.1).text('Módulo Nidales (36 huecos en 3 niveles)', ox + 3.5 * scale + nestLength / 2, oy + wallThick + 5, 5.5, '/F2', 'center');
    p.fillColor(0.2, 0.2, 0.2).text('Total: 72 nidos (1 nido / 5 aves)', ox + 3.5 * scale + nestLength / 2, oy + wallThick - 7, 6, '/F3', 'center');
    p.restore();

    // B. Hanging Tube Feeders (Comederos de Tolva): 12 units (2 lines of 6)
    p.save();
    p.strokeColor(0.8, 0.4, 0.1).lineWidth(0.8).fillColor(0.98, 0.75, 0.4);
    const feederY_top = oy + 4.5 * scale; // in top zone
    const feederY_bot = oy + 1.5 * scale; // in bottom zone
    for (let k = 0; k < 6; k++) {
      const feedX = ox + (1.2 + k * 1.9) * scale;
      p.circle(feedX, feederY_top, 6, true, true);
      p.circle(feedX, feederY_bot, 6, true, true);
    }
    p.fillColor(0.6, 0.3, 0.05);
    p.text('Línea de Comederos Tolva (12 unidades)', ox + 6.0 * scale, feederY_top + 9, 6, '/F2', 'center');
    p.text('Línea de Comederos Tolva (12 unidades)', ox + 6.0 * scale, feederY_bot - 13, 6, '/F2', 'center');
    p.restore();

    // C. Automatic Drinkers (Bebederos automáticos tipo campana o línea de niples):
    p.save();
    p.strokeColor(0.1, 0.45, 0.8).lineWidth(0.8).fillColor(0.6, 0.8, 1.0);
    const drinkY_top = oy + 4.0 * scale;
    const drinkY_bot = oy + 2.0 * scale;
    // Tubería de agua potable
    p.dash([3, 1]).line(ox + 0.8 * scale, drinkY_top, ox + 11.2 * scale, drinkY_top);
    p.line(ox + 0.8 * scale, drinkY_bot, ox + 11.2 * scale, drinkY_bot);
    p.dash([]);
    for (let k = 0; k < 5; k++) {
      const drkX = ox + (2.0 + k * 2.0) * scale;
      p.circle(drkX, drinkY_top, 4.5, true, true);
      p.circle(drkX, drinkY_bot, 4.5, true, true);
    }
    p.fillColor(0.05, 0.3, 0.7);
    p.text('Tubería y Bebederos Automáticos (Campana / Niples)', ox + 9.5 * scale, drinkY_top + 6, 5.5, '/F2', 'center');
    p.restore();

    // D. Roosts / Perches (Asaderos / Perchas elevadas)
    // Placed in bays 3-4 and 4-5
    p.save();
    p.strokeColor(0.5, 0.35, 0.2).lineWidth(1.0).dash([4, 2]);
    const roostY1 = oy + 0.5 * scale;
    const roostY2 = oy + 1.1 * scale;
    p.line(ox + 7.5 * scale, roostY1, ox + 11.2 * scale, roostY1);
    p.line(ox + 7.5 * scale, roostY2, ox + 11.2 * scale, roostY2);
    p.fillColor(0.4, 0.25, 0.1).text('Asaderos / Perchas de descanso nocturno (listones c/35cm)', ox + 9.35 * scale, roostY2 + 5, 5.5, '/F2', 'center');
    p.restore();

    // 10. Dimensions (Cotas)
    // Horizontal bottom:
    // Bay to bay dimensions (3.00m, 3.00m, 3.00m, 3.00m)
    const dimY1 = oy - anden - 18;
    for (let i = 0; i < 4; i++) {
      p.dimH(ox + i * 3 * scale, ox + (i + 1) * 3 * scale, dimY1, '3.00 m');
    }
    // Total interior length (12.00m)
    p.dimH(ox, ox + L, dimY1 - 16, '12.00 m (LARGO TOTAL INTERIOR)');
    // Total roof length with gable eaves (0.60 + 12.00 + 0.60 = 13.20m)
    p.dimH(ox - eaveGable, ox + L + eaveGable, dimY1 - 32, '13.20 m (LARGO TOTAL CUBIERTA)');

    // Vertical left:
    // Dwarf wall & width (6.00m)
    const dimX1 = ox - anden - 18;
    p.dimV(oy, oy + W, dimX1, '6.00 m (ANCHO TOTAL)');
    // Total roof width with lateral eaves (1.20 + 6.00 + 1.20 = 8.40m)
    p.dimV(oy - eaveLat, oy + W + eaveLat, dimX1 - 16, '8.40 m (ANCHO TOTAL CUBIERTA)');

    // Callouts & Technical Notes on Sheet 1
    p.save();
    p.fillColor(0.1, 0.15, 0.25);
    p.text('CUADRO DE ÁREAS Y DENSIDAD:', 50, 140, 8, '/F2');
    p.text('• Área libre de galpón: 6.00 m x 12.00 m = 72.00 m²', 50, 128, 7, '/F1');
    p.text('• Capacidad instalada: 360 gallinas ponedoras / camperas', 50, 117, 7, '/F1');
    p.text('• Densidad técnica: 5.0 aves / m² (Óptima para clima cálido)', 50, 106, 7, '/F2');
    p.text('• Área total techada con aleros: 8.40 m x 13.20 m = 110.88 m²', 50, 95, 7, '/F1');

    p.text('ESPECIFICACIONES DE CERRAMIENTO:', 340, 140, 8, '/F2');
    p.text('• Murete perimetral: Bloque de concreto h = 0.40 m (2 hiladas)', 340, 128, 7, '/F1');
    p.text('• Malla galvanizada anti-pájaros / predadores: h = 2.60 m', 340, 117, 7, '/F1');
    p.text('• Cortinas regulables con cabrestante para control de ventiscas', 340, 106, 7, '/F1');
    p.text('• Desnivel de piso: 1.0% (1 cm/m) con canaletas laterales de lavado', 340, 95, 7, '/F1');
    p.restore();
  }

  // =========================================================================
  // LÁMINA 2: ARQ-02 - CORTE TRANSVERSAL A-A' Y ELEVACIÓN FRONTAL (CULATA)
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawSheetBorderAndTitleBlock(
      2, 4, 'ARQ-02',
      'CORTE TRANSVERSAL A-A\' Y ELEVACIÓN FRONTAL (CULATA)',
      'Detalle de Alturas (3.00m, 3.70m, 4.00m), Alerones (1.20m), Caballete y Termosifón',
      '1 : 35'
    );

    // Coordinate settings for Cross Section A-A'
    // Width 6.00m -> at scale 45 pt/m = 270 pt.
    // Overhangs 1.20m each side = 54 pt each. Total roof = 378 pt.
    // Heights:
    // Ground NTN = 0 pt (level yGround)
    // Floor NPT = +0.20m = +9 pt
    // Wall = +0.40m over NPT = +18 pt (total +0.60m)
    // Eaves = 3.00m over NPT = +135 pt (total +3.20m)
    // Lower ridge = 3.70m over NPT = +166.5 pt (total +3.90m)
    // Higher ridge = 4.00m over NPT = +180 pt (total +4.20m)
    const scaleSec = 42; // pt per meter
    const secX = 230; // Center at 230 + 3*scaleSec = 356
    const secY = 320; // NTN baseline

    const gW = 6.0 * scaleSec; // 252 pt
    const oHang = 1.20 * scaleSec; // 50.4 pt
    const floorH = 0.20 * scaleSec; // 8.4 pt
    const blockH = 0.40 * scaleSec; // 16.8 pt
    const eaveH = 3.00 * scaleSec;  // 126 pt
    const lowRidgeH = 3.70 * scaleSec; // 155.4 pt
    const highRidgeH = 4.00 * scaleSec; // 168 pt
    const ventH = 0.30 * scaleSec; // 12.6 pt
    const overlapW = 0.40 * scaleSec; // 16.8 pt

    // 1. Natural Ground (Terreno Natural NTN +-0.00)
    p.save();
    p.strokeColor(0.4, 0.4, 0.4).lineWidth(1.2);
    p.line(secX - oHang - 40, secY, secX + gW + oHang + 40, secY);
    // Ground hatching (hash marks)
    p.strokeColor(0.6, 0.6, 0.6).lineWidth(0.6);
    for (let x = secX - oHang - 35; x <= secX + gW + oHang + 35; x += 12) {
      p.line(x, secY, x - 6, secY - 8);
    }
    p.fillColor(0.3, 0.3, 0.3).text('N.T.N. ±0.00 m (Nivel Terreno Natural)', secX - oHang - 35, secY - 14, 6.5, '/F2');
    p.restore();

    // 2. Concrete slab & foundation (NPT +0.20m)
    p.save();
    p.fillColor(0.92, 0.93, 0.94).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    // Raised platform / compact fill
    p.rect(secX, secY, gW, floorH, true, true);
    // Sidewalks on each side (0.60m)
    const andW = 0.60 * scaleSec;
    p.polygon([[secX - andW, secY], [secX, secY + floorH], [secX, secY]], true, true);
    p.polygon([[secX + gW + andW, secY], [secX + gW, secY + floorH], [secX + gW, secY]], true, true);
    p.fillColor(0.2, 0.2, 0.2).text('Andén 0.60m', secX - andW, secY + floorH + 3, 5.5, '/F1');
    p.text('Andén 0.60m', secX + gW + 5, secY + floorH + 3, 5.5, '/F1');
    // Concrete floor slab (8cm) with slope
    p.strokeColor(0.3, 0.3, 0.3).lineWidth(0.8);
    // Ridge of floor at center, sloping 1.0% to both sides
    const midX = secX + gW / 2;
    p.polygon([[secX, secY + floorH], [midX, secY + floorH + 3], [secX + gW, secY + floorH]], false, false);
    p.fillColor(0.1, 0.15, 0.2).text('Pendiente piso: 1.0% (1 cm/m)', midX, secY + floorH + 4, 6, '/F2', 'center');
    p.restore();

    // 3. Dwarf block wall (40 cm) on both sides
    p.save();
    const wallW = 0.15 * scaleSec; // ~6 pt
    p.fillColor(0.8, 0.82, 0.85).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    p.rect(secX, secY + floorH, wallW, blockH, true, true);
    p.rect(secX + gW - wallW, secY + floorH, wallW, blockH, true, true);
    // Blocks hatching
    p.line(secX, secY + floorH + blockH / 2, secX + wallW, secY + floorH + blockH / 2);
    p.line(secX + gW - wallW, secY + floorH + blockH / 2, secX + gW, secY + floorH + blockH / 2);
    p.fillColor(0.1, 0.15, 0.2).text('Pared de bloques (40 cm)', secX - 10, secY + floorH + blockH / 2, 6, '/F2', 'right');
    p.restore();

    // 4. Columns & Wire mesh (Malla pajarera de 2.60m)
    p.save();
    // Columns
    p.strokeColor(0.1, 0.15, 0.2).lineWidth(1.5);
    p.line(secX + wallW / 2, secY + floorH + blockH, secX + wallW / 2, secY + floorH + eaveH);
    p.line(secX + gW - wallW / 2, secY + floorH + blockH, secX + gW - wallW / 2, secY + floorH + eaveH);
    // Wire mesh pattern
    p.strokeColor(0.4, 0.5, 0.6).lineWidth(0.4).dash([2, 2]);
    p.rect(secX + wallW / 2, secY + floorH + blockH, wallW / 2, eaveH - blockH, false, false);
    for (let my = secY + floorH + blockH; my < secY + floorH + eaveH; my += 10) {
      p.line(secX, my, secX + wallW, my);
      p.line(secX + gW - wallW, my, secX + gW, my);
    }
    // Rolled curtain on top of wall
    p.fillColor(0.2, 0.4, 0.7).strokeColor(0.1, 0.2, 0.4).lineWidth(0.8).dash([]);
    p.circle(secX - 4, secY + floorH + eaveH - 6, 4, true, true);
    p.circle(secX + gW + 4, secY + floorH + eaveH - 6, 4, true, true);
    p.fillColor(0.1, 0.2, 0.5).text('Cortina enrollable', secX - 8, secY + floorH + eaveH - 8, 5.5, '/F1', 'right');
    p.restore();

    // 5. Roof Truss & Cover (Cercha y Cubierta Principal)
    // Lower roof slopes from eaves (height eaveH) to low ridge (height lowRidgeH)
    // Left eave tip: (secX - oHang, secY + floorH + eaveH - 12)
    // Left wall point: (secX, secY + floorH + eaveH)
    // Center low ridge point: (midX - 15, secY + floorH + lowRidgeH)
    // Right wall point: (secX + gW, secY + floorH + eaveH)
    // Right eave tip: (secX + gW + oHang, secY + floorH + eaveH - 12)
    const eaveY = secY + floorH + eaveH;
    const lowRidgeY = secY + floorH + lowRidgeH;
    const highRidgeY = secY + floorH + highRidgeH;

    p.save();
    // Structural rafters (Cercha)
    p.strokeColor(0.3, 0.35, 0.4).lineWidth(1.2);
    // Bottom chord of truss (Tirante horizontal a nivel de alero)
    p.line(secX, eaveY, secX + gW, eaveY);
    // Web diagonals of truss
    p.strokeColor(0.4, 0.45, 0.5).lineWidth(0.8);
    const q1 = secX + gW / 4;
    const q3 = secX + 3 * gW / 4;
    p.line(secX, eaveY, q1, eaveY + (lowRidgeY - eaveY) / 2);
    p.line(q1, eaveY, q1, eaveY + (lowRidgeY - eaveY) / 2);
    p.line(q1, eaveY, midX, lowRidgeY - 10);
    p.line(midX, eaveY, midX, lowRidgeY - 10);
    p.line(midX, lowRidgeY - 10, q3, eaveY);
    p.line(q3, eaveY, q3, eaveY + (lowRidgeY - eaveY) / 2);
    p.line(q3, eaveY + (lowRidgeY - eaveY) / 2, secX + gW, eaveY);

    // Main roof sheets (Lámina principal izquierda y derecha)
    // Note: gap in center of ~0.60m for air outlet!
    const gapHalf = 0.30 * scaleSec; // 12.6 pt
    p.strokeColor(0.7, 0.2, 0.15).lineWidth(2.0); // Red corrugated roof
    // Left sheet: from eave to center low ridge
    const leftEaveSlopeY = eaveY - (oHang * (lowRidgeY - eaveY)) / (gW / 2);
    p.line(secX - oHang, leftEaveSlopeY, midX - gapHalf, lowRidgeY);
    // Right sheet:
    const rightEaveSlopeY = eaveY - (oHang * (lowRidgeY - eaveY)) / (gW / 2);
    p.line(secX + gW + oHang, rightEaveSlopeY, midX + gapHalf, lowRidgeY);
    p.restore();

    // 6. Raised Ridge Cap / Monitor (Caballete Alzado / Linternilla)
    // High ridge at highRidgeY = lowRidgeY + ventH (30 cm opening)
    // Overlap: extends overlapW (40 cm) past gapHalf
    const capHalfW = gapHalf + overlapW; // 0.30 + 0.40 = 0.70m = 29.4 pt
    p.save();
    // Cap vertical supports / posts
    p.strokeColor(0.2, 0.25, 0.3).lineWidth(1.2);
    p.line(midX - gapHalf, lowRidgeY, midX - gapHalf, highRidgeY - 4);
    p.line(midX + gapHalf, lowRidgeY, midX + gapHalf, highRidgeY - 4);
    // Bird mesh in opening (30 cm vertical)
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(0.8).dash([2, 1]);
    p.line(midX - gapHalf, lowRidgeY, midX - gapHalf, highRidgeY);
    p.line(midX + gapHalf, lowRidgeY, midX + gapHalf, highRidgeY);
    p.fillColor(0.05, 0.5, 0.2).text('Malla pajarera anti-aves', midX + gapHalf + 3, lowRidgeY + 4, 5.5, '/F2');

    // Cap roof sheet with 40 cm overlap
    p.strokeColor(0.7, 0.2, 0.15).lineWidth(2.2).dash([]);
    p.line(midX - capHalfW, highRidgeY - 4, midX, highRidgeY);
    p.line(midX, highRidgeY, midX + capHalfW, highRidgeY - 4);

    // Callout for ridge overlap and opening
    p.fillColor(0.7, 0.2, 0.15).text('Caballete alzado (cumbrera superior)', midX, highRidgeY + 8, 6.5, '/F2', 'center');
    p.fillColor(0.1, 0.2, 0.4).text('Traslape: 40 cm', midX - capHalfW - 3, highRidgeY + 2, 5.5, '/F2', 'right');
    p.text('Traslape: 40 cm', midX + capHalfW + 3, highRidgeY + 2, 5.5, '/F2', 'left');
    p.restore();

    // 7. Bioclimatic Airflow Arrows (Efecto Chimenea / Convección)
    p.save();
    // Cool fresh air entering sides (Blue arrows)
    p.strokeColor(0.1, 0.4, 0.8).fillColor(0.1, 0.4, 0.8).lineWidth(1.0);
    p.line(secX - 35, secY + floorH + 30, secX + 20, secY + floorH + 30);
    p.polygon([[secX + 25, secY + floorH + 30], [secX + 18, secY + floorH + 33], [secX + 18, secY + floorH + 27]], true, true);
    p.text('Aire fresco exterior', secX - 40, secY + floorH + 38, 5.5, '/F2', 'center');

    p.line(secX + gW + 35, secY + floorH + 30, secX + gW - 20, secY + floorH + 30);
    p.polygon([[secX + gW - 25, secY + floorH + 30], [secX + gW - 18, secY + floorH + 33], [secX + gW - 18, secY + floorH + 27]], true, true);
    p.text('Aire fresco exterior', secX + gW + 40, secY + floorH + 38, 5.5, '/F2', 'center');

    // Hot rising air exiting ridge (Red wavy arrows)
    p.strokeColor(0.85, 0.25, 0.1).fillColor(0.85, 0.25, 0.1).lineWidth(1.2);
    p.line(midX - 10, lowRidgeY - 25, midX - 15, lowRidgeY + 18);
    p.polygon([[midX - 17, lowRidgeY + 22], [midX - 20, lowRidgeY + 15], [midX - 13, lowRidgeY + 16]], true, true);
    p.line(midX + 10, lowRidgeY - 25, midX + 15, lowRidgeY + 18);
    p.polygon([[midX + 17, lowRidgeY + 22], [midX + 20, lowRidgeY + 15], [midX + 13, lowRidgeY + 16]], true, true);
    p.fillColor(0.85, 0.25, 0.1).text('Salida de calor por convección natural (Termosifón)', midX, lowRidgeY - 32, 6, '/F2', 'center');
    p.restore();

    // 8. Dimensions & Level Tags for Section A-A'
    // Horizontal dimensions (Top):
    p.dimH(secX - oHang, secX, eaveY + 25, '1.20 m');
    p.dimH(secX, secX + gW, eaveY + 25, '6.00 m (ANCHO GALPÓN)');
    p.dimH(secX + gW, secX + gW + oHang, eaveY + 25, '1.20 m');
    p.dimH(secX - oHang, secX + gW + oHang, eaveY + 40, '8.40 m (ANCHO TOTAL CUBIERTA CON ALEROS)');

    // Vertical dimensions (Right side):
    const dimXR = secX + gW + oHang + 25;
    p.dimV(secY, secY + floorH, dimXR, '0.20 m');
    p.dimV(secY + floorH, secY + floorH + blockH, dimXR, '0.40 m');
    p.dimV(secY + floorH, secY + floorH + eaveH, dimXR + 16, '3.00 m (ALTURA PARED LATERAL)');
    p.dimV(secY + floorH + eaveH, secY + floorH + lowRidgeH, dimXR + 16, '0.70 m');
    p.dimV(secY + floorH + lowRidgeH, secY + floorH + highRidgeH, dimXR, '0.30 m');
    p.dimV(secY + floorH, secY + floorH + highRidgeH, dimXR + 34, '4.00 m (ALTURA MÁXIMA CUMBRERA)');

    // Level Tags (Cotas de nivel arquitectónicas):
    p.levelTag(secX - oHang - 35, secY, 'N.T.N.', '±0.00 m');
    p.levelTag(secX - oHang - 35, secY + floorH, 'N.P.T.', '+0.20 m');
    p.levelTag(secX - oHang - 35, secY + floorH + blockH, 'N.C.M.', '+0.60 m (Corona Muro)');
    p.levelTag(secX - oHang - 35, eaveY, 'N.C.A.', '+3.20 m (Alero)');
    p.levelTag(midX + capHalfW + 10, lowRidgeY, 'N.C.B.', '+3.90 m (Caballete Bajo 3.70m)');
    p.levelTag(midX + capHalfW + 10, highRidgeY, 'N.C.A.', '+4.20 m (Caballete Alto 4.00m)');

    // =========================================================================
    // PART B: ELEVACIÓN FRONTAL (CULATA ESTE / ACCESO PRINCIPAL)
    // =========================================================================
    const elevX = 230;
    const elevY = 90; // baseline

    // 1. Natural Ground
    p.save();
    p.strokeColor(0.4, 0.4, 0.4).lineWidth(1.2);
    p.line(elevX - oHang - 40, elevY, elevX + gW + oHang + 40, elevY);
    p.fillColor(0.3, 0.3, 0.3).text('N.T.N. ±0.00 m', elevX - oHang - 35, elevY - 12, 6, '/F2');
    p.restore();

    // 2. Concrete Base & Sidewalk (+0.20m)
    p.save();
    p.fillColor(0.92, 0.93, 0.94).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    p.rect(elevX, elevY, gW, floorH, true, true);
    p.polygon([[elevX - andW, elevY], [elevX, elevY + floorH], [elevX, elevY]], true, true);
    p.polygon([[elevX + gW + andW, elevY], [elevX + gW, elevY + floorH], [elevX + gW, elevY]], true, true);
    p.restore();

    // 3. Front Dwarf Wall (0.40m) & Columns
    p.save();
    p.fillColor(0.85, 0.87, 0.9).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    // Wall left of door
    const doorElevW = 1.0 * scaleSec; // ~42 pt
    const doorElevH = 2.10 * scaleSec; // ~88 pt
    const doorLeftX = elevX + (gW - doorElevW) / 2;
    p.rect(elevX, elevY + floorH, doorLeftX - elevX, blockH, true, true);
    p.rect(doorLeftX + doorElevW, elevY + floorH, elevX + gW - (doorLeftX + doorElevW), blockH, true, true);

    // Front Columns
    p.fillColor(0.2, 0.25, 0.3);
    p.rect(elevX, elevY + floorH, wallW, eaveH, true, true);
    p.rect(elevX + gW - wallW, elevY + floorH, wallW, eaveH, true, true);
    // Door frame posts
    p.rect(doorLeftX - 3, elevY + floorH, 4, doorElevH, true, true);
    p.rect(doorLeftX + doorElevW - 1, elevY + floorH, 4, doorElevH, true, true);
    // Door opening
    p.strokeColor(0.1, 0.4, 0.2).lineWidth(1.0).fillColor(0.95, 0.98, 0.95);
    p.rect(doorLeftX, elevY + floorH, doorElevW, doorElevH, true, true);
    // Door mesh and handle
    p.dash([2, 2]).strokeColor(0.3, 0.6, 0.4).lineWidth(0.5);
    p.rect(doorLeftX + 3, elevY + floorH + 3, doorElevW - 6, doorElevH - 6, true, false);
    p.fillColor(0.1, 0.4, 0.2).circle(doorLeftX + doorElevW - 6, elevY + floorH + doorElevH / 2, 2, true, true);
    p.text('Puerta Metálica y Malla (1.00 x 2.10 m)', doorLeftX + doorElevW / 2, elevY + floorH + doorElevH / 2 - 2, 5.5, '/F2', 'center');

    // Gable wire mesh above dwarf wall
    p.strokeColor(0.4, 0.5, 0.6).lineWidth(0.4).dash([2, 2]);
    // Left of door
    p.rect(elevX + wallW, elevY + floorH + blockH, doorLeftX - (elevX + wallW), eaveH - blockH, false, false);
    // Right of door
    p.rect(doorLeftX + doorElevW, elevY + floorH + blockH, (elevX + gW - wallW) - (doorLeftX + doorElevW), eaveH - blockH, false, false);
    // Above door up to gable truss
    p.polygon([
      [elevX, elevY + floorH + eaveH],
      [elevX + gW / 2, elevY + floorH + lowRidgeH],
      [elevX + gW, elevY + floorH + eaveH]
    ], true, false);
    p.restore();

    // 4. Front Gable Roof Facade with Culata Overhang (0.60m)
    p.save();
    // Culata fascia board (Tapajuntas frontal del alero de 60 cm)
    p.strokeColor(0.65, 0.15, 0.1).lineWidth(3.5).dash([]);
    p.line(elevX - oHang, elevY + floorH + eaveH - 12, elevX + gW / 2 - gapHalf, elevY + floorH + lowRidgeH);
    p.line(elevX + gW / 2 + gapHalf, elevY + floorH + lowRidgeH, elevX + gW + oHang, elevY + floorH + eaveH - 12);
    // Ridge monitor front fascia
    p.strokeColor(0.65, 0.15, 0.1).lineWidth(3.0);
    p.line(elevX + gW / 2 - capHalfW, elevY + floorH + highRidgeH - 4, elevX + gW / 2, elevY + floorH + highRidgeH);
    p.line(elevX + gW / 2, elevY + floorH + highRidgeH, elevX + gW / 2 + capHalfW, elevY + floorH + highRidgeH - 4);
    // Monitor mesh visible
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(0.8).dash([2, 1]);
    p.rect(elevX + gW / 2 - gapHalf, elevY + floorH + lowRidgeH, 2 * gapHalf, ventH, true, false);
    p.fillColor(0.65, 0.15, 0.1).text('Fascia de Alerón de Culata (Vuelo Frontal: 0.60 m)', elevX + gW / 2, elevY + floorH + lowRidgeH - 12, 6, '/F2', 'center');
    p.restore();

    // Front elevation label
    p.fillColor(0.08, 0.15, 0.3).text('ELEVACIÓN FRONTAL (CULATA ESTE - ACCESO PRINCIPAL)', elevX + gW / 2, elevY - 22, 8, '/F2', 'center');
  }

  // =========================================================================
  // LÁMINA 3: ARQ-03 - ELEVACIÓN LONGITUDINAL (12.00 m) Y CORTE LONGITUDINAL
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawSheetBorderAndTitleBlock(
      3, 4, 'ARQ-03',
      'ELEVACIÓN LONGITUDINAL (FACHADA LATERAL) Y CORTE B-B\'',
      'Modulación de 4 Vanos c/3.00m, Alerones de Culata (0.60m) y Vista de Linternilla',
      '1 : 50'
    );

    const scaleLong = 38; // pt per meter
    const longX = 170;
    const gL = 12.0 * scaleLong; // 456 pt
    const eaveG = 0.60 * scaleLong; // 22.8 pt
    const flrH = 0.20 * scaleLong; // 7.6 pt
    const blkH = 0.40 * scaleLong; // 15.2 pt
    const eavH = 3.00 * scaleLong; // 114 pt
    const ridgeH = 4.00 * scaleLong; // 152 pt
    const lowRdH = 3.70 * scaleLong; // 140.6 pt

    // -------------------------------------------------------------
    // TOP HALF: ELEVACIÓN LONGITUDINAL (FACHADA LATERAL NORTE / SUR)
    // -------------------------------------------------------------
    const elevY = 350;

    // 1. Natural Ground Line
    p.save();
    p.strokeColor(0.4, 0.4, 0.4).lineWidth(1.2);
    p.line(longX - eaveG - 30, elevY, longX + gL + eaveG + 30, elevY);
    for (let x = longX - eaveG - 25; x <= longX + gL + eaveG + 25; x += 15) {
      p.line(x, elevY, x - 6, elevY - 8);
    }
    p.fillColor(0.3, 0.3, 0.3).text('N.T.N. ±0.00 m', longX - eaveG - 25, elevY - 14, 6, '/F2');
    p.restore();

    // 2. Concrete Raised Base (+0.20m) & Sidewalk
    p.save();
    p.fillColor(0.92, 0.93, 0.94).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    p.rect(longX, elevY, gL, flrH, true, true);
    p.rect(longX - 0.6 * scaleLong, elevY, 0.6 * scaleLong, flrH, true, true);
    p.rect(longX + gL, elevY, 0.6 * scaleLong, flrH, true, true);
    p.restore();

    // 3. Dwarf block wall (0.40m continuous)
    p.save();
    p.fillColor(0.85, 0.87, 0.9).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    p.rect(longX, elevY + flrH, gL, blkH, true, true);
    // Block horizontal line
    p.strokeColor(0.5, 0.55, 0.6).lineWidth(0.6);
    p.line(longX, elevY + flrH + blkH / 2, longX + gL, elevY + flrH + blkH / 2);
    p.fillColor(0.15, 0.2, 0.25).text('Murete perimetral de bloques (Altura: 0.40 m)', longX + gL / 2, elevY + flrH + blkH / 2 - 2.5, 6.5, '/F2', 'center');
    p.restore();

    // 4. Columns at 3.00m intervals (5 columns)
    const colW = 0.20 * scaleLong;
    p.save();
    p.fillColor(0.2, 0.25, 0.3).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    for (let i = 0; i < 5; i++) {
      const cx = longX + i * 3.0 * scaleLong;
      p.rect(cx - colW / 2, elevY + flrH, colW, eavH, true, true);
    }
    p.restore();

    // 5. Wire mesh infill (2.60m free height)
    p.save();
    p.strokeColor(0.4, 0.5, 0.6).lineWidth(0.4).dash([2, 2]);
    for (let i = 0; i < 4; i++) {
      const cx1 = longX + i * 3.0 * scaleLong + colW / 2;
      const bayW = 3.0 * scaleLong - colW;
      p.rect(cx1, elevY + flrH + blkH, bayW, eavH - blkH, false, false);
      // Mesh diagonals for representation
      p.line(cx1, elevY + flrH + blkH, cx1 + bayW, elevY + flrH + eavH);
      p.line(cx1, elevY + flrH + eavH, cx1 + bayW, elevY + flrH + blkH);
    }
    p.fillColor(0.25, 0.35, 0.45).text('Cerramiento con malla galvanizada pajarera / electrosoldada (h = 2.60 m)', longX + gL / 2, elevY + flrH + blkH + 35, 7, '/F2', 'center');
    p.restore();

    // 6. Eave fascia line & Lateral overhang profile (1.20m overhang projection)
    p.save();
    p.strokeColor(0.7, 0.2, 0.15).lineWidth(2.5).dash([]);
    p.line(longX - eaveG, elevY + flrH + eavH, longX + gL + eaveG, elevY + flrH + eavH);
    // Front and rear culata returns
    p.line(longX - eaveG, elevY + flrH + eavH, longX - eaveG, elevY + flrH + eavH + 10);
    p.line(longX + gL + eaveG, elevY + flrH + eavH, longX + gL + eaveG, elevY + flrH + eavH + 10);
    p.restore();

    // 7. Raised Monitor / Continuous Ridge Vent (Linternilla continua en cumbrera)
    p.save();
    // Low ridge line behind
    p.strokeColor(0.5, 0.55, 0.6).lineWidth(0.8).dash([4, 2]);
    p.line(longX - eaveG, elevY + flrH + lowRdH, longX + gL + eaveG, elevY + flrH + lowRdH);
    // Vertical opening (30 cm) with mesh
    p.strokeColor(0.1, 0.6, 0.3).lineWidth(0.8).dash([2, 1]);
    p.rect(longX - eaveG, elevY + flrH + lowRdH, gL + 2 * eaveG, 0.30 * scaleLong, false, false);
    // Top ridge cap continuous profile
    p.strokeColor(0.7, 0.2, 0.15).lineWidth(2.5).dash([]);
    p.line(longX - eaveG - 5, elevY + flrH + ridgeH, longX + gL + eaveG + 5, elevY + flrH + ridgeH);
    p.fillColor(0.7, 0.2, 0.15).text('Caballete alzado continuo (Salida vertical de aire: 30 cm con malla)', longX + gL / 2, elevY + flrH + ridgeH + 6, 7, '/F2', 'center');
    p.restore();

    // 8. Dimensions & Grid Bubbles for Elevation
    const dimYElev = elevY + flrH + ridgeH + 25;
    for (let i = 0; i < 4; i++) {
      p.dimH(longX + i * 3 * scaleLong, longX + (i + 1) * 3 * scaleLong, dimYElev, '3.00 m');
    }
    p.dimH(longX, longX + gL, dimYElev + 15, '12.00 m (LARGO GALPÓN)');
    p.dimH(longX - eaveG, longX + gL + eaveG, dimYElev + 30, '13.20 m (LARGO CUBIERTA CON ALEROS)');

    // Vertical heights on right:
    const dimXLongR = longX + gL + eaveG + 20;
    p.dimV(elevY, elevY + flrH, dimXLongR, '0.20 m');
    p.dimV(elevY + flrH, elevY + flrH + blkH, dimXLongR, '0.40 m');
    p.dimV(elevY + flrH, elevY + flrH + eavH, dimXLongR + 15, '3.00 m (Pared lateral)');
    p.dimV(elevY + flrH, elevY + flrH + ridgeH, dimXLongR + 32, '4.00 m (Cumbrera)');

    // Grid bubbles at base
    const axisLabels = ['1', '2', '3', '4', '5'];
    for (let i = 0; i < 5; i++) {
      const cx = longX + i * 3.0 * scaleLong;
      p.axisBubble(cx, elevY - 25, axisLabels[i]);
    }

    // -------------------------------------------------------------
    // BOTTOM HALF: CORTE LONGITUDINAL B-B' (SECCIÓN POR EJE CENTRAL)
    // -------------------------------------------------------------
    const secBY = 110;

    // Ground
    p.save();
    p.strokeColor(0.4, 0.4, 0.4).lineWidth(1.2);
    p.line(longX - eaveG - 30, secBY, longX + gL + eaveG + 30, secBY);
    p.fillColor(0.3, 0.3, 0.3).text('N.T.N. ±0.00 m', longX - eaveG - 25, secBY - 12, 6, '/F2');
    p.restore();

    // Raised concrete slab with longitudinal 1% slope towards end drain
    p.save();
    p.fillColor(0.92, 0.93, 0.94).strokeColor(0.1, 0.15, 0.2).lineWidth(1.0);
    p.rect(longX, secBY, gL, flrH, true, true);
    p.fillColor(0.2, 0.3, 0.4).text('Losa de concreto e=8cm sobre base compactada | Desnivel longitudinal 1.0%', longX + gL / 2, secBY + flrH / 2 - 2, 6, '/F2', 'center');
    p.restore();

    // Trusses shown in cross-section at each axis (1..5)
    p.save();
    p.strokeColor(0.3, 0.35, 0.4).lineWidth(1.5);
    for (let i = 0; i < 5; i++) {
      const tx = longX + i * 3.0 * scaleLong;
      // Central kingpost of truss
      p.line(tx, secBY + flrH + eavH, tx, secBY + flrH + lowRdH);
      // Monitor post
      p.line(tx, secBY + flrH + lowRdH, tx, secBY + flrH + ridgeH);
      p.circle(tx, secBY + flrH + eavH, 2.5, true, true);
    }
    // Longitudinal purlins (correas de techo)
    p.strokeColor(0.5, 0.5, 0.5).lineWidth(1.0);
    p.line(longX - eaveG, secBY + flrH + lowRdH, longX + gL + eaveG, secBY + flrH + lowRdH);
    p.line(longX - eaveG, secBY + flrH + ridgeH, longX + gL + eaveG, secBY + flrH + ridgeH);

    // Hanging equipment lines (Pulley suspension system for feeders & drinkers)
    p.strokeColor(0.8, 0.4, 0.1).lineWidth(0.8).dash([3, 2]);
    p.line(longX + 0.5 * scaleLong, secBY + flrH + 1.2 * scaleLong, longX + 11.5 * scaleLong, secBY + flrH + 1.2 * scaleLong);
    p.strokeColor(0.1, 0.4, 0.8).lineWidth(0.8);
    p.line(longX + 0.5 * scaleLong, secBY + flrH + 0.8 * scaleLong, longX + 11.5 * scaleLong, secBY + flrH + 0.8 * scaleLong);

    // Feeders and drinkers symbols suspended
    for (let k = 0; k < 6; k++) {
      const fX = longX + (1.2 + k * 1.9) * scaleLong;
      // cable
      p.strokeColor(0.5, 0.5, 0.5).lineWidth(0.5).dash([]).line(fX, secBY + flrH + eavH, fX, secBY + flrH + 1.2 * scaleLong);
      p.fillColor(0.9, 0.6, 0.2).circle(fX, secBY + flrH + 1.2 * scaleLong, 4, true, true);
    }
    for (let k = 0; k < 5; k++) {
      const dX = longX + (2.0 + k * 2.0) * scaleLong;
      p.strokeColor(0.5, 0.5, 0.5).lineWidth(0.5).dash([]).line(dX, secBY + flrH + eavH, dX, secBY + flrH + 0.8 * scaleLong);
      p.fillColor(0.2, 0.6, 0.9).rect(dX - 3, secBY + flrH + 0.8 * scaleLong - 3, 6, 6, true, true);
    }

    p.fillColor(0.8, 0.4, 0.1).text('Línea de comederos regulables con cable de acero y malacate', longX + 3.0 * scaleLong, secBY + flrH + 1.2 * scaleLong + 6, 6, '/F2');
    p.fillColor(0.1, 0.4, 0.8).text('Línea de bebederos automáticos regulables', longX + 3.0 * scaleLong, secBY + flrH + 0.8 * scaleLong - 10, 6, '/F2');
    p.restore();

    p.fillColor(0.08, 0.15, 0.3).text('CORTE LONGITUDINAL B-B\' (SECCIÓN POR EJE CENTRAL)', longX + gL / 2, secBY - 24, 8, '/F2', 'center');
  }

  // =========================================================================
  // LÁMINA 4: DET-01 - DETALLES CONSTRUCTIVOS, BIOCLIMÁTICOS Y ESPECIFICACIONES
  // =========================================================================
  {
    const p = engine.addPage();
    p.drawSheetBorderAndTitleBlock(
      4, 4, 'DET-01',
      'DETALLES CONSTRUCTIVOS, BIOCLIMÁTICOS Y ESPECIFICACIONES TÉCNICAS',
      'Detalle Caballete Alzado, Murete de Bloque, Anclajes y Parámetros Zootécnicos',
      'VARIAS'
    );

    // Divide sheet into 4 quadrants
    // Top-Left: Detalle 1 - Caballete Alzado (Linternilla Bioclimática)
    // Bottom-Left: Detalle 2 - Murete de Bloque, Viga de Corona y Andén
    // Top-Right: Detalle 3 - Alerón de 1.20m, Cortina y Ángulo Solar
    // Bottom-Right: Cuadro de Especificaciones Técnicas y Parámetros

    // -------------------------------------------------------------
    // DETALLE 1: CABALLETE ALZADO / LINTERNILLA (TOP-LEFT)
    // -------------------------------------------------------------
    {
      const d1X = 50;
      const d1Y = 320;
      const d1W = 350;
      const d1H = 220;

      p.save();
      // Box frame
      p.fillColor(0.98, 0.98, 0.99).strokeColor(0.7, 0.75, 0.8).lineWidth(0.8);
      p.rect(d1X, d1Y, d1W, d1H, true, true);
      p.fillColor(0.08, 0.15, 0.3).text('DETALLE D-01: CABALLETE ALZADO (LINTERNILLA DE VENTILACIÓN)', d1X + 12, d1Y + d1H - 16, 8, '/F2');
      p.fillColor(0.4, 0.45, 0.5).text('Escala 1:15 | Convección Térmica y Salida de Aire Caliente', d1X + 12, d1Y + d1H - 26, 6.5, '/F1');

      // Drawing Detail D-01:
      const cX = d1X + 175;
      const cY = d1Y + 75;

      // Lower roof slopes
      p.strokeColor(0.7, 0.2, 0.15).lineWidth(3.0);
      // Left slope
      p.line(cX - 140, cY - 25, cX - 35, cY);
      // Right slope
      p.line(cX + 140, cY - 25, cX + 35, cY);

      // Vertical posts for monitor
      p.strokeColor(0.2, 0.25, 0.3).lineWidth(2.0);
      p.line(cX - 35, cY, cX - 35, cY + 50);
      p.line(cX + 35, cY, cX + 35, cY + 50);

      // Wire mesh in the 30 cm opening
      p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.0).dash([3, 2]);
      p.line(cX - 35, cY, cX - 35, cY + 50);
      p.line(cX + 35, cY, cX + 35, cY + 50);

      // Upper ridge cap (Caballete superior) with 40 cm overlap
      // Overlap extends 45 pt beyond each side
      p.strokeColor(0.7, 0.2, 0.15).lineWidth(3.5).dash([]);
      p.line(cX - 80, cY + 45, cX, cY + 55);
      p.line(cX, cY + 55, cX + 80, cY + 45);

      // Dimensioning of D-01
      p.dimV(cY, cY + 50, cX - 45, '30 cm');
      p.fillColor(0.1, 0.5, 0.2).text('Abertura Vertical: 30 cm (Salida de aire)', cX - 50, cY + 22, 6, '/F2', 'right');

      p.dimH(cX - 80, cX - 35, cY + 65, '40 cm');
      p.fillColor(0.7, 0.2, 0.15).text('Traslape: 40 cm', cX - 58, cY + 73, 6, '/F2', 'center');

      p.dimH(cX + 35, cX + 80, cY + 65, '40 cm');
      p.fillColor(0.7, 0.2, 0.15).text('Traslape: 40 cm', cX + 58, cY + 73, 6, '/F2', 'center');

      // Convection thermal arrows
      p.strokeColor(0.85, 0.25, 0.1).fillColor(0.85, 0.25, 0.1).lineWidth(1.2);
      p.line(cX - 15, cY - 15, cX - 25, cY + 25);
      p.polygon([[cX - 28, cY + 30], [cX - 30, cY + 22], [cX - 23, cY + 23]], true, true);
      p.line(cX + 15, cY - 15, cX + 25, cY + 25);
      p.polygon([[cX + 28, cY + 30], [cX + 30, cY + 22], [cX + 23, cY + 23]], true, true);
      p.text('Flujo térmico ascendente', cX, cY - 10, 6, '/F2', 'center');

      // Notes
      p.fillColor(0.2, 0.25, 0.3);
      p.text('• Malla pajarera galvanizada de 1/2" anti-pájaros y murciélagos en abertura.', d1X + 15, d1Y + 20, 6, '/F1');
      p.text('• El traslape de 40 cm garantiza estanqueidad total contra lluvia con viento oblicuo.', d1X + 15, d1Y + 10, 6, '/F1');
      p.restore();
    }

    // -------------------------------------------------------------
    // DETALLE 2: MURETE DE BLOQUE, VIGA Y ANDÉN (BOTTOM-LEFT)
    // -------------------------------------------------------------
    {
      const d2X = 50;
      const d2Y = 80;
      const d2W = 350;
      const d2H = 225;

      p.save();
      p.fillColor(0.98, 0.98, 0.99).strokeColor(0.7, 0.75, 0.8).lineWidth(0.8);
      p.rect(d2X, d2Y, d2W, d2H, true, true);
      p.fillColor(0.08, 0.15, 0.3).text('DETALLE D-02: PARED DE BLOQUES (40 cm), SOLERA Y ANDÉN', d2X + 12, d2Y + d2H - 16, 8, '/F2');
      p.fillColor(0.4, 0.45, 0.5).text('Escala 1:15 | Sobre-elevación (+0.20m), Impermeabilización y Anclaje', d2X + 12, d2Y + d2H - 26, 6.5, '/F1');

      const bX = d2X + 140;
      const bY = d2Y + 50;

      // Natural ground
      p.strokeColor(0.4, 0.4, 0.4).lineWidth(1.2);
      p.line(d2X + 15, bY, d2X + d2W - 15, bY);
      p.fillColor(0.3, 0.3, 0.3).text('N.T.N. ±0.00 m', d2X + 20, bY - 12, 6, '/F2');

      // Raised compact fill (20 cm)
      p.fillColor(0.91, 0.92, 0.93).strokeColor(0.2, 0.25, 0.3).lineWidth(1.0);
      p.rect(bX, bY, 175, 25, true, true);
      p.text('N.P.T. +0.20 m', bX + 60, bY + 30, 6.5, '/F2');

      // Concrete floor slab (8 cm)
      p.fillColor(0.85, 0.86, 0.88);
      p.rect(bX, bY + 25, 175, 12, true, true);
      p.fillColor(0.2, 0.2, 0.2).text('Losa concreto e=8cm con malla electrosoldada', bX + 35, bY + 28, 5.5, '/F1');

      // Exterior concrete sidewalk (Andén de 60 cm)
      p.fillColor(0.88, 0.89, 0.91).strokeColor(0.2, 0.25, 0.3).lineWidth(1.0);
      p.polygon([[bX - 60, bY], [bX, bY + 25], [bX, bY]], true, true);
      p.fillColor(0.2, 0.2, 0.2).text('Andén sanitario (60 cm)', bX - 58, bY + 12, 5.5, '/F2');
      p.text('Pendiente 2% hacia afuera', bX - 58, bY + 3, 5, '/F3');

      // Block wall: 40 cm height (2 rows of 20 cm blocks)
      p.fillColor(0.8, 0.83, 0.86).strokeColor(0.15, 0.2, 0.25).lineWidth(1.2);
      p.rect(bX, bY + 37, 24, 25, true, true); // hilada 1
      p.rect(bX, bY + 62, 24, 25, true, true); // hilada 2
      // Concrete tie beam (Viga de corona / solera 15x15 cm)
      p.fillColor(0.75, 0.78, 0.82);
      p.rect(bX, bY + 87, 24, 15, true, true);
      p.fillColor(0.1, 0.15, 0.2).text('Viga de amarre / solera (15x15 cm)', bX + 28, bY + 92, 5.5, '/F2');

      // Wire mesh anchor & post
      p.strokeColor(0.1, 0.15, 0.25).lineWidth(2.0);
      p.line(bX + 12, bY + 87, bX + 12, bY + 140);
      p.strokeColor(0.1, 0.6, 0.3).lineWidth(1.0).dash([3, 2]);
      p.line(bX + 12, bY + 102, bX + 12, bY + 140);
      p.fillColor(0.1, 0.6, 0.3).text('Malla pajarera galvanizada hacia alero', bX + 16, bY + 120, 5.5, '/F2');

      // Dimensions
      p.dimV(bY, bY + 25, bX - 10, '20 cm');
      p.dimV(bY + 37, bY + 87, bX - 10, '40 cm');
      p.dimH(bX - 60, bX, bY - 8, '60 cm');

      p.restore();
    }

    // -------------------------------------------------------------
    // DETALLE 3: ALERÓN 1.20 m Y PROTECCIÓN SOLAR (TOP-RIGHT)
    // -------------------------------------------------------------
    {
      const d3X = 420;
      const d3Y = 320;
      const d3W = 370;
      const d3H = 220;

      p.save();
      p.fillColor(0.98, 0.98, 0.99).strokeColor(0.7, 0.75, 0.8).lineWidth(0.8);
      p.rect(d3X, d3Y, d3W, d3H, true, true);
      p.fillColor(0.08, 0.15, 0.3).text('DETALLE D-03: ALERÓN LATERAL (1.20 m) Y SOMBRA BIOCLIMÁTICA', d3X + 12, d3Y + d3H - 16, 8, '/F2');
      p.fillColor(0.4, 0.45, 0.5).text('Escala 1:25 | Protección Contra Radiación Solar Cenital y Lluvia Torrencial', d3X + 12, d3Y + d3H - 26, 6.5, '/F1');

      const aX = d3X + 220;
      const aY = d3Y + 50;

      // Galpon wall line (3.00m height)
      p.strokeColor(0.2, 0.25, 0.3).lineWidth(1.5);
      p.line(aX, aY, aX, aY + 110);
      p.fillColor(0.2, 0.25, 0.3).text('Pared lateral (h = 3.00 m)', aX + 5, aY + 50, 6, '/F2');

      // Dwarf wall (40 cm)
      p.fillColor(0.8, 0.83, 0.86).rect(aX - 5, aY, 10, 18, true, true);

      // Roof rafter and 1.20m overhang
      p.strokeColor(0.7, 0.2, 0.15).lineWidth(3.0);
      // Overhang slopes down from aX to aX - 60
      p.line(aX + 80, aY + 130, aX - 65, aY + 95);
      p.dimH(aX - 65, aX, aY + 140, '1.20 m');
      p.fillColor(0.7, 0.2, 0.15).text('Alerón lateral: 1.20 m', aX - 32, aY + 148, 6.5, '/F2', 'center');

      // Sun rays at high angle (65° - 75° typical for tropical midday)
      p.strokeColor(0.95, 0.7, 0.0).lineWidth(1.5).dash([4, 2]);
      p.line(aX - 110, aY + 180, aX - 5, aY);
      p.fillColor(0.95, 0.65, 0.0).circle(aX - 110, aY + 180, 10, true, true);
      p.fillColor(0.8, 0.5, 0.0).text('Sol Cenital (>65°)', aX - 110, aY + 195, 6, '/F2', 'center');

      // Shadow zone representation
      p.fillColor(0.85, 0.95, 0.85).strokeColor(0.4, 0.7, 0.4).lineWidth(0.5).dash([2, 2]);
      p.polygon([[aX - 65, aY + 95], [aX, aY + 110], [aX, aY], [aX - 5, aY]], true, true);
      p.fillColor(0.1, 0.5, 0.2).text('ZONA DE SOMBRA Y PROTECCIÓN TÉRMICA TOTAL', aX - 30, aY + 25, 5.5, '/F2', 'center');

      // Rain protection angle
      p.strokeColor(0.2, 0.5, 0.8).lineWidth(1.0).dash([3, 3]);
      p.line(aX - 90, aY + 140, aX - 10, aY + 10);
      p.fillColor(0.2, 0.5, 0.8).text('Lluvia con viento oblicuo repelida fuera del andén', aX - 30, aY + 8, 5.5, '/F3', 'center');

      p.restore();
    }

    // -------------------------------------------------------------
    // CUADRO DE ESPECIFICACIONES TÉCNICAS (BOTTOM-RIGHT)
    // -------------------------------------------------------------
    {
      const d4X = 420;
      const d4Y = 80;
      const d4W = 370;
      const d4H = 225;

      p.save();
      p.fillColor(0.98, 0.98, 0.99).strokeColor(0.7, 0.75, 0.8).lineWidth(0.8);
      p.rect(d4X, d4Y, d4W, d4H, true, true);
      p.fillColor(0.08, 0.15, 0.3).text('CUADRO DE ESPECIFICACIONES TÉCNICAS Y ZOOTÉCNICAS', d4X + 12, d4Y + d4H - 16, 8, '/F2');
      p.fillColor(0.4, 0.45, 0.5).text('Parámetros de Diseño para 360 Gallinas en Clima Cálido', d4X + 12, d4Y + d4H - 26, 6.5, '/F1');

      // Table layout
      const tX = d4X + 10;
      const tY = d4Y + 10;
      const tW = d4W - 20;
      const rowH = 13.5;
      const rows = [
        ['PARÁMETRO', 'ESPECIFICACIÓN TÉCNICA / VALOR'],
        ['Capacidad del Galpón', '360 Gallinas ponedoras / camperas'],
        ['Densidad Animal', '5.0 Gallinas / m² (Óptimo confort térmico)'],
        ['Área Libre del Galpón', '72.00 m² (6.00 m de ancho x 12.00 m de largo)'],
        ['Área Total de Cubierta', '110.88 m² (8.40 m ancho x 13.20 m largo con aleros)'],
        ['Orientación Eje Longitudinal', 'ESTE - OESTE (Mínima exposición solar lateral)'],
        ['Altura al Alero / Paredes', '3.00 m desde N.P.T. (+3.20 m s.n.t.)'],
        ['Altura Caballete Bajo / Alto', '3.70 m (bajo) / 4.00 m (alzado cumbrera)'],
        ['Linternilla / Salida de Aire', 'Abertura vertical 30 cm con traslape de 40 cm'],
        ['Alerones (Voladizos)', 'Laterales: 1.20 m | Culata (frontal/trasera): 0.60 m'],
        ['Pared Perimetral de Bloque', 'Altura: 0.40 m (2 hiladas) + viga de amarre'],
        ['Piso y Elevación Sanitaria', 'Concreto e=8cm, desnivel 1.0%, sobre-elevado +20 cm'],
        ['Equipamiento: Nidales', '72 a 80 huecos (1 nido / 5 aves) en 2 baterías'],
        ['Equipamiento: Comederos/Beb.', '12 tolvas colgantes | 4 campanas o 40 niples']
      ];

      // Draw table
      for (let r = 0; r < rows.length; r++) {
        const curY = tY + (rows.length - 1 - r) * rowH;
        if (r === 0) {
          // Header row
          p.fillColor(0.1, 0.2, 0.4).rect(tX, curY, tW, rowH, true, true);
          p.fillColor(1, 1, 1);
          p.text(rows[r][0], tX + 8, curY + 3.5, 6.5, '/F2');
          p.text(rows[r][1], tX + 130, curY + 3.5, 6.5, '/F2');
        } else {
          // Normal rows
          p.fillColor(r % 2 === 1 ? 0.95 : 1.0, r % 2 === 1 ? 0.96 : 1.0, r % 2 === 1 ? 0.98 : 1.0);
          p.rect(tX, curY, tW, rowH, true, true);
          p.strokeColor(0.85, 0.88, 0.9).lineWidth(0.5).line(tX, curY, tX + tW, curY);
          p.fillColor(0.15, 0.2, 0.3);
          p.text(rows[r][0], tX + 6, curY + 3.5, 6, '/F2');
          p.fillColor(0.25, 0.3, 0.4);
          p.text(rows[r][1], tX + 130, curY + 3.5, 6, '/F1');
        }
      }
      p.strokeColor(0.4, 0.45, 0.55).lineWidth(0.8).rect(tX, tY, tW, rows.length * rowH, true, false);
      p.line(tX + 125, tY, tX + 125, tY + rows.length * rowH);

      p.restore();
    }
  }

  // Write out file
  const pdfBytes = engine.build();
  const outPath = 'C:/Users/luisd/.gemini/antigravity/scratch/galpon-avicola/Planos_Galpon_360_Gallinas_Clima_Calido.pdf';
  fs.writeFileSync(outPath, pdfBytes);
  console.log('Successfully generated architectural blueprints PDF at:', outPath);
  console.log('File size:', pdfBytes.length, 'bytes');
  return outPath;
}

generateAllPlans();
