import {
  type SwmmProject,
  type RainGage,
  type Subcatchment,
  type SubareaData,
  type InfiltrationData,
  type Junction,
  type Outfall,
  type Divider,
  type StorageUnit,
  type Conduit,
  type Pump,
  type Orifice,
  type Weir,
  type Outlet,
  type XSection,
  type LossData,
  type CurvePoint,
  type TimeSeriesPoint,
  type PatternData,
  type Pollutant,
  type LandUse,
  type DWFEntry,
  type MapLabel,
  createEmptyProject,
} from './swmm-types';

function splitFields(line: string): string[] {
  return line.trim().split(/\s+/);
}

function parseFloat2(s: string | undefined): number {
  if (!s) return 0;
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function extractSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentSection = '';

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const sectionMatch = line.match(/^\[([A-Z_]+)\]/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toUpperCase();
      sections[currentSection] = [];
      continue;
    }
    if (currentSection && line.trim() && !line.startsWith(';;')) {
      sections[currentSection].push(line);
    }
  }
  return sections;
}

function parseTitle(lines: string[]): string[] {
  return lines.filter(l => l.trim());
}

function parseOptions(lines: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  for (const line of lines) {
    const parts = splitFields(line);
    if (parts.length >= 2) {
      opts[parts[0].toUpperCase()] = parts.slice(1).join(' ');
    }
  }
  return opts;
}

function parseRaingages(lines: string[]): RainGage[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      format: p[1] || 'INTENSITY',
      interval: p[2] || '0:05',
      scf: parseFloat2(p[3]) || 1.0,
      sourceType: p[4] || '',
      sourceName: p[5] || '',
      stationId: p[6],
      units: p[7],
    };
  }).filter(r => r.id);
}

function parseSubcatchments(lines: string[]): Subcatchment[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      rainGage: p[1] || '',
      outlet: p[2] || '',
      area: parseFloat2(p[3]),
      pctImperv: parseFloat2(p[4]),
      width: parseFloat2(p[5]),
      slope: parseFloat2(p[6]),
      curbLen: parseFloat2(p[7]),
      snowPack: p[8],
    };
  }).filter(s => s.id);
}

function parseSubareas(lines: string[]): Record<string, SubareaData> {
  const result: Record<string, SubareaData> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0]) {
      result[p[0]] = {
        nImperv: parseFloat2(p[1]),
        nPerv: parseFloat2(p[2]),
        sImperv: parseFloat2(p[3]),
        sPerv: parseFloat2(p[4]),
        pctZero: parseFloat2(p[5]),
        routeTo: p[6] || 'OUTLET',
        pctRouted: p[7] ? parseFloat2(p[7]) : undefined,
      };
    }
  }
  return result;
}

function parseInfiltration(lines: string[]): Record<string, InfiltrationData> {
  const result: Record<string, InfiltrationData> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0]) {
      result[p[0]] = {
        values: p.slice(1).map(parseFloat2),
      };
    }
  }
  return result;
}

function parseJunctions(lines: string[]): Junction[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      elevation: parseFloat2(p[1]),
      maxDepth: parseFloat2(p[2]),
      initDepth: parseFloat2(p[3]),
      surDepth: parseFloat2(p[4]),
      aponded: parseFloat2(p[5]),
    };
  }).filter(j => j.id);
}

function parseOutfalls(lines: string[]): Outfall[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      elevation: parseFloat2(p[1]),
      type: p[2] || 'FREE',
      stageData: p[3],
      gated: p[4] || 'NO',
      routeTo: p[5],
    };
  }).filter(o => o.id);
}

function parseDividers(lines: string[]): Divider[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      elevation: parseFloat2(p[1]),
      divertedLink: p[2] || '',
      type: p[3] || 'CUTOFF',
      cutoffFlow: p[4] ? parseFloat2(p[4]) : undefined,
      curve: p[5],
      maxDepth: parseFloat2(p[6]),
      initDepth: parseFloat2(p[7]),
      surDepth: parseFloat2(p[8]),
      aponded: parseFloat2(p[9]),
    };
  }).filter(d => d.id);
}

