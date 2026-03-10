import type { SwmmProject, Junction, Conduit, Outfall, StorageUnit } from './swmm-types';

export interface CsvImportResult {
  nodesAdded: number;
  nodesModified: number;
  linksAdded: number;
  linksModified: number;
  errors: string[];
}

export interface DxfImportResult {
  nodesAdded: number;
  linksAdded: number;
  layers: string[];
  errors: string[];
}

export interface ShpImportResult {
  nodesAdded: number;
  linksAdded: number;
  errors: string[];
}

function generateNodeId(project: SwmmProject, prefix = 'J'): string {
  let i = 1;
  const allIds = new Set([
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ]);
  while (allIds.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function generateLinkId(project: SwmmProject, prefix = 'C'): string {
  let i = 1;
  const allIds = new Set([
    ...project.conduits.map(c => c.id),
    ...project.pumps.map(p => p.id),
  ]);
  while (allIds.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function importCsvNodes(
  project: SwmmProject,
  csvText: string,
  mode: 'add' | 'modify'
): CsvImportResult {
  const result: CsvImportResult = { nodesAdded: 0, nodesModified: 0, linksAdded: 0, linksModified: 0, errors: [] };
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) { result.errors.push('CSV file must have a header row and at least one data row'); return result; }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idIdx = headers.findIndex(h => h === 'id' || h === 'name' || h === 'node_id' || h === 'nodeid');
  const xIdx = headers.findIndex(h => h === 'x' || h === 'x_coord' || h === 'xcoord' || h === 'longitude' || h === 'lon');
  const yIdx = headers.findIndex(h => h === 'y' || h === 'y_coord' || h === 'ycoord' || h === 'latitude' || h === 'lat');
  const elevIdx = headers.findIndex(h => h === 'elevation' || h === 'elev' || h === 'invert' || h === 'invert_el');
  const maxDepthIdx = headers.findIndex(h => h === 'maxdepth' || h === 'max_depth' || h === 'depth');
  const typeIdx = headers.findIndex(h => h === 'type' || h === 'node_type');

  if (mode === 'add' && xIdx < 0 && yIdx < 0) {
    result.errors.push('CSV must contain X and Y coordinate columns when adding new nodes');
    return result;
  }
  if (mode === 'modify' && idIdx < 0) {
    result.errors.push('CSV must contain an ID/Name column when modifying existing nodes');
    return result;
  }

  const existingNodes = new Map<string, number>();
  project.junctions.forEach((j, i) => existingNodes.set(j.id, i));

  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(',').map(c => c.trim());
    const id = idIdx >= 0 ? cols[idIdx] : '';
    const x = xIdx >= 0 ? parseFloat(cols[xIdx]) : NaN;
    const y = yIdx >= 0 ? parseFloat(cols[yIdx]) : NaN;
    const elev = elevIdx >= 0 ? parseFloat(cols[elevIdx]) : 0;
    const maxDepth = maxDepthIdx >= 0 ? parseFloat(cols[maxDepthIdx]) : 0;

    if (mode === 'modify') {
      if (!id) { result.errors.push(`Row ${r + 1}: Missing ID`); continue; }
      const idx = existingNodes.get(id);
      if (idx === undefined) { result.errors.push(`Row ${r + 1}: Node '${id}' not found`); continue; }
      if (!isNaN(x) && !isNaN(y)) project.coordinates[id] = [x, y];
      if (elevIdx >= 0 && !isNaN(elev)) project.junctions[idx].elevation = elev;
      if (maxDepthIdx >= 0 && !isNaN(maxDepth)) project.junctions[idx].maxDepth = maxDepth;
      result.nodesModified++;
    } else {
      if (isNaN(x) || isNaN(y)) { result.errors.push(`Row ${r + 1}: Invalid coordinates`); continue; }
      const nodeId = id || generateNodeId(project);
      const nodeType = typeIdx >= 0 ? cols[typeIdx]?.toLowerCase() : 'junction';

      if (nodeType === 'outfall') {
        project.outfalls.push({ id: nodeId, elevation: isNaN(elev) ? 0 : elev, type: 'FREE', gated: 'NO' });
      } else if (nodeType === 'storage') {
        project.storageUnits.push({ id: nodeId, elevation: isNaN(elev) ? 0 : elev, maxDepth: isNaN(maxDepth) ? 0 : maxDepth, initDepth: 0, shape: 'TABULAR', curveParams: ['*'], surDepth: 0, fevap: 0 });
      } else {
        project.junctions.push({ id: nodeId, elevation: isNaN(elev) ? 0 : elev, maxDepth: isNaN(maxDepth) ? 0 : maxDepth, initDepth: 0, surDepth: 0, aponded: 0 });
      }
      project.coordinates[nodeId] = [x, y];
      result.nodesAdded++;
    }
  }
  return result;
}

export function importCsvLinks(
  project: SwmmProject,
  csvText: string,
  mode: 'add' | 'modify'
): CsvImportResult {
  const result: CsvImportResult = { nodesAdded: 0, nodesModified: 0, linksAdded: 0, linksModified: 0, errors: [] };
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) { result.errors.push('CSV file must have a header row and at least one data row'); return result; }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idIdx = headers.findIndex(h => h === 'id' || h === 'name' || h === 'link_id' || h === 'linkid' || h === 'pipe_id');
  const fromIdx = headers.findIndex(h => h === 'from' || h === 'from_node' || h === 'fromnode' || h === 'inlet' || h === 'start_node');
  const toIdx = headers.findIndex(h => h === 'to' || h === 'to_node' || h === 'tonode' || h === 'outlet' || h === 'end_node');
  const lengthIdx = headers.findIndex(h => h === 'length' || h === 'len');
  const roughIdx = headers.findIndex(h => h === 'roughness' || h === 'rough' || h === 'n' || h === 'mannings_n');
  const diamIdx = headers.findIndex(h => h === 'diameter' || h === 'diam' || h === 'geom1' || h === 'width');

  if (mode === 'add' && (fromIdx < 0 || toIdx < 0)) {
    result.errors.push('CSV must contain From/To node columns when adding new pipes');
    return result;
  }
  if (mode === 'modify' && idIdx < 0) {
    result.errors.push('CSV must contain an ID/Name column when modifying existing pipes');
    return result;
  }

  const existingLinks = new Map<string, number>();
  project.conduits.forEach((c, i) => existingLinks.set(c.id, i));

  const allNodeIds = new Set([
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ]);

  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(',').map(c => c.trim());
    const id = idIdx >= 0 ? cols[idIdx] : '';
    const fromNode = fromIdx >= 0 ? cols[fromIdx] : '';
    const toNode = toIdx >= 0 ? cols[toIdx] : '';
    const length = lengthIdx >= 0 ? parseFloat(cols[lengthIdx]) : 400;
    const roughness = roughIdx >= 0 ? parseFloat(cols[roughIdx]) : 0.01;
    const diameter = diamIdx >= 0 ? parseFloat(cols[diamIdx]) : 1;

    if (mode === 'modify') {
      if (!id) { result.errors.push(`Row ${r + 1}: Missing ID`); continue; }
      const idx = existingLinks.get(id);
      if (idx === undefined) { result.errors.push(`Row ${r + 1}: Link '${id}' not found`); continue; }
      if (fromNode) project.conduits[idx].fromNode = fromNode;
      if (toNode) project.conduits[idx].toNode = toNode;
      if (lengthIdx >= 0 && !isNaN(length)) project.conduits[idx].length = length;
      if (roughIdx >= 0 && !isNaN(roughness)) project.conduits[idx].roughness = roughness;
      result.linksModified++;
    } else {
      if (!fromNode || !toNode) { result.errors.push(`Row ${r + 1}: Missing from/to nodes`); continue; }
      if (!allNodeIds.has(fromNode)) { result.errors.push(`Row ${r + 1}: From node '${fromNode}' not found`); continue; }
      if (!allNodeIds.has(toNode)) { result.errors.push(`Row ${r + 1}: To node '${toNode}' not found`); continue; }
      const linkId = id || generateLinkId(project);
      project.conduits.push({
        id: linkId,
        fromNode, toNode,
        length: isNaN(length) ? 400 : length,
        roughness: isNaN(roughness) ? 0.01 : roughness,
        inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0,
      });
      project.xsections[linkId] = { shape: 'CIRCULAR', geom1: isNaN(diameter) ? 1 : diameter, geom2: 0, geom3: 0, geom4: 0, barrels: 1 };
      result.linksAdded++;
    }
  }
  return result;
}

