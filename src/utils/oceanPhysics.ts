export type ActiveRegion = 'bob' | 'as';

export interface HeatwaveData {
  id: string;
  region: string;
  lat: number;
  lng: number;
  radiusKm: number;
  severity: 'HIGH' | 'MODERATE' | 'LOW';
  delta: string;
  duration: string;
  date: string;
}

export interface ArgoFloatData {
  id: string;
  lat: number;
  lng: number;
  lastProfile: string;
  depth: number;
  cycles: number;
  batteryPct: number;
}

export interface CycloneData {
  name: string;
  status: string;
  center: [number, number];
  maxWind: string;
  pressure: string;
  track: Array<[number, number]>;
  radiusKm: number;
}

export interface GridSample {
  lat: number;
  lng: number;
  sst: number;
  category: 'Normal' | 'Elevated' | 'Heatwave Hazard' | 'Upwelling';
}

export interface RegionData {
  name: string;
  code: ActiveRegion;
  basinTitle: string;
  description: string;
  center: [number, number];
  zoom: number;
  bounds: [[number, number], [number, number]];
  heatwaves: HeatwaveData[];
  argoFloats: ArgoFloatData[];
  cyclone: CycloneData;
  sampleGrid: GridSample[];
}

export const REGION_CONFIGS: Record<ActiveRegion, RegionData> = {
  bob: {
    name: 'Bay of Bengal',
    code: 'bob',
    basinTitle: 'Northern Indian Ocean - Bay of Bengal Basin',
    description: 'High freshwater runoff from major river systems creates intense surface stratification and barrier layers.',
    center: [14.8, 88.5],
    zoom: 6,
    bounds: [[6.5, 79.5], [22.8, 98.5]],
    heatwaves: [
      { id: 'HW-BoB-01', region: 'North-West Bay (Odisha Basin)', lat: 18.2, lng: 88.6, radiusKm: 125, severity: 'HIGH', delta: '+1.8°C', duration: '14 days', date: '2024-03-18' },
      { id: 'HW-BoB-02', region: 'Andaman Sea Marine Shelf', lat: 11.8, lng: 93.4, radiusKm: 110, severity: 'MODERATE', delta: '+1.2°C', duration: '8 days', date: '2024-03-11' },
      { id: 'HW-BoB-03', region: 'Coromandel Coastal Front', lat: 13.9, lng: 82.1, radiusKm: 80, severity: 'LOW', delta: '+0.7°C', duration: '5 days', date: '2024-02-26' },
    ],
    argoFloats: [
      { id: '6904117', lat: 14.22, lng: 88.41, lastProfile: '2024-03-29', depth: 1000, cycles: 142, batteryPct: 88 },
      { id: '6904231', lat: 17.85, lng: 91.07, lastProfile: '2024-03-27', depth: 2000, cycles: 89, batteryPct: 92 },
      { id: '6903821', lat: 11.53, lng: 84.66, lastProfile: '2024-03-25', depth: 1000, cycles: 201, batteryPct: 74 },
      { id: '6904019', lat: 19.14, lng: 92.32, lastProfile: '2024-03-22', depth: 500, cycles: 67, batteryPct: 95 },
    ],
    cyclone: {
      name: 'Deep Depression 03B',
      status: 'Active Monitoring (IMD Alert)',
      center: [16.8, 90.2],
      maxWind: '48 kn (89 km/h)',
      pressure: '994 hPa',
      radiusKm: 160,
      track: [
        [13.5, 93.0],
        [14.9, 91.8],
        [16.8, 90.2],
        [18.6, 88.9],
        [20.4, 87.6],
      ],
    },
    sampleGrid: [
      { lat: 12.0, lng: 82.5, sst: 28.2, category: 'Normal' },
      { lat: 12.0, lng: 85.0, sst: 28.5, category: 'Normal' },
      { lat: 12.0, lng: 88.0, sst: 29.1, category: 'Elevated' },
      { lat: 12.0, lng: 91.0, sst: 29.3, category: 'Elevated' },
      { lat: 14.0, lng: 82.0, sst: 28.1, category: 'Normal' },
      { lat: 14.0, lng: 85.0, sst: 28.8, category: 'Normal' },
      { lat: 14.0, lng: 88.0, sst: 29.4, category: 'Elevated' },
      { lat: 14.0, lng: 91.5, sst: 29.8, category: 'Elevated' },
      { lat: 16.0, lng: 83.5, sst: 28.4, category: 'Normal' },
      { lat: 16.0, lng: 86.5, sst: 29.3, category: 'Elevated' },
      { lat: 16.0, lng: 89.5, sst: 30.2, category: 'Heatwave Hazard' },
      { lat: 16.0, lng: 92.5, sst: 29.7, category: 'Elevated' },
      { lat: 18.0, lng: 85.5, sst: 28.9, category: 'Normal' },
      { lat: 18.0, lng: 88.5, sst: 30.6, category: 'Heatwave Hazard' },
      { lat: 18.0, lng: 91.5, sst: 30.1, category: 'Heatwave Hazard' },
      { lat: 20.0, lng: 88.0, sst: 29.2, category: 'Elevated' },
      { lat: 20.0, lng: 91.0, sst: 29.0, category: 'Elevated' },
      { lat: 10.0, lng: 84.0, sst: 28.6, category: 'Normal' },
      { lat: 10.0, lng: 88.0, sst: 29.0, category: 'Normal' },
      { lat: 10.0, lng: 93.0, sst: 29.9, category: 'Elevated' },
    ],
  },
  as: {
    name: 'Arabian Sea',
    code: 'as',
    basinTitle: 'Western Indian Ocean - Arabian Sea Basin',
    description: 'High surface evaporation and arid continental winds produce high-salinity Arabian Sea High Salinity Water (ASHSW).',
    center: [16.8, 66.8],
    zoom: 6,
    bounds: [[7.5, 57.0], [24.5, 76.5]],
    heatwaves: [
      { id: 'HW-AS-01', region: 'Central Arabian Sea Warm Pool', lat: 16.2, lng: 65.5, radiusKm: 140, severity: 'HIGH', delta: '+2.1°C', duration: '18 days', date: '2024-03-16' },
      { id: 'HW-AS-02', region: 'Gulf of Oman Inflow Front', lat: 22.4, lng: 61.8, radiusKm: 95, severity: 'MODERATE', delta: '+1.4°C', duration: '10 days', date: '2024-03-08' },
      { id: 'HW-AS-03', region: 'Lakshadweep Offshore Ridge', lat: 10.8, lng: 71.8, radiusKm: 85, severity: 'LOW', delta: '+0.8°C', duration: '6 days', date: '2024-02-28' },
    ],
    argoFloats: [
      { id: '6905541', lat: 16.20, lng: 64.50, lastProfile: '2024-03-28', depth: 1500, cycles: 178, batteryPct: 84 },
      { id: '6905589', lat: 19.45, lng: 68.12, lastProfile: '2024-03-26', depth: 2000, cycles: 112, batteryPct: 91 },
      { id: '6905602', lat: 12.80, lng: 68.90, lastProfile: '2024-03-24', depth: 1000, cycles: 95, batteryPct: 89 },
      { id: '6905624', lat: 14.10, lng: 72.30, lastProfile: '2024-03-23', depth: 1200, cycles: 140, batteryPct: 76 },
    ],
    cyclone: {
      name: 'Depression ARB-01',
      status: 'Developing Low Pressure',
      center: [15.2, 65.4],
      maxWind: '34 kn (63 km/h)',
      pressure: '1002 hPa',
      radiusKm: 130,
      track: [
        [12.8, 63.2],
        [13.9, 64.3],
        [15.2, 65.4],
        [16.8, 66.7],
        [18.4, 68.2],
      ],
    },
    sampleGrid: [
      { lat: 12.0, lng: 65.0, sst: 28.5, category: 'Normal' },
      { lat: 12.0, lng: 68.0, sst: 28.9, category: 'Normal' },
      { lat: 12.0, lng: 71.0, sst: 29.2, category: 'Elevated' },
      { lat: 14.0, lng: 62.0, sst: 27.8, category: 'Normal' },
      { lat: 14.0, lng: 65.0, sst: 29.1, category: 'Elevated' },
      { lat: 14.0, lng: 68.0, sst: 29.6, category: 'Elevated' },
      { lat: 14.0, lng: 71.5, sst: 29.4, category: 'Elevated' },
      { lat: 16.0, lng: 62.5, sst: 28.2, category: 'Normal' },
      { lat: 16.0, lng: 65.5, sst: 30.7, category: 'Heatwave Hazard' },
      { lat: 16.0, lng: 68.5, sst: 29.8, category: 'Elevated' },
      { lat: 16.0, lng: 71.0, sst: 29.1, category: 'Elevated' },
      { lat: 18.0, lng: 64.0, sst: 28.6, category: 'Normal' },
      { lat: 18.0, lng: 67.0, sst: 29.5, category: 'Elevated' },
      { lat: 18.0, lng: 70.0, sst: 29.0, category: 'Normal' },
      { lat: 20.0, lng: 65.0, sst: 27.9, category: 'Normal' },
      { lat: 20.0, lng: 68.0, sst: 28.4, category: 'Normal' },
      { lat: 22.0, lng: 62.0, sst: 29.8, category: 'Heatwave Hazard' },
      { lat: 10.0, lng: 66.0, sst: 29.0, category: 'Normal' },
      { lat: 10.0, lng: 70.0, sst: 29.4, category: 'Elevated' },
    ],
  },
};