function parseStorage(lines: string[]): StorageUnit[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      elevation: parseFloat2(p[1]),
      maxDepth: parseFloat2(p[2]),
      initDepth: parseFloat2(p[3]),
      shape: p[4] || 'TABULAR',
      curveParams: p.slice(5, 8),
      surDepth: parseFloat2(p[8]),
      fevap: parseFloat2(p[9]),
      psi: p[10] ? parseFloat2(p[10]) : undefined,
      ksat: p[11] ? parseFloat2(p[11]) : undefined,
      imd: p[12] ? parseFloat2(p[12]) : undefined,
    };
  }).filter(s => s.id);
}

function parseConduits(lines: string[]): Conduit[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      fromNode: p[1] || '',
      toNode: p[2] || '',
      length: parseFloat2(p[3]),
      roughness: parseFloat2(p[4]),
      inOffset: parseFloat2(p[5]),
      outOffset: parseFloat2(p[6]),
      initFlow: parseFloat2(p[7]),
      maxFlow: parseFloat2(p[8]),
    };
  }).filter(c => c.id);
}

function parsePumps(lines: string[]): Pump[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      fromNode: p[1] || '',
      toNode: p[2] || '',
      pumpCurve: p[3] || '',
      status: p[4] || 'ON',
      startupDepth: p[5] ? parseFloat2(p[5]) : undefined,
      shutoffDepth: p[6] ? parseFloat2(p[6]) : undefined,
    };
  }).filter(p => p.id);
}

function parseOrifices(lines: string[]): Orifice[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      fromNode: p[1] || '',
      toNode: p[2] || '',
      type: p[3] || 'SIDE',
      offset: parseFloat2(p[4]),
      cd: parseFloat2(p[5]) || 0.65,
      gated: p[6] || 'NO',
      closeTime: parseFloat2(p[7]),
    };
  }).filter(o => o.id);
}

function parseWeirs(lines: string[]): Weir[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      fromNode: p[1] || '',
      toNode: p[2] || '',
      type: p[3] || 'TRANSVERSE',
      crestHeight: parseFloat2(p[4]),
      cd: parseFloat2(p[5]) || 3.33,
      gated: p[6] || 'NO',
      ec: parseFloat2(p[7]),
      cd2: parseFloat2(p[8]),
      surcharge: p[9] || 'YES',
      width: p[10] ? parseFloat2(p[10]) : undefined,
    };
  }).filter(w => w.id);
}

function parseOutlets(lines: string[]): Outlet[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      fromNode: p[1] || '',
      toNode: p[2] || '',
      offset: parseFloat2(p[3]),
      type: p[4] || 'TABULAR/HEAD',
      curveOrTable: p[5] || '',
    };
  }).filter(o => o.id);
}

function parseXsections(lines: string[]): Record<string, XSection> {
  const result: Record<string, XSection> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0]) {
      result[p[0]] = {
        linkId: p[0],
        shape: p[1] || 'CIRCULAR',
        geom1: parseFloat2(p[2]),
        geom2: parseFloat2(p[3]),
        geom3: parseFloat2(p[4]),
        geom4: parseFloat2(p[5]),
        barrels: parseFloat2(p[6]) || 1,
        culvert: p[7],
      };
    }
  }
  return result;
}

function parseLosses(lines: string[]): Record<string, LossData> {
  const result: Record<string, LossData> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0]) {
      result[p[0]] = {
        linkId: p[0],
        entryLoss: parseFloat2(p[1]),
        exitLoss: parseFloat2(p[2]),
        avgLoss: parseFloat2(p[3]),
        flapGate: p[4] || 'NO',
        seepageRate: parseFloat2(p[5]),
      };
    }
  }
  return result;
}

function parseCurves(lines: string[]): Record<string, CurvePoint[]> {
  const result: Record<string, CurvePoint[]> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 3) {
      const name = p[0];
      let xIdx = 1;
      if (isNaN(parseFloat(p[1]))) {
        xIdx = 2;
      }
      if (!result[name]) result[name] = [];
      result[name].push({
        x: parseFloat2(p[xIdx]),
        y: parseFloat2(p[xIdx + 1]),
      });
    }
  }
  return result;
}