export function parseDxfFile(dxfText: string): { layers: string[]; entities: Array<{ layer: string; type: string; points: [number, number][] }> } {
  const layers = new Set<string>();
  const entities: Array<{ layer: string; type: string; points: [number, number][] }> = [];
  const lines = dxfText.split('\n').map(l => l.trim());

  let inEntities = false;
  let currentEntity: { type: string; layer: string; points: [number, number][] } | null = null;
  let currentX: number | null = null;
  let currentY: number | null = null;
  let vertexPoints: [number, number][] = [];
  let inPolyline = false;

  for (let i = 0; i < lines.length; i++) {
    const code = parseInt(lines[i]);
    const value = i + 1 < lines.length ? lines[i + 1] : '';

    if (code === 0 && value === 'ENTITIES') { inEntities = true; continue; }
    if (code === 0 && value === 'ENDSEC' && inEntities) { inEntities = false; continue; }
    if (!inEntities) continue;

    if (code === 0) {
      if (currentEntity && currentEntity.points.length > 0) {
        layers.add(currentEntity.layer);
        entities.push(currentEntity);
      }
      if (inPolyline && value === 'VERTEX') {
        currentX = null; currentY = null;
        i++;
        continue;
      }
      if (inPolyline && value === 'SEQEND') {
        if (vertexPoints.length > 0) {
          entities.push({ type: 'POLYLINE', layer: currentEntity?.layer || '0', points: [...vertexPoints] });
          layers.add(currentEntity?.layer || '0');
        }
        inPolyline = false;
        vertexPoints = [];
        currentEntity = null;
        i++;
        continue;
      }

      currentEntity = null;
      currentX = null; currentY = null;

      if (value === 'LINE') {
        currentEntity = { type: 'LINE', layer: '0', points: [] };
      } else if (value === 'LWPOLYLINE') {
        currentEntity = { type: 'LWPOLYLINE', layer: '0', points: [] };
      } else if (value === 'POLYLINE') {
        inPolyline = true;
        currentEntity = { type: 'POLYLINE', layer: '0', points: [] };
        vertexPoints = [];
      } else if (value === 'ARC' || value === 'CIRCLE') {
        currentEntity = { type: value, layer: '0', points: [] };
      }
      i++;
      continue;
    }

    if (!currentEntity && !inPolyline) { i++; continue; }

    if (code === 8) {
      if (currentEntity) currentEntity.layer = value;
      i++; continue;
    }
    if (code === 10) { currentX = parseFloat(value); i++; continue; }
    if (code === 20) {
      currentY = parseFloat(value);
      if (currentX !== null && currentY !== null) {
        if (inPolyline) {
          vertexPoints.push([currentX, currentY]);
        } else if (currentEntity) {
          currentEntity.points.push([currentX, currentY]);
        }
        currentX = null; currentY = null;
      }
      i++; continue;
    }
    if (code === 11) { currentX = parseFloat(value); i++; continue; }
    if (code === 21) {
      currentY = parseFloat(value);
      if (currentX !== null && currentY !== null && currentEntity) {
        currentEntity.points.push([currentX, currentY]);
        currentX = null; currentY = null;
      }
      i++; continue;
    }
    i++;
  }

  if (currentEntity && currentEntity.points.length > 0) {
    layers.add(currentEntity.layer);
    entities.push(currentEntity);
  }

  return { layers: Array.from(layers), entities };
}

