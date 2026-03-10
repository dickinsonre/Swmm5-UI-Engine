import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// SWMM5-UI Layout Prototype
// Shows how the EPANET-UI UX pattern maps to SWMM5
// ============================================================

const COLORS = {
  bg: "#1e1e2e",
  surface: "#2a2a3e",
  surfaceAlt: "#323248",
  border: "#3a3a52",
  accent: "#4ea8de",
  accentHover: "#5cb8ee",
  text: "#e0e0e8",
  textMuted: "#8888a0",
  textDim: "#6666a0",
  success: "#82e0a8",
  warning: "#f0c060",
  danger: "#f07070",
  menuActive: "#3a5a8a",
  menuHover: "#2e4468",
  mapBg: "#1a2030",
  
  // Theme legend colors (same as EPANET-UI)
  legend1: "#7092BE",
  legend2: "#99D9EA",
  legend3: "#B5E61D",
  legend4: "#FFC90E",
  legend5: "#FF7F27",
};

// Sample SWMM network data for the prototype map
const SAMPLE_NETWORK = {
  subcatchments: [
    { id: "S1", x: 120, y: 80, w: 160, h: 120, imperv: 45, rainfall: 1.2, runoff: 0.85 },
    { id: "S2", x: 300, y: 60, w: 140, h: 140, imperv: 72, rainfall: 1.2, runoff: 1.45 },
    { id: "S3", x: 100, y: 220, w: 180, h: 100, imperv: 28, rainfall: 1.2, runoff: 0.42 },
    { id: "S4", x: 320, y: 230, w: 130, h: 110, imperv: 55, rainfall: 1.2, runoff: 1.10 },
    { id: "S5", x: 480, y: 140, w: 120, h: 120, imperv: 85, rainfall: 1.2, runoff: 1.68 },
  ],
  nodes: [
    { id: "J1", x: 200, y: 180, type: "junction", depth: 2.4, invert: 100.0 },
    { id: "J2", x: 370, y: 170, type: "junction", depth: 3.1, invert: 98.5 },
    { id: "J3", x: 200, y: 300, type: "junction", depth: 1.8, invert: 97.0 },
    { id: "J4", x: 370, y: 310, type: "junction", depth: 4.2, invert: 95.0 },
    { id: "J5", x: 540, y: 240, type: "junction", depth: 2.9, invert: 93.5 },
    { id: "ST1", x: 540, y: 340, type: "storage", depth: 5.5, invert: 92.0 },
    { id: "Out1", x: 640, y: 340, type: "outfall", depth: 0.0, invert: 90.0 },
  ],
  links: [
    { id: "C1", from: 0, to: 1, type: "conduit", flow: 2.3, depth: 0.8, dia: 24 },
    { id: "C2", from: 0, to: 2, type: "conduit", flow: 1.5, depth: 0.6, dia: 18 },
    { id: "C3", from: 1, to: 3, type: "conduit", flow: 3.8, depth: 1.2, dia: 30 },
    { id: "C4", from: 2, to: 3, type: "conduit", flow: 2.1, depth: 0.9, dia: 24 },
    { id: "C5", from: 1, to: 4, type: "conduit", flow: 1.9, depth: 0.7, dia: 18 },
    { id: "C6", from: 3, to: 5, type: "conduit", flow: 5.2, depth: 1.5, dia: 36 },
    { id: "P1", from: 4, to: 5, type: "pump", flow: 3.0, depth: 0, dia: 0 },
    { id: "W1", from: 5, to: 6, type: "weir", flow: 8.1, depth: 2.0, dia: 0 },
  ],
  raingages: [
    { id: "RG1", x: 80, y: 40 },
  ],
};