function parseTimeseries(lines: string[]): Record<string, TimeSeriesPoint[]> {
  const result: Record<string, TimeSeriesPoint[]> = {};
  let currentName = '';
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 2) {
      if (p[0] === 'FILE') continue;
      if (p.length >= 3 && isNaN(parseFloat(p[1]))) {
        currentName = p[0];
        if (!result[currentName]) result[currentName] = [];
        result[currentName].push({
          dateTime: p[1],
          value: parseFloat2(p[2]),
        });
      } else if (p.length >= 3) {
        currentName = p[0];
        if (!result[currentName]) result[currentName] = [];
        result[currentName].push({
          dateTime: p[1],
          value: parseFloat2(p[2]),
        });
      } else {
        if (currentName && result[currentName]) {
          result[currentName].push({
            dateTime: p[0],
            value: parseFloat2(p[1]),
          });
        }
      }
    }
  }
  return result;
}

function parsePatterns(lines: string[]): Record<string, PatternData> {
  const result: Record<string, PatternData> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 2) {
      const name = p[0];
      if (!result[name]) {
        result[name] = { type: p[1], multipliers: [] };
        if (!isNaN(parseFloat(p[1]))) {
          result[name].type = 'MONTHLY';
          result[name].multipliers = p.slice(1).map(parseFloat2);
        } else {
          result[name].multipliers = p.slice(2).map(parseFloat2);
        }
      } else {
        const startIdx = isNaN(parseFloat(p[1])) ? 2 : 1;
        result[name].multipliers.push(...p.slice(startIdx).map(parseFloat2));
      }
    }
  }
  return result;
}

function parseControls(lines: string[]): string[] {
  return lines;
}

function parseDWF(lines: string[]): DWFEntry[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      nodeId: p[0],
      constituent: p[1] || 'FLOW',
      baseline: parseFloat2(p[2]),
      patterns: p.slice(3).filter(s => s),
    };
  }).filter(d => d.nodeId);
}

function parsePollutants(lines: string[]): Pollutant[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      units: p[1] || 'MG/L',
      cRain: parseFloat2(p[2]),
      cGW: parseFloat2(p[3]),
      cRDII: parseFloat2(p[4]),
      kDecay: parseFloat2(p[5]),
      snowOnly: p[6] || 'NO',
      coPollutant: p[7] || '*',
      coFraction: parseFloat2(p[8]),
      cDWF: parseFloat2(p[9]),
      cInit: parseFloat2(p[10]),
    };
  }).filter(p => p.id);
}

function parseLanduses(lines: string[]): LandUse[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0],
      sweepInterval: parseFloat2(p[1]),
      sweepAvail: parseFloat2(p[2]),
      sweepLast: parseFloat2(p[3]),
    };
  }).filter(l => l.id);
}

function parseCoordinates(lines: string[]): Record<string, [number, number]> {
  const result: Record<string, [number, number]> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 3) {
      result[p[0]] = [parseFloat2(p[1]), parseFloat2(p[2])];
    }
  }
  return result;
}

function parseVertices(lines: string[]): Record<string, [number, number][]> {
  const result: Record<string, [number, number][]> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 3) {
      if (!result[p[0]]) result[p[0]] = [];
      result[p[0]].push([parseFloat2(p[1]), parseFloat2(p[2])]);
    }
  }
  return result;
}

function parsePolygons(lines: string[]): Record<string, [number, number][]> {
  const result: Record<string, [number, number][]> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 3) {
      if (!result[p[0]]) result[p[0]] = [];
      result[p[0]].push([parseFloat2(p[1]), parseFloat2(p[2])]);
    }
  }
  return result;
}

function parseSymbols(lines: string[]): Record<string, [number, number]> {
  const result: Record<string, [number, number]> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 3) {
      result[p[0]] = [parseFloat2(p[1]), parseFloat2(p[2])];
    }
  }
  return result;
}

function parseLabels(lines: string[]): MapLabel[] {
  return lines.map(line => {
    const match = line.match(/^\s*([\d.+-]+)\s+([\d.+-]+)\s+"([^"]*)"\s*(.*)/);
    if (match) {
      const rest = splitFields(match[4]);
      return {
        x: parseFloat(match[1]),
        y: parseFloat(match[2]),
        text: match[3],
        anchorNode: rest[0] || undefined,
        font: rest[1] || undefined,
        size: rest[2] ? parseInt(rest[2]) : undefined,
        bold: rest[3] === '1',
        italic: rest[4] === '1',
      };
    }
    const p = splitFields(line);
    return {
      x: parseFloat2(p[0]),
      y: parseFloat2(p[1]),
      text: p.slice(2).join(' ').replace(/"/g, ''),
    };
  }).filter(l => !isNaN(l.x) && !isNaN(l.y));
}