export interface PhysicalVariables {
  sst: string;
  sss: string;
  ssh: string;
  current: string;
  wind: string;
  mld: number;
  ohc: number;
  stratification: string;
  heatwaveStatus: 'NORMAL' | 'ELEVATED' | 'HIGH HAZARD';
  anomalyDelta: string;
}

export const getPhysicalVariables = (lat: number, lng: number, region?: ActiveRegion): PhysicalVariables => {
  const seed = Math.sin(lat * 12.9898 + lng * 78.233);
  const isBoB = region ? region === 'bob' : lng > 77;
  
  // Base temperatures and salinity differ naturally by basin
  const baseSST = isBoB ? 28.2 : 27.8;
  const sstNum = baseSST + Math.abs((seed * 1000) % 2.9);
  
  // BoB is fresher (32.5 - 34.2 PSU); Arabian Sea is saltier (35.2 - 36.8 PSU)
  const baseSSS = isBoB ? 33.1 : 35.8;
  const sssNum = baseSSS + Math.abs(((seed * 700) % 1.2));
  
  const sshNum = 0.08 + Math.abs(((seed * 500) % 0.16));
  const currentNum = 0.22 + Math.abs(((seed * 300) % 0.45));
  const windNum = 4.2 + Math.abs(((seed * 900) % 4.8));
  
  // MLD: BoB has shallow MLD (~22-42m) due to freshwater cap; AS has deeper MLD (~45-75m)
  const baseMld = isBoB ? 24 : 46;
  const mld = Math.round(baseMld + Math.abs((seed * 400) % 24));
  
  // OHC: BoB has high heat content trapped in upper layer (80-115 kJ/cm²)
  const baseOhc = isBoB ? 82 : 68;
  const ohc = Math.round(baseOhc + Math.abs((seed * 600) % 32));

  // Stratification: BoB has strong thermal & halocline stratification (~2.4 - 3.2 °C/100m)
  const stratNum = isBoB ? 2.3 + Math.abs((seed * 200) % 0.9) : 1.7 + Math.abs((seed * 200) % 0.8);

  const anomaly = sstNum - 28.0;
  const heatwaveStatus =
    anomaly >= 1.5 ? 'HIGH HAZARD' :
    anomaly >= 0.8 ? 'ELEVATED' : 'NORMAL';

  return {
    sst: sstNum.toFixed(2),
    sss: sssNum.toFixed(2),
    ssh: sshNum.toFixed(2),
    current: currentNum.toFixed(2),
    wind: windNum.toFixed(1),
    mld,
    ohc,
    stratification: stratNum.toFixed(2),
    heatwaveStatus,
    anomalyDelta: `${anomaly >= 0 ? '+' : ''}${anomaly.toFixed(1)}°C`,
  };
};