// --- Map Component ---
function NetworkMap({ selectedObj, onSelectObj, showSubcatchments, subcatchTheme, nodeTheme, linkTheme, timeStep }) {
  const canvasRef = useRef(null);
  const [hoveredObj, setHoveredObj] = useState(null);

  const getSubcatchColor = useCallback((sc) => {
    const val = subcatchTheme === "runoff" ? sc.runoff : subcatchTheme === "imperv" ? sc.imperv / 100 : sc.rainfall;
    const t = subcatchTheme === "imperv" ? val : Math.min(val / 2.0, 1);
    if (t < 0.25) return "rgba(70,146,190,0.35)";
    if (t < 0.5) return "rgba(153,217,234,0.35)";
    if (t < 0.75) return "rgba(181,230,29,0.35)";
    if (t < 0.9) return "rgba(255,201,14,0.35)";
    return "rgba(255,127,39,0.40)";
  }, [subcatchTheme]);

  const getNodeColor = useCallback((n) => {
    const val = nodeTheme === "depth" ? n.depth : n.invert;
    if (nodeTheme === "depth") {
      if (val < 1.5) return COLORS.legend1;
      if (val < 3.0) return COLORS.legend2;
      if (val < 4.0) return COLORS.legend3;
      if (val < 5.0) return COLORS.legend4;
      return COLORS.legend5;
    }
    return COLORS.legend2;
  }, [nodeTheme]);

  const getLinkColor = useCallback((l) => {
    const val = linkTheme === "flow" ? l.flow : l.depth;
    if (val < 1.0) return COLORS.legend1;
    if (val < 2.5) return COLORS.legend2;
    if (val < 4.0) return COLORS.legend3;
    if (val < 6.0) return COLORS.legend4;
    return COLORS.legend5;
  }, [linkTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = COLORS.mapBg;
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Draw subcatchments
    if (showSubcatchments) {
      SAMPLE_NETWORK.subcatchments.forEach(sc => {
        ctx.fillStyle = getSubcatchColor(sc);
        ctx.strokeStyle = selectedObj?.id === sc.id ? COLORS.accent : "rgba(255,255,255,0.2)";
        ctx.lineWidth = selectedObj?.id === sc.id ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(sc.x, sc.y, sc.w, sc.h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "10px monospace";
        ctx.fillText(sc.id, sc.x + 5, sc.y + 14);
      });
    }

    // Draw rain gages
    SAMPLE_NETWORK.raingages.forEach(rg => {
      ctx.fillStyle = "#4488cc";
      ctx.strokeStyle = "#6699dd";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rg.x, rg.y - 8);
      ctx.lineTo(rg.x + 7, rg.y + 5);
      ctx.lineTo(rg.x - 7, rg.y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "9px monospace";
      ctx.fillText(rg.id, rg.x - 8, rg.y + 18);
    });

    const N = SAMPLE_NETWORK.nodes;

    // Draw links
    SAMPLE_NETWORK.links.forEach(l => {
      const n1 = N[l.from];
      const n2 = N[l.to];
      ctx.strokeStyle = getLinkColor(l);
      ctx.lineWidth = selectedObj?.id === l.id ? 4 : Math.max(2, Math.min(l.flow * 0.8, 6));
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.stroke();

      // Link symbol at midpoint
      const mx = (n1.x + n2.x) / 2;
      const my = (n1.y + n2.y) / 2;
      if (l.type === "pump") {
        ctx.fillStyle = getLinkColor(l);
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.mapBg;
        ctx.font = "bold 10px monospace";
        ctx.fillText("P", mx - 3, my + 4);
      } else if (l.type === "weir") {
        ctx.fillStyle = getLinkColor(l);
        ctx.fillRect(mx - 8, my - 3, 16, 6);
        ctx.fillStyle = COLORS.mapBg;
        ctx.font = "bold 8px monospace";
        ctx.fillText("W", mx - 4, my + 3);
      }

      // Flow direction arrow
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len;
      const uy = dy / len;
      const ax = mx + ux * 12;
      const ay = my + uy * 12;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - ux * 6 - uy * 3, ay - uy * 6 + ux * 3);
      ctx.lineTo(ax - ux * 6 + uy * 3, ay - uy * 6 - ux * 3);
      ctx.closePath();
      ctx.fill();
    });

    // Draw nodes
    N.forEach(n => {
      const isSelected = selectedObj?.id === n.id;
      const r = n.type === "junction" ? 6 : n.type === "storage" ? 10 : 7;
      ctx.fillStyle = getNodeColor(n);
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(0,0,0,0.6)";
      ctx.lineWidth = isSelected ? 2 : 1;

      if (n.type === "storage") {
        ctx.beginPath();
        ctx.rect(n.x - r, n.y - r, r * 2, r * 2);
        ctx.fill();
        ctx.stroke();
      } else if (n.type === "outfall") {
        ctx.beginPath();
        ctx.moveTo(n.x, n.y - r);
        ctx.lineTo(n.x + r, n.y + r);
        ctx.lineTo(n.x - r, n.y + r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "10px monospace";
      ctx.fillText(n.id, n.x + r + 3, n.y - 2);
    });

  }, [selectedObj, showSubcatchments, subcatchTheme, nodeTheme, linkTheme, timeStep, getSubcatchColor, getNodeColor, getLinkColor]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const sc of SAMPLE_NETWORK.subcatchments) {
      if (x >= sc.x && x <= sc.x + sc.w && y >= sc.y && y <= sc.y + sc.h) {
        onSelectObj({ ...sc, objType: "subcatchment" });
        return;
      }
    }
    for (const n of SAMPLE_NETWORK.nodes) {
      const dx = x - n.x, dy = y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) < 12) {
        onSelectObj({ ...n, objType: "node" });
        return;
      }
    }
    onSelectObj(null);
  };

  return (
    <canvas
      ref={canvasRef}
      width={720}
      height={420}
      onClick={handleClick}
      style={{ width: "100%", height: "100%", cursor: "crosshair", display: "block" }}
    />
  );
}