function parseMapExtent(lines: string[]): { x1: number; y1: number; x2: number; y2: number } | null {
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0] === 'DIMENSIONS' && p.length >= 5) {
      return {
        x1: parseFloat2(p[1]),
        y1: parseFloat2(p[2]),
        x2: parseFloat2(p[3]),
        y2: parseFloat2(p[4]),
      };
    }
  }
  return null;
}

export function parseInpFile(text: string): SwmmProject {
  const sections = extractSections(text);
  const project = createEmptyProject();

  const knownSections = new Set([
    'TITLE', 'OPTIONS', 'REPORT', 'RAINGAGES',
    'SUBCATCHMENTS', 'SUBAREAS', 'INFILTRATION',
    'JUNCTIONS', 'OUTFALLS', 'DIVIDERS', 'STORAGE',
    'CONDUITS', 'PUMPS', 'ORIFICES', 'WEIRS', 'OUTLETS',
    'XSECTIONS', 'LOSSES', 'CURVES', 'TIMESERIES', 'PATTERNS',
    'CONTROLS', 'DWF', 'POLLUTANTS', 'LANDUSES',
    'COORDINATES', 'VERTICES', 'POLYGONS', 'SYMBOLS', 'LABELS', 'MAP',
  ]);

  for (const [section, lines] of Object.entries(sections)) {
    switch (section) {
      case 'TITLE':
        project.title = parseTitle(lines);
        break;
      case 'OPTIONS':
        project.options = parseOptions(lines);
        break;
      case 'REPORT':
        project.reportOptions = parseOptions(lines);
        break;
      case 'RAINGAGES':
        project.raingages = parseRaingages(lines);
        break;
      case 'SUBCATCHMENTS':
        project.subcatchments = parseSubcatchments(lines);
        break;
      case 'SUBAREAS':
        project.subareas = parseSubareas(lines);
        break;
      case 'INFILTRATION':
        project.infiltration = parseInfiltration(lines);
        break;
      case 'JUNCTIONS':
        project.junctions = parseJunctions(lines);
        break;
      case 'OUTFALLS':
        project.outfalls = parseOutfalls(lines);
        break;
      case 'DIVIDERS':
        project.dividers = parseDividers(lines);
        break;
      case 'STORAGE':
        project.storageUnits = parseStorage(lines);
        break;
      case 'CONDUITS':
        project.conduits = parseConduits(lines);
        break;
      case 'PUMPS':
        project.pumps = parsePumps(lines);
        break;
      case 'ORIFICES':
        project.orifices = parseOrifices(lines);
        break;
      case 'WEIRS':
        project.weirs = parseWeirs(lines);
        break;
      case 'OUTLETS':
        project.outlets = parseOutlets(lines);
        break;
      case 'XSECTIONS':
        project.xsections = parseXsections(lines);
        break;
      case 'LOSSES':
        project.losses = parseLosses(lines);
        break;
      case 'CURVES':
        project.curves = parseCurves(lines);
        break;
      case 'TIMESERIES':
        project.timeseries = parseTimeseries(lines);
        break;
      case 'PATTERNS':
        project.patterns = parsePatterns(lines);
        break;
      case 'CONTROLS':
        project.controls = parseControls(lines);
        break;
      case 'DWF':
        project.dwf = parseDWF(lines);
        break;
      case 'POLLUTANTS':
        project.pollutants = parsePollutants(lines);
        break;
      case 'LANDUSES':
        project.landuses = parseLanduses(lines);
        break;
      case 'COORDINATES':
        project.coordinates = parseCoordinates(lines);
        break;
      case 'VERTICES':
        project.vertices = parseVertices(lines);
        break;
      case 'POLYGONS':
        project.polygons = parsePolygons(lines);
        break;
      case 'SYMBOLS':
        project.symbols = parseSymbols(lines);
        break;
      case 'LABELS':
        project.labels = parseLabels(lines);
        break;
      case 'MAP':
        project.mapExtent = parseMapExtent(lines);
        break;
      default:
        if (!knownSections.has(section)) {
          project.rawSections[section] = lines;
        }
        break;
    }
  }

  return project;
}

