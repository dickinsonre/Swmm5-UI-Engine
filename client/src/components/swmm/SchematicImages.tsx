const C = {
  sky: '#dff0fa',
  rain: '#4a90c8',
  veg: '#4a9a4a',
  vegDark: '#2f7a2f',
  soil: '#b58455',
  soilDark: '#8a6238',
  storage: '#c9c2b4',
  gravel: '#a89f8c',
  pavement: '#9a9aa4',
  pavementDark: '#6e6e78',
  water: '#5aa7d8',
  waterDeep: '#2c6eb5',
  drain: '#555560',
  label: '#2a2a3e',
  barrel: '#7a5230',
  roof: '#8a4a3a',
  unsat: '#c9a878',
  sat: '#7db2d8',
};

function Layer({ y, h, fill, label, hatch }: { y: number; h: number; fill: string; label?: string; hatch?: boolean }) {
  return (
    <g>
      <rect x={20} y={y} width={260} height={h} fill={fill} stroke="#00000022" strokeWidth={0.5} />
      {hatch && Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1={20 + i * 20} y1={y + h} x2={20 + i * 20 + 10} y2={y} stroke="#00000018" strokeWidth={1} />
      ))}
      {label && <text x={150} y={y + h / 2 + 3} textAnchor="middle" fontSize={9} fill={C.label} fontWeight={600}>{label}</text>}
    </g>
  );
}

function Rain() {
  return (
    <g stroke={C.rain} strokeWidth={1.2} strokeLinecap="round">
      {[45, 85, 125, 165, 205, 245].map((x, i) => (
        <line key={i} x1={x} y1={8 + (i % 2) * 5} x2={x - 4} y2={20 + (i % 2) * 5} />
      ))}
    </g>
  );
}

function Grass({ y }: { y: number }) {
  return (
    <g stroke={C.vegDark} strokeWidth={1.3} strokeLinecap="round">
      {Array.from({ length: 24 }, (_, i) => {
        const x = 26 + i * 11;
        return <path key={i} d={`M${x},${y} l-2,-7 M${x},${y} l0,-8 M${x},${y} l2,-6`} fill="none" />;
      })}
    </g>
  );
}

function DrainPipe({ y }: { y: number }) {
  return (
    <g>
      <rect x={20} y={y} width={260} height={7} fill="#fff" stroke={C.drain} strokeWidth={1.2} />
      <path d={`M270,${y + 3.5} l-8,-4 v3 h-8 v2 h8 v3 z`} fill={C.drain} />
      <text x={150} y={y + 6} textAnchor="middle" fontSize={7.5} fill={C.drain}>underdrain</text>
    </g>
  );
}

