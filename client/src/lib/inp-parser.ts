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
  type LidControl,
  type LidUsage,
  type Groundwater,
  type Aquifer,
  type Transect,
  type SnowPack,
  type Street,
  type Inlet,
  type InletUsage,
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
    if (currentSection && line.trim() && !line.trimStart().startsWith(';')) {
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
    const type = p[2] || 'FREE';
    if (type === 'FREE' || type === 'NORMAL') {
      return {
        id: p[0],
        elevation: parseFloat2(p[1]),
        type,
        stageData: '',
        gated: p[3] || 'NO',
        routeTo: p[4],
      };
    }
    return {
      id: p[0],
      elevation: parseFloat2(p[1]),
      type,
      stageData: p[3] || '',
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
    const shape = p[4] || 'TABULAR';
    let curveParams: string[];
    let restIdx: number;
    if (shape === 'TABULAR') {
      curveParams = [p[5] || ''];
      restIdx = 6;
    } else if (shape === 'FUNCTIONAL') {
      curveParams = p.slice(5, 8);
      restIdx = 8;
    } else {
      curveParams = p.slice(5, 8);
      restIdx = 8;
    }
    return {
      id: p[0],
      elevation: parseFloat2(p[1]),
      maxDepth: parseFloat2(p[2]),
      initDepth: parseFloat2(p[3]),
      shape,
      curveParams,
      surDepth: parseFloat2(p[restIdx]),
      fevap: parseFloat2(p[restIdx + 1]),
      psi: p[restIdx + 2] ? parseFloat2(p[restIdx + 2]) : undefined,
      ksat: p[restIdx + 3] ? parseFloat2(p[restIdx + 3]) : undefined,
      imd: p[restIdx + 4] ? parseFloat2(p[restIdx + 4]) : undefined,
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
      const shape = p[1] || 'CIRCULAR';
      result[p[0]] = {
        linkId: p[0],
        shape,
        geom1: shape === 'IRREGULAR' ? (p[2] || '') : parseFloat2(p[2]),
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
  const curveTypes: Record<string, string> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length < 2) continue;
    const name = p[0];
    if (p.length === 2 && isNaN(parseFloat(p[1]))) {
      curveTypes[name] = p[1];
      if (!result[name]) result[name] = [];
      continue;
    }
    if (p.length >= 3) {
      let xIdx = 1;
      if (isNaN(parseFloat(p[1]))) {
        curveTypes[name] = p[1];
        xIdx = 2;
      }
      if (!result[name]) result[name] = [];
      result[name].push({
        x: parseFloat2(p[xIdx]),
        y: parseFloat2(p[xIdx + 1]),
      });
    }
  }
  for (const [name, points] of Object.entries(result)) {
    if (curveTypes[name] && points.length > 0) {
      points[0].type = curveTypes[name];
    }
  }
  return result;
}

function parseTimeseries(lines: string[]): { series: Record<string, TimeSeriesPoint[]>; files: Record<string, string> } {
  const result: Record<string, TimeSeriesPoint[]> = {};
  const files: Record<string, string> = {};
  let currentName = '';
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length >= 2) {
      if (p[1].toUpperCase() === 'FILE') {
        files[p[0]] = p.slice(2).join(' ');
        continue;
      }
      if (p[0].toUpperCase() === 'FILE') continue;
      if (p.length >= 4 && p[1].includes('/') && p[2].includes(':')) {
        currentName = p[0];
        if (!result[currentName]) result[currentName] = [];
        result[currentName].push({
          dateTime: p[1] + ' ' + p[2],
          value: parseFloat2(p[3]),
        });
      } else if (p.length >= 3 && isNaN(parseFloat(p[1]))) {
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
  return { series: result, files };
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

function parseLidControls(lines: string[]): LidControl[] {
  const controls: Record<string, LidControl> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length < 2) continue;
    const id = p[0];
    if (!controls[id]) {
      controls[id] = { id, type: p[1], layers: [] };
    } else {
      controls[id].layers.push(p.slice(1));
    }
  }
  return Object.values(controls);
}

function parseLidUsage(lines: string[]): LidUsage[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      subcatchId: p[0] || '',
      lidId: p[1] || '',
      number: parseFloat2(p[2]),
      area: parseFloat2(p[3]),
      width: parseFloat2(p[4]),
      initSat: parseFloat2(p[5]),
      fromImperv: parseFloat2(p[6]),
      toPerv: parseFloat2(p[7]),
      rptFile: p[8] || '',
      drainTo: p[9] || '',
      fromPerv: parseFloat2(p[10]),
    };
  }).filter(l => l.subcatchId);
}