export function importDxfEntities(
  project: SwmmProject,
  entities: Array<{ layer: string; type: string; points: [number, number][] }>,
  selectedLayers: Set<string>
): DxfImportResult {
  const result: DxfImportResult = { nodesAdded: 0, linksAdded: 0, layers: Array.from(selectedLayers), errors: [] };
  const nodeMap = new Map<string, string>();

  function coordKey(x: number, y: number): string {
    return `${x.toFixed(4)},${y.toFixed(4)}`;
  }

  function getOrCreateNode(x: number, y: number): string {
    const key = coordKey(x, y);
    if (nodeMap.has(key)) return nodeMap.get(key)!;

    for (const [id, coord] of Object.entries(project.coordinates)) {
      if (Math.abs(coord[0] - x) < 0.001 && Math.abs(coord[1] - y) < 0.001) {
        nodeMap.set(key, id);
        return id;
      }
    }

    const nodeId = generateNodeId(project);
    project.junctions.push({ id: nodeId, elevation: 0, maxDepth: 0, initDepth: 0, surDepth: 0, aponded: 0 });
    project.coordinates[nodeId] = [x, y];
    nodeMap.set(key, nodeId);
    result.nodesAdded++;
    return nodeId;
  }

  for (const entity of entities) {
    if (!selectedLayers.has(entity.layer)) continue;

    if (entity.type === 'LINE' && entity.points.length >= 2) {
      const fromId = getOrCreateNode(entity.points[0][0], entity.points[0][1]);
      const toId = getOrCreateNode(entity.points[1][0], entity.points[1][1]);
      if (fromId === toId) continue;
      const linkId = generateLinkId(project);
      const dx = entity.points[1][0] - entity.points[0][0];
      const dy = entity.points[1][1] - entity.points[0][1];
      const length = Math.sqrt(dx * dx + dy * dy);
      project.conduits.push({ id: linkId, fromNode: fromId, toNode: toId, length: Math.max(1, length), roughness: 0.01, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 });
      project.xsections[linkId] = { shape: 'CIRCULAR', geom1: 1, geom2: 0, geom3: 0, geom4: 0, barrels: 1 };
      result.linksAdded++;
    } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.points.length >= 2) {
      for (let i = 0; i < entity.points.length - 1; i++) {
        const fromId = getOrCreateNode(entity.points[i][0], entity.points[i][1]);
        const toId = getOrCreateNode(entity.points[i + 1][0], entity.points[i + 1][1]);
        if (fromId === toId) continue;
        const linkId = generateLinkId(project);
        const dx = entity.points[i + 1][0] - entity.points[i][0];
        const dy = entity.points[i + 1][1] - entity.points[i][1];
        const length = Math.sqrt(dx * dx + dy * dy);
        project.conduits.push({ id: linkId, fromNode: fromId, toNode: toId, length: Math.max(1, length), roughness: 0.01, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 });
        project.xsections[linkId] = { shape: 'CIRCULAR', geom1: 1, geom2: 0, geom3: 0, geom4: 0, barrels: 1 };
        result.linksAdded++;
      }
    }
  }

  return result;
}