export function LidSchematic({ type }: { type: string }) {
  const body = (() => {
    switch (type) {
      case 'BC':
        return (
          <>
            <Layer y={40} h={26} fill={C.sky} label="Surface (ponding + vegetation)" />
            <Grass y={66} />
            <Layer y={66} h={52} fill={C.soil} label="Soil (engineered mix)" hatch />
            <Layer y={118} h={36} fill={C.gravel} label="Storage (gravel)" hatch />
            <DrainPipe y={140} />
          </>
        );
      case 'RG':
        return (
          <>
            <Layer y={40} h={28} fill={C.sky} label="Surface (ponded depth)" />
            <Grass y={68} />
            <Layer y={68} h={60} fill={C.soil} label="Soil (amended)" hatch />
            <Layer y={128} h={26} fill="#d8c9a8" label="Native soil (infiltration)" />
          </>
        );
      case 'GR':
        return (
          <>
            <Layer y={44} h={20} fill={C.sky} label="Surface (vegetation)" />
            <Grass y={64} />
            <Layer y={64} h={44} fill={C.soil} label="Soil (growing medium)" hatch />
            <Layer y={108} h={20} fill="#d6d0c4" label="Drainage mat" />
            <g>
              <rect x={20} y={128} width={260} height={12} fill={C.roof} />
              <text x={150} y={137} textAnchor="middle" fontSize={8} fill="#fff">roof deck</text>
            </g>
          </>
        );
      case 'IT':
        return (
          <>
            <Layer y={40} h={22} fill={C.sky} label="Surface" />
            <Grass y={62} />
            <Layer y={62} h={80} fill={C.gravel} label="Storage (stone trench)" hatch />
            <DrainPipe y={124} />
          </>
        );
      case 'PP':
        return (
          <>
            <Layer y={40} h={18} fill={C.sky} label="Surface" />
            <Layer y={58} h={26} fill={C.pavement} label="Pavement (porous)" />
            <Layer y={84} h={30} fill={C.soil} label="Soil (optional bedding)" hatch />
            <Layer y={114} h={36} fill={C.gravel} label="Storage (base)" hatch />
            <DrainPipe y={136} />
          </>
        );
      case 'RB':
        return (
          <g>
            <rect x={30} y={36} width={90} height={26} fill={C.roof} transform="skewX(-8)" />
            <text x={62} y={53} fontSize={8} fill="#fff">roof</text>
            <path d="M118,60 h60 v34" stroke={C.drain} strokeWidth={4} fill="none" />
            <rect x={158} y={94} width={44} height={56} rx={4} fill={C.barrel} />
            <rect x={162} y={110} width={36} height={36} fill={C.water} opacity={0.8} />
            <text x={180} y={128} textAnchor="middle" fontSize={8} fill="#fff">storage</text>
            <path d="M202,142 h20" stroke={C.drain} strokeWidth={3} />
            <text x={236} y={146} fontSize={7.5} fill={C.drain}>drain</text>
            <text x={180} y={88} textAnchor="middle" fontSize={8} fill={C.label}>rain barrel / cistern</text>
          </g>
        );
      case 'RD':
        return (
          <g>
            <path d="M40,74 L110,38 L180,74 Z" fill={C.roof} />
            <text x={110} y={66} textAnchor="middle" fontSize={8} fill="#fff">roof</text>
            <path d="M180,74 v24" stroke={C.drain} strokeWidth={4} />
            <path d="M180,98 q10,10 26,12" stroke={C.water} strokeWidth={3} fill="none" />
            <Layer y={112} h={16} fill={C.sky} />
            <Grass y={128} />
            <Layer y={128} h={22} fill={C.soil} label="Pervious area (splash zone)" hatch />
            <text x={110} y={108} textAnchor="middle" fontSize={8} fill={C.label}>downspout disconnected to lawn</text>
          </g>
        );
      case 'VS':
        return (
          <g>
            <path d="M20,60 L110,110 H190 L280,60 V150 H20 Z" fill={C.soil} />
            <path d="M110,110 H190 L230,88 H70 Z" fill={C.water} opacity={0.75} />
            <Grass y={110} />
            <text x={150} y={135} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={600}>Vegetative swale (channel)</text>
            <path d="M20,60 L110,110" stroke={C.vegDark} strokeWidth={1.5} fill="none" />
            <path d="M280,60 L190,110" stroke={C.vegDark} strokeWidth={1.5} fill="none" />
          </g>
        );
      default:
        return null;
    }
  })();
  return (
    <svg viewBox="0 0 300 160" className="w-full h-full" role="img" aria-label={`Schematic of LID type ${type}`}>
      <rect x={0} y={0} width={300} height={160} fill="#ffffff" />
      <rect x={20} y={4} width={260} height={36} fill={C.sky} opacity={0.5} />
      <Rain />
      {body}
      <rect x={20} y={4} width={260} height={146} fill="none" stroke="#d0d0d8" />
    </svg>
  );
}