function parseGroundwater(lines: string[]): Groundwater[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      subcatchId: p[0] || '',
      aquiferId: p[1] || '',
      nodeId: p[2] || '',
      surfElev: parseFloat2(p[3]),
      a1: parseFloat2(p[4]),
      b1: parseFloat2(p[5]),
      a2: parseFloat2(p[6]),
      b2: parseFloat2(p[7]),
      a3: parseFloat2(p[8]),
      fixedDepth: parseFloat2(p[9]),
      threshold: parseFloat2(p[10]),
      params: p.slice(11).map(parseFloat2),
    };
  }).filter(g => g.subcatchId);
}

function parseAquifers(lines: string[]): Aquifer[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      id: p[0] || '',
      porosity: parseFloat2(p[1]),
      wiltPoint: parseFloat2(p[2]),
      fieldCap: parseFloat2(p[3]),
      conductivity: parseFloat2(p[4]),
      conductSlope: parseFloat2(p[5]),
      tensionSlope: parseFloat2(p[6]),
      upperEvap: parseFloat2(p[7]),
      lowerEvap: parseFloat2(p[8]),
      lowerGWLoss: parseFloat2(p[9]),
      bottomElev: parseFloat2(p[10]),
      waterTableElev: parseFloat2(p[11]),
      unsatMoisture: parseFloat2(p[12]),
      params: p.slice(13).map(parseFloat2),
    };
  }).filter(a => a.id);
}

function parseTransects(lines: string[]): Transect[] {
  const transects: Transect[] = [];
  let current: Transect | null = null;
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0] === 'NC') {
      if (current) transects.push(current);
      current = {
        id: '',
        stations: [],
        roughness: { left: parseFloat2(p[1]), right: parseFloat2(p[2]), channel: parseFloat2(p[3]) },
        bankStations: { left: 0, right: 0 },
        modifiers: [],
      };
    } else if (p[0] === 'X1' && current) {
      current.id = p[1] || '';
      current.bankStations = { left: parseFloat2(p[4]), right: parseFloat2(p[5]) };
      current.modifiers = p.slice(6).map(parseFloat2);
    } else if (p[0] === 'GR' && current) {
      for (let i = 1; i + 1 < p.length; i += 2) {
        current.stations.push({ x: parseFloat2(p[i]), y: parseFloat2(p[i + 1]) });
      }
    }
  }
  if (current) transects.push(current);
  return transects;
}

function parseSnowpacks(lines: string[]): SnowPack[] {
  const packs: Record<string, SnowPack> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length < 2) continue;
    const id = p[0];
    if (!packs[id]) packs[id] = { id, parameters: {} };
    packs[id].parameters[p[1]] = p.slice(2).map(parseFloat2);
  }
  return Object.values(packs);
}

function parseStreets(lines: string[]): Street[] {
  return lines.map(line => {
    const p = splitFields(line);
    return { id: p[0] || '', params: p.slice(1) };
  }).filter(s => s.id);
}

function parseInlets(lines: string[]): Inlet[] {
  const inlets: Record<string, Inlet> = {};
  for (const line of lines) {
    const p = splitFields(line);
    if (p.length < 2) continue;
    const id = p[0];
    if (!inlets[id]) {
      inlets[id] = { id, type: p[1], params: p.slice(2) };
    } else {
      inlets[id].params.push(...p.slice(1));
    }
  }
  return Object.values(inlets);
}