export function exportNodesCsv(project: SwmmProject): string {
  const rows: string[] = ['ID,Type,X,Y,Elevation,MaxDepth'];
  for (const j of project.junctions) {
    const coord = project.coordinates[j.id] || [0, 0];
    rows.push(`${j.id},Junction,${coord[0]},${coord[1]},${j.elevation},${j.maxDepth}`);
  }
  for (const o of project.outfalls) {
    const coord = project.coordinates[o.id] || [0, 0];
    rows.push(`${o.id},Outfall,${coord[0]},${coord[1]},${o.elevation},0`);
  }
  for (const s of project.storageUnits) {
    const coord = project.coordinates[s.id] || [0, 0];
    rows.push(`${s.id},Storage,${coord[0]},${coord[1]},${s.elevation},${s.maxDepth}`);
  }
  return rows.join('\n');
}

export function exportLinksCsv(project: SwmmProject): string {
  const rows: string[] = ['ID,From,To,Length,Roughness,Diameter,Shape'];
  for (const c of project.conduits) {
    const xs = project.xsections[c.id];
    rows.push(`${c.id},${c.fromNode},${c.toNode},${c.length},${c.roughness},${xs?.geom1 || 0},${xs?.shape || 'CIRCULAR'}`);
  }
  return rows.join('\n');
}