export function GroundwaterSchematic() {
  return (
    <svg viewBox="0 0 300 170" className="w-full h-full" role="img" aria-label="Groundwater aquifer schematic">
      <rect width={300} height={170} fill="#fff" />
      <rect x={20} y={4} width={260} height={30} fill={C.sky} opacity={0.5} />
      <Rain />
      <Grass y={40} />
      <rect x={20} y={40} width={260} height={4} fill={C.veg} />
      <rect x={20} y={44} width={260} height={44} fill={C.unsat} />
      <text x={150} y={64} textAnchor="middle" fontSize={9} fill={C.label} fontWeight={600}>Unsaturated zone</text>
      <text x={150} y={76} textAnchor="middle" fontSize={7.5} fill={C.label}>(moisture content θ, percolation ↓)</text>
      <path d="M20,88 q20,-5 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t20,0" stroke={C.waterDeep} strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
      <text x={252} y={84} fontSize={7} fill={C.waterDeep}>water table</text>
      <rect x={20} y={90} width={260} height={48} fill={C.sat} />
      <text x={150} y={110} textAnchor="middle" fontSize={9} fill="#173a5e" fontWeight={600}>Saturated zone (aquifer)</text>
      <text x={150} y={122} textAnchor="middle" fontSize={7.5} fill="#173a5e">lateral GW flow → receiving node</text>
      <rect x={20} y={138} width={260} height={12} fill={C.soilDark} />
      <text x={150} y={147} textAnchor="middle" fontSize={7.5} fill="#fff">aquifer bottom (impervious)</text>
      <g>
        <rect x={256} y={92} width={16} height={44} fill="#fff" stroke={C.drain} />
        <text x={264} y={106} textAnchor="middle" fontSize={7} fill={C.drain}>node</text>
        <path d="M236,118 h16" stroke={C.waterDeep} strokeWidth={2.5} />
        <path d="M252,118 l-5,-3 v6 z" fill={C.waterDeep} />
      </g>
      <g stroke={C.waterDeep} strokeWidth={1.2}>
        <path d="M90,50 v28" /><path d="M90,78 l-3,-5 h6 z" fill={C.waterDeep} />
        <path d="M190,50 v28" /><path d="M190,78 l-3,-5 h6 z" fill={C.waterDeep} />
      </g>
      <rect x={20} y={4} width={260} height={146} fill="none" stroke="#d0d0d8" />
    </svg>
  );
}

export function SnowPackSchematic() {
  return (
    <svg viewBox="0 0 300 150" className="w-full h-full" role="img" aria-label="Snow pack schematic">
      <rect width={300} height={150} fill="#fff" />
      <rect x={20} y={4} width={260} height={40} fill={C.sky} opacity={0.5} />
      <g fill="#9ec8e8">
        {[40, 80, 120, 160, 200, 240].map((x, i) => (
          <text key={i} x={x} y={16 + (i % 2) * 8} fontSize={9}>*</text>
        ))}
      </g>
      <path d="M20,64 q40,-16 75,-8 t75,-4 t75,6 t35,2 V90 H20 Z" fill="#eef4fa" stroke="#b8d0e4" />
      <text x={150} y={80} textAnchor="middle" fontSize={9} fill="#3a5070" fontWeight={600}>Snow pack (plowable / impervious / pervious)</text>
      <rect x={20} y={90} width={130} height={14} fill={C.pavement} />
      <text x={85} y={100} textAnchor="middle" fontSize={7.5} fill="#fff">impervious</text>
      <rect x={150} y={90} width={130} height={14} fill={C.veg} />
      <text x={215} y={100} textAnchor="middle" fontSize={7.5} fill="#fff">pervious</text>
      <g stroke={C.waterDeep} strokeWidth={1.2}>
        <path d="M70,104 v18" /><path d="M70,122 l-3,-5 h6 z" fill={C.waterDeep} />
        <path d="M230,104 v18" /><path d="M230,122 l-3,-5 h6 z" fill={C.waterDeep} />
      </g>
      <text x={150} y={132} textAnchor="middle" fontSize={7.5} fill={C.label}>melt → runoff / infiltration</text>
      <rect x={20} y={4} width={260} height={134} fill="none" stroke="#d0d0d8" />
    </svg>
  );
}