// --- Legend Panel ---
function LegendPanel({ subcatchTheme, nodeTheme, linkTheme, showSubcatch, setShowSubcatch }) {
  const legendColors = [COLORS.legend1, COLORS.legend2, COLORS.legend3, COLORS.legend4, COLORS.legend5];
  
  const nodeLabels = nodeTheme === "depth"
    ? ["< 1.5", "1.5 - 3.0", "3.0 - 4.0", "4.0 - 5.0", "> 5.0"]
    : ["< 92", "92 - 95", "95 - 97", "97 - 100", "> 100"];

  const linkLabels = linkTheme === "flow"
    ? ["< 1.0", "1.0 - 2.5", "2.5 - 4.0", "4.0 - 6.0", "> 6.0"]
    : ["< 0.5", "0.5 - 1.0", "1.0 - 1.5", "1.5 - 2.0", "> 2.0"];

  const subcatchLabels = subcatchTheme === "imperv"
    ? ["< 25%", "25 - 50%", "50 - 75%", "75 - 90%", "> 90%"]
    : subcatchTheme === "runoff"
    ? ["< 0.5", "0.5 - 1.0", "1.0 - 1.5", "1.5 - 2.0", "> 2.0"]
    : ["< 0.5", "0.5 - 1.0", "1.0 - 1.5", "1.5 - 2.0", "> 2.0"];

  const LegendSection = ({ title, labels, type }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <input type="checkbox" checked={type !== "subcatch" || showSubcatch} 
          onChange={type === "subcatch" ? () => setShowSubcatch(!showSubcatch) : undefined}
          readOnly={type !== "subcatch"} 
          style={{ accentColor: COLORS.accent }} />
        <span style={{ fontWeight: 600, fontSize: 11 }}>{title}</span>
      </div>
      {labels.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 18, marginBottom: 2 }}>
          <div style={{
            width: type === "subcatch" ? 14 : type === "node" ? 10 : 16,
            height: type === "subcatch" ? 10 : type === "node" ? 10 : 3,
            borderRadius: type === "node" ? "50%" : type === "subcatch" ? 2 : 0,
            backgroundColor: legendColors[i],
            opacity: type === "subcatch" ? 0.6 : 1,
            border: "1px solid rgba(0,0,0,0.3)",
          }} />
          <span style={{ fontSize: 10, color: COLORS.textMuted }}>{label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: "8px 10px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.text, marginBottom: 8, textAlign: "center", 
        borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 4 }}>
        Map Legend
      </div>
      <LegendSection type="subcatch" title={`Subcatchments — ${subcatchTheme === "imperv" ? "% Imperv" : subcatchTheme === "runoff" ? "Runoff (CFS)" : "Rainfall (in/hr)"}`} labels={subcatchLabels} />
      <LegendSection type="node" title={`Nodes — ${nodeTheme === "depth" ? "Depth (ft)" : "Invert (ft)"}`} labels={nodeLabels} />
      <LegendSection type="link" title={`Links — ${linkTheme === "flow" ? "Flow (CFS)" : "Depth (ft)"}`} labels={linkLabels} />
      
      <div style={{ marginTop: 8, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Layers</div>
        {["Junctions ○", "Storage ◻", "Outfalls ▽", "Conduits", "Pumps ⊙", "Weirs ═", "Labels", "Basemap"].map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 4, marginBottom: 1 }}>
            <input type="checkbox" defaultChecked style={{ accentColor: COLORS.accent, transform: "scale(0.8)" }} />
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Project Explorer (right panel) ---
function ProjectExplorer({ selectedObj, onSelectObj }) {
  const [expanded, setExpanded] = useState({ options: true, nodes: true, links: false, subcatch: false });

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const TreeItem = ({ label, indent = 0, expandable, expanded: isExpanded, onToggle, selected, onClick, icon }) => (
    <div
      onClick={onClick || onToggle}
      style={{
        paddingLeft: 8 + indent * 14,
        paddingTop: 3, paddingBottom: 3,
        fontSize: 11,
        cursor: "pointer",
        backgroundColor: selected ? COLORS.menuActive : "transparent",
        color: selected ? "#fff" : COLORS.text,
        display: "flex", alignItems: "center", gap: 4,
        borderRadius: 3,
      }}
    >
      {expandable && <span style={{ fontSize: 8, width: 10 }}>{isExpanded ? "▼" : "▶"}</span>}
      {!expandable && <span style={{ width: 10 }} />}
      {icon && <span style={{ fontSize: 10, opacity: 0.6 }}>{icon}</span>}
      {label}
    </div>
  );

  const treeData = [
    { label: "Title / Notes", indent: 0 },
    { label: "Analysis Options", indent: 0, expandable: true, key: "options" },
    ...(expanded.options ? [
      { label: "General", indent: 1 },
      { label: "Hydrology", indent: 1 },
      { label: "Hydraulics", indent: 1 },
      { label: "Routing", indent: 1 },
      { label: "Quality", indent: 1 },
      { label: "Dates", indent: 1 },
      { label: "Time Steps", indent: 1 },
      { label: "Reporting", indent: 1 },
    ] : []),
    { label: "Rain Gages", indent: 0, icon: "▲" },
    { label: "Subcatchments", indent: 0, expandable: true, key: "subcatch", icon: "◫" },
    ...(expanded.subcatch ? [
      { label: "Infiltration", indent: 1 },
      { label: "Groundwater", indent: 1 },
      { label: "LID Controls", indent: 1 },
      { label: "Snow Packs", indent: 1 },
    ] : []),
    { label: "Network Nodes", indent: 0, expandable: true, key: "nodes", icon: "○" },
    ...(expanded.nodes ? [
      { label: "Junctions", indent: 1 },
      { label: "Outfalls", indent: 1 },
      { label: "Dividers", indent: 1 },
      { label: "Storage Units", indent: 1 },
    ] : []),
    { label: "Network Links", indent: 0, expandable: true, key: "links", icon: "—" },
    ...(expanded.links ? [
      { label: "Conduits", indent: 1 },
      { label: "Pumps", indent: 1 },
      { label: "Orifices", indent: 1 },
      { label: "Weirs", indent: 1 },
      { label: "Outlets", indent: 1 },
    ] : []),
    { label: "Dry Weather", indent: 0, icon: "☀" },
    { label: "RDII", indent: 0, icon: "↗" },
    { label: "Transects", indent: 0, icon: "⌢" },
    { label: "Time Patterns", indent: 0 },
    { label: "Time Series", indent: 0 },
    { label: "Data Curves", indent: 0 },
    { label: "Control Rules", indent: 0 },
  ];

  const getProperties = () => {
    if (!selectedObj) return [];
    if (selectedObj.objType === "node") {
      const typeLabel = selectedObj.type === "junction" ? "Junction" : selectedObj.type === "storage" ? "Storage" : "Outfall";
      return [
        ["ID", selectedObj.id],
        ["Type", typeLabel],
        ["Invert El.", selectedObj.invert.toFixed(2)],
        ["Max. Depth", "6.0000"],
        ["Init. Depth", "0.0000"],
        ["Surcharge Dp.", "0.0000"],
        ["Ponded Area", "0"],
        ...(selectedObj.type !== "outfall" ? [["Depth (ft)", selectedObj.depth.toFixed(4)]] : []),
      ];
    }
    if (selectedObj.objType === "subcatchment") {
      return [
        ["ID", selectedObj.id],
        ["Rain Gage", "RG1"],
        ["Outlet", "J1"],
        ["Area (ac)", (selectedObj.w * selectedObj.h / 1000).toFixed(2)],
        ["% Imperv", selectedObj.imperv.toFixed(1)],
        ["Width (ft)", selectedObj.w.toFixed(0)],
        ["Slope (%)", "0.50"],
        ["Curb Len.", "0"],
        ["Infiltration", "Green-Ampt"],
        ["Runoff (CFS)", selectedObj.runoff.toFixed(4)],
      ];
    }
    return [];
  };

  const props = getProperties();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", padding: "6px 0", 
        borderBottom: `1px solid ${COLORS.border}`, color: COLORS.text }}>
        Project Explorer
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "4px 2px" }}>
        {treeData.map((item, i) => (
          <TreeItem key={i} {...item}
            expanded={item.key ? expanded[item.key] : false}
            onToggle={item.key ? () => toggle(item.key) : undefined} />
        ))}
      </div>
      
      {selectedObj && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 8px", backgroundColor: COLORS.surfaceAlt }}>
            <button style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 14 }}>◀</button>
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text }}>
              {selectedObj.objType === "node" ? (selectedObj.type === "junction" ? "Junction" : selectedObj.type === "storage" ? "Storage" : "Outfall") : "Subcatchment"} {selectedObj.id}
            </span>
            <button style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 14 }}>▶</button>
          </div>
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ backgroundColor: COLORS.surfaceAlt }}>
                  <th style={{ textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>Property</th>
                  <th style={{ textAlign: "left", padding: "3px 6px", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.textMuted }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {props.map(([k, v], i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    <td style={{ padding: "2px 6px", color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` }}>{k}</td>
                    <td style={{ padding: "2px 6px", color: COLORS.accent, borderBottom: `1px solid ${COLORS.border}`, fontFamily: "monospace" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "3px 6px", fontSize: 9, color: COLORS.textDim, backgroundColor: "rgba(78,168,222,0.08)", 
            borderTop: `1px solid ${COLORS.border}` }}>
            Press Enter to record an edit, F1 for Help
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main App ---
export default function SWMM5UI() {
  const [activeMenu, setActiveMenu] = useState("Project");
  const [selectedObj, setSelectedObj] = useState(null);
  const [showSubcatch, setShowSubcatch] = useState(true);
  const [subcatchTheme, setSubcatchTheme] = useState("imperv");
  const [nodeTheme, setNodeTheme] = useState("depth");
  const [linkTheme, setLinkTheme] = useState("flow");
  const [timeStep, setTimeStep] = useState(12);
  const [simStatus, setSimStatus] = useState("current");

  const menus = ["File", "Edit", "View", "Map", "Project", "Help"];
  const projectTools = [
    { icon: "⚙", label: "Setup" },
    { icon: "⊕", label: "Add" },
    { icon: "⊖", label: "Delete" },
    { icon: "⌕", label: "Locate" },
    { icon: "☰", label: "Summary" },
    { icon: "📋", label: "Details" },
    { icon: "▶", label: "Analyze", accent: true },
    { icon: "📊", label: "Report" },
  ];
  const viewTools = [
    { label: "Subcatchments", combo: true, value: subcatchTheme, 
      options: [["imperv", "% Imperv"], ["runoff", "Runoff"], ["rainfall", "Rainfall"]],
      onChange: setSubcatchTheme },
    { label: "Nodes", combo: true, value: nodeTheme,
      options: [["depth", "Depth"], ["invert", "Invert Elev"]],
      onChange: setNodeTheme },
    { label: "Links", combo: true, value: linkTheme,
      options: [["flow", "Flow"], ["depth", "Depth"]],
      onChange: setLinkTheme },
  ];

  const statusItems = [
    ["Flow: CFS"],
    ["Routing: DynWave"],
    ["Infiltration: Green-Ampt"],
    [simStatus === "current" ? "Results are Current" : "No Results", simStatus === "current" ? COLORS.success : COLORS.textMuted],
  ];

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', -apple-system, sans-serif", color: COLORS.text, backgroundColor: COLORS.bg,
      overflow: "hidden", fontSize: 12 }}>

      {/* Title Bar */}
      <div style={{ height: 28, backgroundColor: "#161622", display: "flex", alignItems: "center",
        padding: "0 12px", fontSize: 12, color: COLORS.textMuted, gap: 8, flexShrink: 0 }}>
        <span style={{ color: COLORS.accent, fontWeight: 700 }}>◆</span>
        <span style={{ fontWeight: 600, color: COLORS.text }}>SWMM5-UI:</span>
        <span>Example_Network.inp</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, opacity: 0.5 }}>Lazarus/Free Pascal — Cross-Platform</span>
      </div>

      {/* Menu Bar */}
      <div style={{ height: 32, backgroundColor: COLORS.surface, display: "flex", alignItems: "stretch",
        borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        {menus.map(m => (
          <div key={m} onClick={() => setActiveMenu(m)} style={{
            padding: "0 16px", display: "flex", alignItems: "center", cursor: "pointer",
            backgroundColor: activeMenu === m ? COLORS.menuActive : "transparent",
            color: activeMenu === m ? "#fff" : COLORS.text,
            fontWeight: activeMenu === m ? 700 : 400,
            fontSize: 12,
            borderBottom: activeMenu === m ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            transition: "all 0.15s",
          }}>
            {m}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12 }}>
          {["💾", "📂", "🔍", "◀", "▶", "❓"].map((icon, i) => (
            <button key={i} style={{
              background: "none", border: "none", color: COLORS.textMuted,
              cursor: "pointer", fontSize: 13, padding: "2px 4px",
            }}>{icon}</button>
          ))}
        </div>
      </div>

      {/* Toolbar Row */}
      <div style={{ height: 52, backgroundColor: COLORS.surface, display: "flex", alignItems: "center",
        padding: "0 8px", gap: 2, borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0, overflowX: "auto" }}>
        {activeMenu === "Project" && projectTools.map((t, i) => (
          <div key={i} onClick={t.label === "Analyze" ? () => setSimStatus("current") : undefined}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "4px 12px", cursor: "pointer", borderRadius: 4, minWidth: 56,
              backgroundColor: t.accent ? "rgba(78,168,222,0.15)" : "transparent",
              border: t.accent ? `1px solid ${COLORS.accent}` : "1px solid transparent",
            }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 9, marginTop: 2, color: t.accent ? COLORS.accent : COLORS.textMuted }}>{t.label}</span>
          </div>
        ))}
        {activeMenu === "View" && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 8px", width: "100%" }}>
            {viewTools.map((vt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: "nowrap" }}>{vt.label}:</span>
                <select value={vt.value} onChange={e => vt.onChange(e.target.value)}
                  style={{ backgroundColor: COLORS.surfaceAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`,
                    borderRadius: 3, padding: "2px 4px", fontSize: 10 }}>
                  {vt.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>Time:</span>
              <input type="range" min={0} max={24} value={timeStep} onChange={e => setTimeStep(+e.target.value)}
                style={{ width: 120, accentColor: COLORS.accent }} />
              <span style={{ fontSize: 10, fontFamily: "monospace", color: COLORS.accent, minWidth: 40 }}>
                {String(timeStep).padStart(2, "0")}:00
              </span>
              <button style={{ background: "none", border: `1px solid ${COLORS.border}`, color: COLORS.accent,
                borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>
                ▶ Animate
              </button>
            </div>
          </div>
        )}
        {activeMenu === "Map" && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {["🔍+", "🔍−", "⊞ Extent", "⚙ Options", "📌 Query", "🗺 Basemap", "📋 Export"].map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "6px 12px",
                cursor: "pointer", borderRadius: 4, fontSize: 11, color: COLORS.text,
              }}>{t}</div>
            ))}
          </div>
        )}
        {activeMenu === "Edit" && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {["✂ Copy", "📋 Paste", "↔ Reverse", "⊡ Vertices", "☰ Group Edit", "⊖ Group Delete"].map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "6px 12px",
                cursor: "pointer", borderRadius: 4, fontSize: 11, color: COLORS.text,
              }}>{t}</div>
            ))}
          </div>
        )}
        {(activeMenu === "File" || activeMenu === "Help") && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {(activeMenu === "File" 
              ? ["📄 New", "📂 Open", "💾 Save", "💾 Save As", "📥 Import", "⚙ Preferences", "🚪 Quit"]
              : ["📖 Topics", "📘 Tutorial", "📏 Units", "⚠ Errors", "ℹ About"]
            ).map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "6px 12px",
                cursor: "pointer", borderRadius: 4, fontSize: 11, color: COLORS.text,
              }}>{t}</div>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left Panel — Legend */}
        <div style={{ width: 170, backgroundColor: COLORS.surface, borderRight: `1px solid ${COLORS.border}`,
          overflow: "auto", flexShrink: 0 }}>
          <LegendPanel subcatchTheme={subcatchTheme} nodeTheme={nodeTheme} linkTheme={linkTheme} 
            showSubcatch={showSubcatch} setShowSubcatch={setShowSubcatch} />
        </div>

        {/* Center — Map */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <NetworkMap 
            selectedObj={selectedObj} 
            onSelectObj={setSelectedObj}
            showSubcatchments={showSubcatch}
            subcatchTheme={subcatchTheme}
            nodeTheme={nodeTheme}
            linkTheme={linkTheme}
            timeStep={timeStep}
          />
        </div>

        {/* Right Panel — Project Explorer */}
        <div style={{ width: 220, backgroundColor: COLORS.surface, borderLeft: `1px solid ${COLORS.border}`,
          overflow: "hidden", flexShrink: 0 }}>
          <ProjectExplorer selectedObj={selectedObj} onSelectObj={setSelectedObj} />
        </div>
      </div>

      {/* Status Bar */}
      <div style={{ height: 24, backgroundColor: COLORS.surface, borderTop: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", padding: "0 12px", gap: 0, flexShrink: 0 }}>
        {statusItems.map(([text, color], i) => (
          <div key={i} style={{ 
            padding: "0 12px", fontSize: 10, 
            color: color || COLORS.textMuted,
            borderRight: i < statusItems.length - 1 ? `1px solid ${COLORS.border}` : "none",
            fontWeight: color === COLORS.success ? 600 : 400,
          }}>{text}</div>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, fontFamily: "monospace", color: COLORS.textDim }}>
          X,Y: 2485321.45, 384710.22 ft
        </span>
      </div>
    </div>
  );
}