export function exportDxf(project: SwmmProject): string {
  const lines: string[] = [];
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  for (const c of project.conduits) {
    const fromCoord = project.coordinates[c.fromNode];
    const toCoord = project.coordinates[c.toNode];
    if (!fromCoord || !toCoord) continue;

    const verts = project.vertices[c.id];
    if (verts && verts.length > 0) {
      const allPts = [fromCoord, ...verts, toCoord];
      lines.push('0', 'LWPOLYLINE', '8', 'CONDUITS', '90', String(allPts.length), '70', '0');
      for (const pt of allPts) {
        lines.push('10', String(pt[0]), '20', String(pt[1]));
      }
    } else {
      lines.push('0', 'LINE', '8', 'CONDUITS');
      lines.push('10', String(fromCoord[0]), '20', String(fromCoord[1]), '30', '0');
      lines.push('11', String(toCoord[0]), '21', String(toCoord[1]), '31', '0');
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function parseGeoJsonToNetwork(
  geojsonText: string,
  featureType: 'nodes' | 'links'
): { features: Array<{ properties: Record<string, any>; geometry: { type: string; coordinates: number[] | number[][] } }>; fields: string[] } {
  const gj = JSON.parse(geojsonText);
  const features = gj.features || [];
  const fields = new Set<string>();
  for (const f of features) {
    if (f.properties) Object.keys(f.properties).forEach(k => fields.add(k));
  }
  return { features, fields: Array.from(fields) };
}

export function importGeoJsonNodes(
  project: SwmmProject,
  features: Array<{ properties: Record<string, any>; geometry: { type: string; coordinates: number[] } }>,
  idField: string,
  elevField: string
): { nodesAdded: number; errors: string[] } {
  const result = { nodesAdded: 0, errors: [] as string[] };
  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue;
    const coords = f.geometry.coordinates;
    const id = f.properties?.[idField] || generateNodeId(project);
    const elev = elevField && f.properties?.[elevField] ? parseFloat(f.properties[elevField]) : 0;
    project.junctions.push({ id: String(id), elevation: isNaN(elev) ? 0 : elev, maxDepth: 0, initDepth: 0, surDepth: 0, aponded: 0 });
    project.coordinates[String(id)] = [coords[0], coords[1]];
    result.nodesAdded++;
  }
  return result;
}

export function importGeoJsonLinks(
  project: SwmmProject,
  features: Array<{ properties: Record<string, any>; geometry: { type: string; coordinates: number[][] } }>,
  idField: string,
): { linksAdded: number; nodesAdded: number; errors: string[] } {
  const result = { linksAdded: 0, nodesAdded: 0, errors: [] as string[] };
  const nodeMap = new Map<string, string>();

  function coordKey(x: number, y: number) { return `${x.toFixed(4)},${y.toFixed(4)}`; }
  function getOrCreateNode(x: number, y: number): string {
    const key = coordKey(x, y);
    if (nodeMap.has(key)) return nodeMap.get(key)!;
    for (const [nid, coord] of Object.entries(project.coordinates)) {
      if (Math.abs(coord[0] - x) < 0.001 && Math.abs(coord[1] - y) < 0.001) {
        nodeMap.set(key, nid);
        return nid;
      }
    }
    const nid = generateNodeId(project);
    project.junctions.push({ id: nid, elevation: 0, maxDepth: 0, initDepth: 0, surDepth: 0, aponded: 0 });
    project.coordinates[nid] = [x, y];
    nodeMap.set(key, nid);
    result.nodesAdded++;
    return nid;
  }

  for (const f of features) {
    if (f.geometry?.type !== 'LineString' || !f.geometry.coordinates || f.geometry.coordinates.length < 2) continue;
    const coords = f.geometry.coordinates;
    const fromId = getOrCreateNode(coords[0][0], coords[0][1]);
    const toId = getOrCreateNode(coords[coords.length - 1][0], coords[coords.length - 1][1]);
    if (fromId === toId) continue;
    const linkId = f.properties?.[idField] ? String(f.properties[idField]) : generateLinkId(project);
    let length = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const dx = coords[i + 1][0] - coords[i][0];
      const dy = coords[i + 1][1] - coords[i][1];
      length += Math.sqrt(dx * dx + dy * dy);
    }
    project.conduits.push({ id: linkId, fromNode: fromId, toNode: toId, length: Math.max(1, length), roughness: 0.01, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 });
    project.xsections[linkId] = { shape: 'CIRCULAR', geom1: 1, geom2: 0, geom3: 0, geom4: 0, barrels: 1 };
    if (coords.length > 2) {
      project.vertices[linkId] = coords.slice(1, -1).map(c => [c[0], c[1]] as [number, number]);
    }
    result.linksAdded++;
  }
  return result;
}