function padField(value: string | number, width: number): string {
  const s = String(value);
  return s.length >= width ? s + ' ' : s.padEnd(width);
}

export function projectToInp(project: SwmmProject): string {
  const lines: string[] = [];

  lines.push('[TITLE]');
  project.title.forEach(t => lines.push(t));
  lines.push('');

  lines.push('[OPTIONS]');
  for (const [key, val] of Object.entries(project.options)) {
    lines.push(`${key.padEnd(20)} ${val}`);
  }
  lines.push('');

  if (project.raingages.length) {
    lines.push('[RAINGAGES]');
    for (const rg of project.raingages) {
      lines.push(`${rg.id.padEnd(16)} ${rg.format.padEnd(10)} ${rg.interval.padEnd(10)} ${rg.scf}    ${rg.sourceType}  ${rg.sourceName}`);
    }
    lines.push('');
  }

  if (project.subcatchments.length) {
    lines.push('[SUBCATCHMENTS]');
    for (const s of project.subcatchments) {
      lines.push(`${s.id.padEnd(16)} ${s.rainGage.padEnd(16)} ${s.outlet.padEnd(16)} ${s.area.toString().padEnd(8)} ${s.pctImperv.toString().padEnd(8)} ${s.width.toString().padEnd(8)} ${s.slope}    ${s.curbLen}`);
    }
    lines.push('');
  }

  if (Object.keys(project.subareas).length) {
    lines.push('[SUBAREAS]');
    for (const [id, sa] of Object.entries(project.subareas)) {
      lines.push(`${id.padEnd(16)} ${sa.nImperv}    ${sa.nPerv}    ${sa.sImperv}    ${sa.sPerv}    ${sa.pctZero}    ${sa.routeTo}`);
    }
    lines.push('');
  }

  if (Object.keys(project.infiltration).length) {
    lines.push('[INFILTRATION]');
    for (const [id, inf] of Object.entries(project.infiltration)) {
      lines.push(`${id.padEnd(16)} ${inf.values.join('    ')}`);
    }
    lines.push('');
  }

  if (project.junctions.length) {
    lines.push('[JUNCTIONS]');
    for (const j of project.junctions) {
      lines.push(`${padField(j.id, 16)} ${padField(j.elevation, 10)} ${padField(j.maxDepth, 10)} ${padField(j.initDepth, 10)} ${padField(j.surDepth, 10)} ${j.aponded}`);
    }
    lines.push('');
  }

  if (project.outfalls.length) {
    lines.push('[OUTFALLS]');
    for (const o of project.outfalls) {
      lines.push(`${o.id.padEnd(16)} ${o.elevation}    ${o.type}    ${o.stageData || ''}    ${o.gated}`);
    }
    lines.push('');
  }

  if (project.storageUnits.length) {
    lines.push('[STORAGE]');
    for (const s of project.storageUnits) {
      lines.push(`${s.id.padEnd(16)} ${s.elevation}    ${s.maxDepth}    ${s.initDepth}    ${s.shape}    ${s.curveParams.join('    ')}    ${s.surDepth}    ${s.fevap}`);
    }
    lines.push('');
  }

  if (project.conduits.length) {
    lines.push('[CONDUITS]');
    for (const c of project.conduits) {
      lines.push(`${padField(c.id, 16)} ${padField(c.fromNode, 16)} ${padField(c.toNode, 16)} ${padField(c.length, 12)} ${padField(c.roughness, 12)} ${padField(c.inOffset, 10)} ${padField(c.outOffset, 10)} ${padField(c.initFlow, 10)} ${c.maxFlow}`);
    }
    lines.push('');
  }

  if (project.pumps.length) {
    lines.push('[PUMPS]');
    for (const p of project.pumps) {
      lines.push(`${p.id.padEnd(16)} ${p.fromNode.padEnd(16)} ${p.toNode.padEnd(16)} ${p.pumpCurve}    ${p.status}`);
    }
    lines.push('');
  }

  if (project.weirs.length) {
    lines.push('[WEIRS]');
    for (const w of project.weirs) {
      lines.push(`${w.id.padEnd(16)} ${w.fromNode.padEnd(16)} ${w.toNode.padEnd(16)} ${w.type}    ${w.crestHeight}    ${w.cd}    ${w.gated}    ${w.ec}    ${w.cd2}    ${w.surcharge}`);
    }
    lines.push('');
  }

  if (Object.keys(project.xsections).length) {
    lines.push('[XSECTIONS]');
    for (const [id, xs] of Object.entries(project.xsections)) {
      lines.push(`${padField(id, 16)} ${padField(xs.shape, 12)} ${padField(xs.geom1, 10)} ${padField(xs.geom2, 10)} ${padField(xs.geom3, 10)} ${padField(xs.geom4, 10)} ${xs.barrels}`);
    }
    lines.push('');
  }

  if (Object.keys(project.losses).length) {
    lines.push('[LOSSES]');
    for (const [id, loss] of Object.entries(project.losses)) {
      lines.push(`${padField(id, 16)} ${padField(loss.entryLoss, 10)} ${padField(loss.exitLoss, 10)} ${padField(loss.avgLoss, 10)} ${padField(loss.flapGate ? 'YES' : 'NO', 6)} ${loss.seepageRate}`);
    }
    lines.push('');
  }

  if (Object.keys(project.coordinates).length) {
    lines.push('[COORDINATES]');
    for (const [id, [x, y]] of Object.entries(project.coordinates)) {
      lines.push(`${padField(id, 16)} ${x.toFixed(3).padStart(18)} ${y.toFixed(3).padStart(18)}`);
    }
    lines.push('');
  }

  if (Object.keys(project.polygons).length) {
    lines.push('[POLYGONS]');
    for (const [id, pts] of Object.entries(project.polygons)) {
      for (const [x, y] of pts) {
        lines.push(`${id.padEnd(16)} ${x.toFixed(3).padStart(18)} ${y.toFixed(3).padStart(18)}`);
      }
    }
    lines.push('');
  }

  if (Object.keys(project.symbols).length) {
    lines.push('[SYMBOLS]');
    for (const [id, [x, y]] of Object.entries(project.symbols)) {
      lines.push(`${id.padEnd(16)} ${x.toFixed(3).padStart(18)} ${y.toFixed(3).padStart(18)}`);
    }
    lines.push('');
  }

  if (Object.keys(project.vertices).length) {
    lines.push('[VERTICES]');
    for (const [id, pts] of Object.entries(project.vertices)) {
      for (const [x, y] of pts) {
        lines.push(`${id.padEnd(16)} ${x.toFixed(3).padStart(18)} ${y.toFixed(3).padStart(18)}`);
      }
    }
    lines.push('');
  }

  for (const [section, sectionLines] of Object.entries(project.rawSections)) {
    lines.push(`[${section}]`);
    sectionLines.forEach(l => lines.push(l));
    lines.push('');
  }

  return lines.join('\n');
}