function parseInletUsage(lines: string[]): InletUsage[] {
  return lines.map(line => {
    const p = splitFields(line);
    return {
      linkId: p[0] || '',
      inletId: p[1] || '',
      nodeId: p[2] || '',
      number: parseFloat2(p[3]),
      pctClogged: parseFloat2(p[4]),
      maxFlow: parseFloat2(p[5]),
      params: p.slice(6),
    };
  }).filter(i => i.linkId);
}

function parseMapExtent(lines: string[]): { x1: number; y1: number; x2: number; y2: number; units?: string } | null {
  let extent: { x1: number; y1: number; x2: number; y2: number; units?: string } | null = null;
  let units: string | undefined;
  for (const line of lines) {
    const p = splitFields(line);
    if (p[0] === 'DIMENSIONS' && p.length >= 5) {
      extent = {
        x1: parseFloat2(p[1]),
        y1: parseFloat2(p[2]),
        x2: parseFloat2(p[3]),
        y2: parseFloat2(p[4]),
      };
    } else if (p[0]?.toUpperCase() === 'UNITS' && p[1]) {
      units = p[1];
    }
  }
  if (extent && units) extent.units = units;
  return extent;
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
    'LID_CONTROLS', 'LID_USAGE', 'GROUNDWATER', 'AQUIFERS',
    'TRANSECTS', 'SNOWPACKS', 'STREETS', 'INLETS', 'INLET_USAGE',
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
      case 'TIMESERIES': {
        const tsResult = parseTimeseries(lines);
        project.timeseries = tsResult.series;
        project.timeseriesFiles = tsResult.files;
        break;
      }
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
      case 'LID_CONTROLS':
        project.lidControls = parseLidControls(lines);
        break;
      case 'LID_USAGE':
        project.lidUsage = parseLidUsage(lines);
        break;
      case 'GROUNDWATER':
        project.groundwater = parseGroundwater(lines);
        break;
      case 'AQUIFERS':
        project.aquifers = parseAquifers(lines);
        break;
      case 'TRANSECTS':
        project.transects = parseTransects(lines);
        break;
      case 'SNOWPACKS':
        project.snowpacks = parseSnowpacks(lines);
        break;
      case 'STREETS':
        project.streets = parseStreets(lines);
        break;
      case 'INLETS':
        project.inlets = parseInlets(lines);
        break;
      case 'INLET_USAGE':
        project.inletUsage = parseInletUsage(lines);
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

  const allNodeIds = new Set([
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ]);
  const allLinkIds = new Set([
    ...project.conduits.filter(c => allNodeIds.has(c.fromNode) && allNodeIds.has(c.toNode)).map(c => c.id),
    ...project.pumps.filter(p => allNodeIds.has(p.fromNode) && allNodeIds.has(p.toNode)).map(p => p.id),
    ...project.orifices.filter(o => allNodeIds.has(o.fromNode) && allNodeIds.has(o.toNode)).map(o => o.id),
    ...project.weirs.filter(w => allNodeIds.has(w.fromNode) && allNodeIds.has(w.toNode)).map(w => w.id),
    ...project.outlets.filter(o => allNodeIds.has(o.fromNode) && allNodeIds.has(o.toNode)).map(o => o.id),
  ]);
  const allTransectNames = new Set(project.transects.map(t => t.id).filter(n => n && n !== '0'));
  const allLanduseNames = new Set(project.landuses.map(l => l.id));

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
      const routeTo = (o.routeTo && o.routeTo !== 'NO' && o.routeTo !== 'YES') ? o.routeTo : '';
      if (o.type === 'FREE' || o.type === 'NORMAL') {
        const parts = [o.id.padEnd(16), padField(o.elevation, 10), o.type.padEnd(12), o.gated || 'NO'];
        if (routeTo) parts.push(routeTo);
        lines.push(parts.join('    '));
      } else {
        const parts = [o.id.padEnd(16), padField(o.elevation, 10), o.type.padEnd(12), o.stageData || '', o.gated || 'NO'];
        if (routeTo) parts.push(routeTo);
        lines.push(parts.join('    '));
      }
    }
    lines.push('');
  }

  if (project.storageUnits.length) {
    lines.push('[STORAGE]');
    for (const s of project.storageUnits) {
      let stLine = `${s.id.padEnd(16)} ${s.elevation}    ${s.maxDepth}    ${s.initDepth}    ${s.shape}    ${s.curveParams.join('    ')}    ${s.surDepth}    ${s.fevap}`;
      const seep = [s.psi, s.ksat, s.imd];
      if (seep.some(v => v !== undefined)) {
        stLine += `    ${s.psi ?? 0}    ${s.ksat ?? 0}    ${s.imd ?? 0}`;
      }
      lines.push(stLine);
    }
    lines.push('');
  }

  if (project.dividers.length) {
    lines.push('[DIVIDERS]');
    for (const d of project.dividers) {
      const parts = [padField(d.id, 16), padField(d.elevation, 10), padField(d.divertedLink, 16), padField(d.type, 10)];
      if (d.type === 'CUTOFF') {
        parts.push(padField(d.cutoffFlow ?? 0, 10));
      } else if (d.type === 'TABULAR') {
        parts.push(padField(d.curve || '', 16));
      } else if (d.type === 'WEIR') {
        parts.push(padField(d.cutoffFlow ?? 0, 10));
        parts.push(padField(d.curve || '', 16));
      }
      parts.push(padField(d.maxDepth, 10), padField(d.initDepth, 10), padField(d.surDepth, 10), String(d.aponded));
      lines.push(parts.join(' '));
    }
    lines.push('');
  }

  const validConduits = project.conduits.filter(c => allNodeIds.has(c.fromNode) && allNodeIds.has(c.toNode));
  if (validConduits.length) {
    lines.push('[CONDUITS]');
    for (const c of validConduits) {
      lines.push(`${padField(c.id, 16)} ${padField(c.fromNode, 16)} ${padField(c.toNode, 16)} ${padField(c.length, 12)} ${padField(c.roughness, 12)} ${padField(c.inOffset, 10)} ${padField(c.outOffset, 10)} ${padField(c.initFlow, 10)} ${c.maxFlow}`);
    }
    lines.push('');
  }

  const validPumps = project.pumps.filter(p => allNodeIds.has(p.fromNode) && allNodeIds.has(p.toNode));
  if (validPumps.length) {
    lines.push('[PUMPS]');
    for (const p of validPumps) {
      let pumpLine = `${p.id.padEnd(16)} ${p.fromNode.padEnd(16)} ${p.toNode.padEnd(16)} ${p.pumpCurve}    ${p.status}`;
      if (p.startupDepth !== undefined) pumpLine += `    ${p.startupDepth}`;
      if (p.shutoffDepth !== undefined) pumpLine += `    ${p.shutoffDepth}`;
      lines.push(pumpLine);
    }
    lines.push('');
  }

  const validWeirs = project.weirs.filter(w => allNodeIds.has(w.fromNode) && allNodeIds.has(w.toNode));
  if (validWeirs.length) {
    lines.push('[WEIRS]');
    for (const w of validWeirs) {
      let weirLine = `${w.id.padEnd(16)} ${w.fromNode.padEnd(16)} ${w.toNode.padEnd(16)} ${w.type}    ${w.crestHeight}    ${w.cd}    ${w.gated}    ${w.ec}    ${w.cd2}    ${w.surcharge}`;
      if (w.width !== undefined) weirLine += `    ${w.width}`;
      lines.push(weirLine);
    }
    lines.push('');
  }

  const validOrifices = project.orifices.filter(o => allNodeIds.has(o.fromNode) && allNodeIds.has(o.toNode));
  if (validOrifices.length) {
    lines.push('[ORIFICES]');
    for (const o of validOrifices) {
      lines.push(`${padField(o.id, 16)} ${padField(o.fromNode, 16)} ${padField(o.toNode, 16)} ${padField(o.type, 12)} ${padField(o.offset, 10)} ${padField(o.cd, 10)} ${padField(o.gated, 6)} ${o.closeTime}`);
    }
    lines.push('');
  }

  const validOutlets = project.outlets.filter(o => allNodeIds.has(o.fromNode) && allNodeIds.has(o.toNode));
  if (validOutlets.length) {
    lines.push('[OUTLETS]');
    for (const o of validOutlets) {
      lines.push(`${padField(o.id, 16)} ${padField(o.fromNode, 16)} ${padField(o.toNode, 16)} ${padField(o.offset, 10)} ${padField(o.type, 16)} ${o.curveOrTable}`);
    }
    lines.push('');
  }

  if (Object.keys(project.xsections).length) {
    const validXsections = Object.entries(project.xsections).filter(([id, xs]) => {
      if (!allLinkIds.has(id)) return false;
      if (xs.shape === 'IRREGULAR' && (!xs.geom1 || xs.geom1 === '0' || !allTransectNames.has(String(xs.geom1)))) return false;
      return true;
    });
    if (validXsections.length) {
      lines.push('[XSECTIONS]');
      for (const [id, xs] of validXsections) {
        let xsLine = `${padField(id, 16)} ${padField(xs.shape, 12)} ${padField(xs.geom1, 10)} ${padField(xs.geom2, 10)} ${padField(xs.geom3, 10)} ${padField(xs.geom4, 10)} ${xs.barrels}`;
        if (xs.culvert !== undefined && xs.culvert !== '') xsLine += `    ${xs.culvert}`;
        lines.push(xsLine);
      }
      lines.push('');
    }
  }

  if (Object.keys(project.losses).length) {
    const validLosses = Object.entries(project.losses).filter(([id]) => allLinkIds.has(id));
    if (validLosses.length) {
      lines.push('[LOSSES]');
      for (const [id, loss] of validLosses) {
        const flapVal = (typeof loss.flapGate === 'string') ? loss.flapGate : (loss.flapGate ? 'YES' : 'NO');
        lines.push(`${padField(id, 16)} ${padField(loss.entryLoss, 10)} ${padField(loss.exitLoss, 10)} ${padField(loss.avgLoss, 10)} ${padField(flapVal, 6)} ${loss.seepageRate}`);
      }
      lines.push('');
    }
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

  if (project.lidControls.length) {
    lines.push('[LID_CONTROLS]');
    for (const lc of project.lidControls) {
      lines.push(`${lc.id.padEnd(16)} ${lc.type}`);
      for (const layer of lc.layers) {
        lines.push(`${lc.id.padEnd(16)} ${layer.join('    ')}`);
      }
    }
    lines.push('');
  }

  if (project.lidUsage.length) {
    lines.push('[LID_USAGE]');
    for (const lu of project.lidUsage) {
      lines.push(`${lu.subcatchId.padEnd(16)} ${lu.lidId.padEnd(16)} ${lu.number}    ${lu.area}    ${lu.width}    ${lu.initSat}    ${lu.fromImperv}    ${lu.toPerv}    ${lu.rptFile || '*'}    ${lu.drainTo || '*'}    ${lu.fromPerv}`);
    }
    lines.push('');
  }

  if (project.aquifers.length) {
    lines.push('[AQUIFERS]');
    for (const a of project.aquifers) {
      lines.push(`${a.id.padEnd(16)} ${a.porosity}    ${a.wiltPoint}    ${a.fieldCap}    ${a.conductivity}    ${a.conductSlope}    ${a.tensionSlope}    ${a.upperEvap}    ${a.lowerEvap}    ${a.lowerGWLoss}    ${a.bottomElev}    ${a.waterTableElev}    ${a.unsatMoisture}`);
    }
    lines.push('');
  }

  if (project.groundwater.length) {
    lines.push('[GROUNDWATER]');
    for (const gw of project.groundwater) {
      lines.push(`${gw.subcatchId.padEnd(16)} ${gw.aquiferId.padEnd(16)} ${gw.nodeId.padEnd(16)} ${gw.surfElev}    ${gw.a1}    ${gw.b1}    ${gw.a2}    ${gw.b2}    ${gw.a3}    ${gw.fixedDepth}    ${gw.threshold}`);
    }
    lines.push('');
  }

  if (project.snowpacks.length) {
    lines.push('[SNOWPACKS]');
    for (const sp of project.snowpacks) {
      for (const [key, vals] of Object.entries(sp.parameters)) {
        lines.push(`${sp.id.padEnd(16)} ${key}    ${vals.join('    ')}`);
      }
    }
    lines.push('');
  }

  if (project.transects.length) {
    lines.push('[TRANSECTS]');
    for (const tr of project.transects) {
      lines.push(`NC    ${tr.roughness.left}    ${tr.roughness.right}    ${tr.roughness.channel}`);
      lines.push(`X1    ${tr.id}    0    0    ${tr.bankStations.left}    ${tr.bankStations.right}    ${tr.modifiers.join('    ')}`);
      const stationPairs: string[] = [];
      for (const st of tr.stations) stationPairs.push(`${st.x}    ${st.y}`);
      for (let i = 0; i < stationPairs.length; i += 5) {
        lines.push(`GR    ${stationPairs.slice(i, i + 5).join('    ')}`);
      }
    }
    lines.push('');
  }

  if (project.streets.length) {
    lines.push('[STREETS]');
    for (const st of project.streets) {
      lines.push(`${st.id.padEnd(16)} ${st.params.join('    ')}`);
    }
    lines.push('');
  }

  if (project.inlets.length) {
    lines.push('[INLETS]');
    for (const inlet of project.inlets) {
      lines.push(`${inlet.id.padEnd(16)} ${inlet.type}    ${inlet.params.join('    ')}`);
    }
    lines.push('');
  }

  if (project.inletUsage.length) {
    lines.push('[INLET_USAGE]');
    for (const iu of project.inletUsage) {
      lines.push(`${iu.linkId.padEnd(16)} ${iu.inletId.padEnd(16)} ${iu.nodeId.padEnd(16)} ${iu.number}    ${iu.pctClogged}    ${iu.maxFlow}    ${iu.params.join('    ')}`);
    }
    lines.push('');
  }

  const tsFiles = project.timeseriesFiles || {};
  if (Object.keys(project.timeseries).length || Object.keys(tsFiles).length) {
    lines.push('[TIMESERIES]');
    for (const [name, fileName] of Object.entries(tsFiles)) {
      lines.push(`${name.padEnd(16)} FILE ${fileName}`);
    }
    for (const [name, points] of Object.entries(project.timeseries)) {
      for (const pt of points) {
        lines.push(`${name.padEnd(16)} ${pt.dateTime.padEnd(16)} ${pt.value}`);
      }
    }
    lines.push('');
  }

  if (Object.keys(project.curves).length) {
    lines.push('[CURVES]');
    for (const [name, points] of Object.entries(project.curves)) {
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (pt.type) {
          lines.push(`${name.padEnd(16)} ${pt.type.padEnd(12)} ${pt.x}    ${pt.y}`);
        } else {
          lines.push(`${name.padEnd(16)} ${pt.x}    ${pt.y}`);
        }
      }
    }
    lines.push('');
  }

  if (Object.keys(project.patterns).length) {
    lines.push('[PATTERNS]');
    for (const [name, pat] of Object.entries(project.patterns)) {
      const mults = pat.multipliers;
      const chunkSize = pat.type.toUpperCase() === 'DAILY' ? 7 : 6;
      for (let i = 0; i < mults.length; i += chunkSize) {
        const chunk = mults.slice(i, i + chunkSize);
        if (i === 0) {
          lines.push(`${name.padEnd(16)} ${pat.type.padEnd(12)} ${chunk.join('    ')}`);
        } else {
          lines.push(`${name.padEnd(16)}              ${chunk.join('    ')}`);
        }
      }
    }
    lines.push('');
  }

  if (project.controls.length) {
    lines.push('[CONTROLS]');
    for (const ctrl of project.controls) {
      lines.push(ctrl);
    }
    lines.push('');
  }

  if (Object.keys(project.reportOptions).length) {
    lines.push('[REPORT]');
    for (const [key, val] of Object.entries(project.reportOptions)) {
      lines.push(`${key.padEnd(20)} ${val}`);
    }
    lines.push('');
  }

  if (project.pollutants.length) {
    lines.push('[POLLUTANTS]');
    for (const p of project.pollutants) {
      lines.push(`${padField(p.id, 16)} ${padField(p.units, 6)} ${padField(p.cRain, 10)} ${padField(p.cGW, 10)} ${padField(p.cRDII, 10)} ${padField(p.kDecay, 10)} ${padField(p.snowOnly, 6)} ${padField(p.coPollutant, 16)} ${padField(p.coFraction, 10)} ${padField(p.cDWF, 10)} ${p.cInit}`);
    }
    lines.push('');
  }

  if (project.landuses.length) {
    lines.push('[LANDUSES]');
    for (const l of project.landuses) {
      lines.push(`${padField(l.id, 16)} ${padField(l.sweepInterval, 10)} ${padField(l.sweepAvail, 10)} ${l.sweepLast}`);
    }
    lines.push('');
  }

  const validDwf = project.dwf.filter(d => allNodeIds.has(d.nodeId));
  if (validDwf.length) {
    lines.push('[DWF]');
    for (const d of validDwf) {
      lines.push(`${d.nodeId.padEnd(16)} ${d.constituent.padEnd(12)} ${d.baseline}    ${d.patterns.join('    ')}`);
    }
    lines.push('');
  }

  if (project.labels.length) {
    lines.push('[LABELS]');
    for (const lbl of project.labels) {
      const parts = [lbl.x.toFixed(3).padStart(18), lbl.y.toFixed(3).padStart(18), `"${lbl.text}"`];
      if (lbl.anchorNode) parts.push(lbl.anchorNode);
      if (lbl.font) parts.push(`"${lbl.font}"`);
      if (lbl.size != null) parts.push(String(lbl.size));
      if (lbl.bold != null) parts.push(lbl.bold ? '1' : '0');
      if (lbl.italic != null) parts.push(lbl.italic ? '1' : '0');
      lines.push(parts.join('    '));
    }
    lines.push('');
  }

  if (project.mapExtent) {
    lines.push('[MAP]');
    lines.push(`DIMENSIONS ${project.mapExtent.x1} ${project.mapExtent.y1} ${project.mapExtent.x2} ${project.mapExtent.y2}`);
    lines.push(`Units      ${project.mapExtent.units || 'None'}`);
    lines.push('');
  }

  const nodeRefSections = new Set(['INFLOWS', 'TREATMENT', 'RDII']);

  for (const [section, sectionLines] of Object.entries(project.rawSections)) {
    let filtered: string[];
    if (nodeRefSections.has(section)) {
      filtered = sectionLines.filter(l => {
        const firstField = l.trim().split(/\s+/)[0];
        return !firstField || firstField.startsWith(';') || allNodeIds.has(firstField);
      });
    } else if (section === 'COVERAGES' || section === 'COVERAGE') {
      filtered = sectionLines.filter(l => {
        const parts = l.trim().split(/\s+/);
        if (!parts[0] || parts[0].startsWith(';')) return true;
        return parts.length >= 2 && allLanduseNames.has(parts[1]);
      });
    } else if (section === 'BUILDUP' || section === 'WASHOFF') {
      filtered = sectionLines.filter(l => {
        const firstField = l.trim().split(/\s+/);
        if (!firstField[0] || firstField[0].startsWith(';')) return true;
        return allLanduseNames.has(firstField[0]);
      });
    } else {
      filtered = sectionLines;
    }
    if (filtered.length > 0) {
      lines.push(`[${section}]`);
      filtered.forEach(l => lines.push(l));
      lines.push('');
    }
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