export const DEPTH_LEVELS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

export interface DepthProfilePoint {
  index: number;
  depth: number;
  temp: number;
  salinity: number;
  argoTemp: number;
  argoSalinity: number;
  tempError: number;
  ci: number; // confidence interval ±
}

export const getDepthProfile = (lat: number, lng: number, region?: ActiveRegion): DepthProfilePoint[] => {
  const vars = getPhysicalVariables(lat, lng, region);
  const surfaceTemp = parseFloat(vars.sst);
  const surfaceSal = parseFloat(vars.sss);
  const mld = vars.mld;
  const isBoB = region ? region === 'bob' : lng > 77;

  return DEPTH_LEVELS.map((depth, idx) => {
    // 1. Temperature decay through thermocline
    // Above MLD: temperature is nearly isothermal (mixed layer)
    let temp: number;
    if (depth <= mld) {
      temp = surfaceTemp - (depth / (mld + 1)) * 0.15;
    } else {
      // Below MLD: exponential decay towards deep abyssal water ~4.2°C
      const decayDepth = depth - mld;
      const decay = Math.exp(-decayDepth / 160);
      temp = 4.2 + (surfaceTemp - 0.15 - 4.2) * decay;
    }

    // 2. Salinity profile:
    // BoB: low salinity at surface, increases with depth to 35.0 PSU
    // AS: high salinity at surface (ASHSW), decreases slightly to 35.1 PSU
    let salinity: number;
    if (isBoB) {
      const salIncrease = (35.0 - surfaceSal) * (1 - Math.exp(-depth / 120));
      salinity = surfaceSal + salIncrease;
    } else {
      const salDecrease = (surfaceSal - 35.1) * Math.exp(-depth / 200);
      salinity = 35.1 + salDecrease;
    }

    // 3. Realistic ARGO in-situ sensor profile with small physical microstructure noise
    const seed = Math.sin(lat + lng + depth * 0.04);
    const noise = Math.sin(depth / 35) * 0.22 + seed * 0.12;
    const argoTemp = temp + noise;
    const argoSal = salinity + Math.cos(depth / 45) * 0.06;
    const tempError = Math.abs(temp - argoTemp);
    
    // Confidence interval widens with depth (less satellite surface penetration)
    const ci = Number((0.25 + (depth / 1000) * 0.85).toFixed(2));

    return {
      index: idx,
      depth,
      temp: Number(temp.toFixed(2)),
      salinity: Number(salinity.toFixed(2)),
      argoTemp: Number(argoTemp.toFixed(2)),
      argoSalinity: Number(argoSal.toFixed(2)),
      tempError: Number(tempError.toFixed(2)),
      ci,
    };
  });
};

export interface SurfaceInputs {
  sst: number;
  sss: number;
  sla: number;
  u_cur: number;
  v_cur: number;
  u_wind: number;
  v_wind: number;
}

export const getSurfaceInputs = (lat: number, lng: number, region?: ActiveRegion, _date?: string): SurfaceInputs => {
  const vars = getPhysicalVariables(lat, lng, region);
  const cur = parseFloat(vars.current);
  const wnd = parseFloat(vars.wind);
  return {
    sst: parseFloat(vars.sst),
    sss: parseFloat(vars.sss),
    sla: parseFloat(vars.ssh),
    u_cur: Number((cur * 0.75).toFixed(2)),
    v_cur: Number((-cur * 0.35).toFixed(2)),
    u_wind: Number((-wnd * 0.82).toFixed(2)),
    v_wind: Number((wnd * 0.45).toFixed(2)),
  };
};