export const SAMPLE_INP = `[TITLE]
SWMM5 Example Network
Demonstration model for SWMM5-UI

[OPTIONS]
FLOW_UNITS           CFS
INFILTRATION         GREEN_AMPT
FLOW_ROUTING         DYNWAVE
LINK_OFFSETS          DEPTH
FORCE_MAIN_EQUATION  H-W
IGNORE_RAINFALL      NO
IGNORE_SNOWMELT      YES
IGNORE_GROUNDWATER   YES
IGNORE_ROUTING       NO
IGNORE_QUALITY       YES
ALLOW_PONDING        NO
SKIP_STEADY_STATE    NO
START_DATE           01/01/2024
START_TIME           00:00:00
REPORT_START_DATE    01/01/2024
REPORT_START_TIME    00:00:00
END_DATE             01/02/2024
END_TIME             00:00:00
SWEEP_START          01/01
SWEEP_END            12/31
DRY_DAYS             0
REPORT_STEP          00:15:00
WET_STEP             00:05:00
DRY_STEP             01:00:00
ROUTING_STEP         00:00:30
LENGTHENING_STEP     0
VARIABLE_STEP        0.75
MINIMUM_STEP         0.5
INERTIAL_DAMPING     PARTIAL
NORMAL_FLOW_LIMITED  BOTH
MIN_SURFAREA         12.566
MAX_TRIALS           8
HEAD_TOLERANCE       0.005
SYS_FLOW_TOL        5
LAT_FLOW_TOL        5
THREADS              1

[RAINGAGES]
RG1              INTENSITY 0:05       1.0    TIMESERIES  TS1

[SUBCATCHMENTS]
S1               RG1              J1               10       25       500      0.5      0
S2               RG1              J2               15       65       600      0.8      0
S3               RG1              J3               8        35       400      0.4      0
S4               RG1              J4               12       50       450      0.6      0
S5               RG1              J5               20       80       700      1.0      0

[SUBAREAS]
S1               0.01     0.1      0.05     0.05     25       OUTLET
S2               0.01     0.1      0.05     0.05     25       OUTLET
S3               0.01     0.1      0.05     0.05     25       OUTLET
S4               0.01     0.1      0.05     0.05     25       OUTLET
S5               0.01     0.1      0.05     0.05     25       OUTLET

[INFILTRATION]
S1               3.5      0.5      0.25
S2               3.5      0.5      0.25
S3               3.5      0.5      0.25
S4               3.5      0.5      0.25
S5               3.5      0.5      0.25

[JUNCTIONS]
J1               100.00     6.00       0.00       0          0
J2               98.50      6.00       0.00       0          0
J3               97.00      6.00       0.00       0          0
J4               95.00      8.00       0.00       0          0
J5               93.50      6.00       0.00       0          0

[OUTFALLS]
Out1             90.00      FREE                  NO

[STORAGE]
ST1              92.00      10.00      0.00       TABULAR    StorCurve    0          0

[CONDUITS]
C1               J1               J2               400        0.013      0          0          0          0
C2               J1               J3               350        0.013      0          0          0          0
C3               J2               J4               500        0.013      0          0          0          0
C4               J3               J4               400        0.013      0          0          0          0
C5               J2               J5               300        0.013      0          0          0          0
C6               J4               ST1              450        0.013      0          0          0          0

[PUMPS]
P1               J5               ST1              PumpCurve1    ON

[WEIRS]
W1               ST1              Out1             TRANSVERSE   2.0        3.33       NO         0          0          YES

[XSECTIONS]
C1               CIRCULAR     2.0        0          0          0          1
C2               CIRCULAR     1.5        0          0          0          1
C3               CIRCULAR     2.5        0          0          0          1
C4               CIRCULAR     2.0        0          0          0          1
C5               CIRCULAR     1.5        0          0          0          1
C6               CIRCULAR     3.0        0          0          0          1
W1               RECT_OPEN    4.0        10.0       0          0

[TIMESERIES]
TS1              0:00       0.0
TS1              0:15       0.2
TS1              0:30       0.8
TS1              0:45       1.5
TS1              1:00       2.8
TS1              1:15       4.2
TS1              1:30       3.5
TS1              1:45       2.8
TS1              2:00       2.0
TS1              2:15       1.4
TS1              2:30       0.9
TS1              2:45       0.5
TS1              3:00       0.2
TS1              3:15       0.1
TS1              3:30       0.0

[CURVES]
StorCurve        STORAGE
StorCurve        0          1000
StorCurve        2          1200
StorCurve        4          1500
StorCurve        6          2000
StorCurve        8          2800
StorCurve        10         4000

PumpCurve1       PUMP1
PumpCurve1       0          30
PumpCurve1       5          20
PumpCurve1       10         5

[COORDINATES]
J1               2000.000           7000.000
J2               4000.000           7200.000
J3               2000.000           5000.000
J4               4000.000           4800.000
J5               5500.000           6000.000
ST1              5500.000           4000.000
Out1             7000.000           4000.000

[VERTICES]
C3               4200.000           6000.000

[POLYGONS]
S1               1200.000           7800.000
S1               2800.000           7800.000
S1               2800.000           6500.000
S1               1200.000           6500.000
S2               3200.000           8000.000
S2               4800.000           8000.000
S2               4800.000           6600.000
S2               3200.000           6600.000
S3               1000.000           5800.000
S3               2800.000           5800.000
S3               2800.000           4400.000
S3               1000.000           4400.000
S4               3200.000           5600.000
S4               4800.000           5600.000
S4               4800.000           4200.000
S4               3200.000           4200.000
S5               5000.000           7200.000
S5               6200.000           7200.000
S5               6200.000           5600.000
S5               5000.000           5600.000

[SYMBOLS]
RG1              1500.000           8500.000

[MAP]
DIMENSIONS       500.000            3500.000           7500.000           9000.000
UNITS            None

[REPORT]
SUBCATCHMENTS    ALL
NODES            ALL
LINKS            ALL
`;
