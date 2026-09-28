import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { useNeuralProfile } from '../hooks/useNeuralProfile';
import { DEFAULT_DATE } from '../utils/api';
import {
  Layers, ChevronRight, Anchor,
  Sun, Moon, Globe, Eye, EyeOff, Activity
} from 'lucide-react';

interface SelectedPoint {
  lat: number;
  lng: number;
}

import {
  REGION_CONFIGS,
  getPhysicalVariables,
  mixedLayerDepth,
  ActiveRegion,
} from '../utils/oceanPhysics';

interface OceanExplorerProps {
  onExploreProfile?: (lat: number, lng: number) => void;
  onRegionChange?: (region: ActiveRegion) => void;
  initialRegion?: ActiveRegion;
  onNavigateTo?: (view: 'dive' | 'reconstruction' | 'truth-check' | 'intelligence', coords: { lat: number; lng: number }) => void;
}

// ── Tile Providers ────────────────────────────────────────────────────────
const MAP_THEMES = {
  dark: {
    label: 'Dark',
    icon: Moon,
    // Stadia Maps dark — completely free, no API key required
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 20,
  },
  satellite: {
    label: 'Satellite',
    icon: Globe,
    // Esri World Imagery — free, no key needed
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  light: {
    label: 'Light',
    icon: Sun,
    // OpenStreetMap standard — completely free
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

export const OceanExplorer: React.FC<OceanExplorerProps> = ({
  onExploreProfile,
  onRegionChange,
  initialRegion = 'bob',
}) => {
  // State
  const [selectedRegion, setSelectedRegion] = useState<ActiveRegion>(initialRegion);
  const [mapTheme, setMapTheme] = useState<'dark' | 'satellite' | 'light'>('dark');
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint>(
    initialRegion === 'bob' ? { lat: 15.50, lng: 88.25 } : { lat: 16.50, lng: 66.50 }
  );


  // Layer Toggles
  const [showHeatwave, setShowHeatwave] = useState(true);
  const [showCyclone, setShowCyclone] = useState(true);
  const [showArgo, setShowArgo] = useState(true);
  const [showPointCloud, setShowPointCloud] = useState(true);

  // Inspector Panel State (Single floating tabbed panel)
  const [activeTab, setActiveTab] = useState<'inspect' | 'heatwave' | 'cyclone' | 'argo' | 'export'>('inspect');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const selectedMarkerRef = useRef<L.Marker | null>(null);

  const currentRegion = REGION_CONFIGS[selectedRegion];
  const physicsVars = getPhysicalVariables(selectedPoint.lat, selectedPoint.lng, selectedRegion);
  const { result: neural } = useNeuralProfile(selectedPoint.lat, selectedPoint.lng, selectedRegion);
  // Inside the dataset domain, show the real satellite inputs and the model's mixed-layer depth
  const activeVars = neural?.in_domain
    ? {
        ...physicsVars,
        sst: neural.surface.sst.toFixed(2),
        sss: neural.surface.sss.toFixed(2),
        ssh: neural.surface.sla.toFixed(2),
        current: Math.hypot(neural.surface.u_cur, neural.surface.v_cur).toFixed(2),
        wind: Math.hypot(neural.surface.u_wind, neural.surface.v_wind).toFixed(1),
        mld: mixedLayerDepth(neural.depths_m, neural.temperatures),
      }
    : physicsVars;

  // ── Initialize Leaflet Map ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: currentRegion.center,
      zoom: currentRegion.zoom,
      minZoom: 4,
      maxZoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    const tile = L.tileLayer(MAP_THEMES[mapTheme].url, {
      attribution: MAP_THEMES[mapTheme].attribution,
      maxZoom: MAP_THEMES[mapTheme].maxZoom,
      subdomains: 'abcd',
    }).addTo(map);

    tileLayerRef.current = tile;
    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Ocean Click Listener to sample coordinates
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = +e.latlng.lat.toFixed(4);
      const lng = +e.latlng.lng.toFixed(4);
      setSelectedPoint({ lat, lng });
      setActiveTab('inspect');
      setIsPanelCollapsed(false);
    });

    // Invalidate size after layout settles
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // ── Switch Map Tile Theme (Dark / Satellite / Light) ─────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const map = mapInstanceRef.current;
    map.removeLayer(tileLayerRef.current);

    const newTile = L.tileLayer(MAP_THEMES[mapTheme].url, {
      attribution: MAP_THEMES[mapTheme].attribution,
      maxZoom: MAP_THEMES[mapTheme].maxZoom,
      subdomains: 'abcd',
    }).addTo(map);

    tileLayerRef.current = newTile;
  }, [mapTheme]);

  // ── Handle Region Change (FlyTo + Adjust View) ───────────────────────────
  const handleRegionChange = (r: ActiveRegion) => {
    setSelectedRegion(r);
    onRegionChange?.(r);
    const target = REGION_CONFIGS[r];

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(target.center, target.zoom, {
        duration: 1.4,
        easeLinearity: 0.25,
      });
    }

    // Set a representative default target point in the new region
    if (r === 'bob') {
      setSelectedPoint({ lat: 15.50, lng: 88.25 });
    } else {
      setSelectedPoint({ lat: 16.50, lng: 66.50 });
    }
  };

  useEffect(() => {
    if (initialRegion && initialRegion !== selectedRegion) {
      handleRegionChange(initialRegion);
    }
  }, [initialRegion]);

  // ── Update Map Overlays (ARGO, Cyclone, Heatwave, Point Cloud, Selected) ─
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Point Cloud / Grid Samples
    if (showPointCloud) {
      currentRegion.sampleGrid.forEach((pt) => {
        const color =
          pt.category === 'Heatwave Hazard' ? '#f43f5e' :
          pt.category === 'Elevated' ? '#f59e0b' :
          '#00f0ff';

        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius: 5,
          fillColor: color,
          fillOpacity: 0.85,
          color: '#050b14',
          weight: 1.5,
        });

        circle.bindTooltip(`
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px;">
            <div style="color: ${color}; font-weight: bold;">${pt.category}</div>
            <div>SST: <b>${pt.sst}°C</b> | Lat: ${pt.lat}°N, Lon: ${pt.lng}°E</div>
            <div style="color: #64748b; font-size: 9px;">Click to sample thermal profile</div>
          </div>
        `, { className: 'ocean-popup', direction: 'top' });

        circle.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedPoint({ lat: pt.lat, lng: pt.lng });
          setActiveTab('inspect');
          setIsPanelCollapsed(false);
        });

        group.addLayer(circle);
      });
    }

    // 2. Heatwave Anomaly Zones
    if (showHeatwave) {
      currentRegion.heatwaves.forEach((hw) => {
        const color = hw.severity === 'HIGH' ? '#f43f5e' : hw.severity === 'MODERATE' ? '#f59e0b' : '#10b981';
        const zone = L.circle([hw.lat, hw.lng], {
          radius: hw.radiusKm * 1000,
          color: color,
          weight: 1.5,
          opacity: 0.7,
          fillColor: color,
          fillOpacity: 0.16,
          dashArray: '4, 6',
        });

        zone.bindTooltip(`
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px;">
            <span style="color: ${color}; font-weight: bold;">[${hw.severity}] ${hw.region}</span><br/>
            ΔSST: <b>${hw.delta}</b> | Duration: ${hw.duration}
          </div>
        `, { className: 'ocean-popup', sticky: true });

        zone.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedPoint({ lat: hw.lat, lng: hw.lng });
          setActiveTab('heatwave');
          setIsPanelCollapsed(false);
        });

        group.addLayer(zone);
      });
    }

    // 3. Cyclone Track & Radius
    if (showCyclone) {
      const cyc = currentRegion.cyclone;

      // Track trajectory polyline
      const trackLine = L.polyline(cyc.track, {
        color: '#f43f5e',
        weight: 2.5,
        opacity: 0.8,
        dashArray: '6, 6',
      });
      group.addLayer(trackLine);

      // Warning radius circle
      const windCircle = L.circle(cyc.center, {
        radius: cyc.radiusKm * 1000,
        color: '#f43f5e',
        weight: 1,
        fillColor: '#f43f5e',
        fillOpacity: 0.1,
      });
      group.addLayer(windCircle);

      // Cyclone Eye custom icon
      const cycloneIcon = L.divIcon({
        className: 'cyclone-marker-container',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(244,63,94,0.4); animation: sonar 2.5s infinite;"></div>
            <div style="width: 26px; height: 26px; border-radius: 50%; background: rgba(80,10,25,0.9); border: 2px solid #f43f5e; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(244,63,94,0.6);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93"/></svg>
            </div>
            <div style="position: absolute; top: -24px; background: rgba(10,20,40,0.95); border: 1px solid rgba(244,63,94,0.6); padding: 1px 6px; border-radius: 4px; font-size: 9px; font-family: monospace; color: #fecdd3; white-space: nowrap; font-weight: bold;">
              ${cyc.name}
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const cycloneMarker = L.marker(cyc.center, { icon: cycloneIcon });
      cycloneMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSelectedPoint({ lat: cyc.center[0], lng: cyc.center[1] });
        setActiveTab('cyclone');
        setIsPanelCollapsed(false);
      });
      group.addLayer(cycloneMarker);
    }

    // 4. ARGO In-Situ Floats
    if (showArgo) {
      currentRegion.argoFloats.forEach((f) => {
        const floatIcon = L.divIcon({
          className: 'argo-marker-container',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,240,255,0.2); animation: pulse-radar 2.4s infinite;"></div>
              <div style="width: 12px; height: 12px; border-radius: 50%; background: #00f0ff; border: 2px solid #ffffff; box-shadow: 0 0 10px #00f0ff;"></div>
              <div style="position: absolute; left: 16px; top: -4px; background: rgba(5,15,30,0.92); border: 1px solid rgba(0,240,255,0.4); padding: 1px 5px; border-radius: 4px; font-size: 9px; font-family: monospace; color: #67e8f9; white-space: nowrap; font-weight: bold;">
                #${f.id}
              </div>
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const floatMarker = L.marker([f.lat, f.lng], { icon: floatIcon });
        floatMarker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelectedPoint({ lat: f.lat, lng: f.lng });
          setActiveTab('argo');
          setIsPanelCollapsed(false);
        });
        group.addLayer(floatMarker);
      });
    }

    // 5. Selected User Target Coordinates Pin
    if (selectedPoint) {
      if (selectedMarkerRef.current) {
        group.removeLayer(selectedMarkerRef.current);
      }

      const targetIcon = L.divIcon({
        className: 'target-marker-container',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; pointer-events: none;">
            <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #00f0ff; animation: sonar 1.8s infinite;"></div>
            <div style="position: absolute; width: 56px; height: 56px; border-radius: 50%; border: 1px solid rgba(0,240,255,0.35); animation: sonar 1.8s infinite; animation-delay: 0.4s;"></div>
            <div style="width: 14px; height: 14px; border-radius: 50%; background: #00f0ff; border: 2px solid #ffffff; box-shadow: 0 0 14px #00f0ff;"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const targetMarker = L.marker([selectedPoint.lat, selectedPoint.lng], { icon: targetIcon, zIndexOffset: 1000 });
      group.addLayer(targetMarker);
      selectedMarkerRef.current = targetMarker;
    }
  }, [selectedRegion, showHeatwave, showCyclone, showArgo, showPointCloud, selectedPoint]);

  // ── Fly Map To Feature on Tab Click ───────────────────────────────────────
  const flyToCoord = (lat: number, lng: number, zoomLevel: number = 7) => {
    setSelectedPoint({ lat, lng });
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], zoomLevel, { duration: 1.0 });
    }
  };



  return (
    <div className="w-full h-full bg-[#050b14] flex flex-col overflow-hidden relative select-none">
      
      {/* ── TOP HEADER ── */}
      <header className="h-14 glass-panel border-b border-cyan-500/20 px-6 md:px-8 flex items-center justify-between z-30 shrink-0 shadow-lg gap-4">

        {/* Left: Region Selector */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest hidden md:block">REGION</span>
          <div className="flex bg-[#061022]/90 p-1 rounded-xl border border-cyan-500/25 text-xs font-mono gap-1">
            {(['bob', 'as'] as const).map((r) => (
              <button
                key={r}
                onClick={() => handleRegionChange(r)}
                className={`px-4 py-1.5 rounded-lg transition-all duration-200 font-medium whitespace-nowrap ${
                  selectedRegion === r
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-glow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {r === 'bob' ? 'Bay of Bengal' : 'Arabian Sea'}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Map Theme Toggle + Telemetry */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex bg-[#061022]/90 p-1 rounded-xl border border-cyan-500/25 text-xs font-mono gap-0.5">
            {(Object.keys(MAP_THEMES) as Array<keyof typeof MAP_THEMES>).map((key) => {
              const ThemeIcon = MAP_THEMES[key].icon;
              const isSelected = mapTheme === key;
              return (
                <button
                  key={key}
                  onClick={() => setMapTheme(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-glow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                  title={`${MAP_THEMES[key].label} map variant`}
                >
                  <ThemeIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{MAP_THEMES[key].label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsPanelCollapsed((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
              !isPanelCollapsed
                ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-300 shadow-glow-sm'
                : 'bg-[#061022]/80 border-slate-700 text-slate-400 hover:border-cyan-500/30'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Telemetry</span>
            {isPanelCollapsed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* ── MAIN MAP WORKSPACE ── */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        
        {/* LEAFLET MAP CONTAINER - Always 100% full screen */}
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0 cursor-crosshair" />

        {/* Scanline Texture Overlay */}
        <div className="absolute inset-0 pointer-events-none scanlines opacity-25 z-10" />

        {/* ── LEFT FLOATING LAYER CONTROLS (AeroThermal.AI style) ── */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-xs">
          <div className="glass-card p-3 rounded-xl border border-cyan-500/20 backdrop-blur-md shadow-2xl">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-cyan-500/15">
              <div className="flex items-center gap-1.5 text-xs font-mono text-cyan-300 font-semibold">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>MAP LAYERS</span>
              </div>
              <span className="text-[9px] font-mono text-slate-400">0.25° Grid</span>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono">
              {/* Point Cloud Toggle */}
              <button
                onClick={() => setShowPointCloud((v) => !v)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showPointCloud
                    ? 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300'
                    : 'bg-[#050e1f]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${showPointCloud ? 'bg-cyan-400 shadow-glow-sm' : 'bg-slate-600'}`}></span>
                  <span>Thermal Point Cloud</span>
                </div>
                <span className="text-[9px] text-slate-400">{currentRegion.sampleGrid.length}</span>
              </button>

              {/* Heatwave Hazards */}
              <button
                onClick={() => {
                  setShowHeatwave((v) => !v);
                  if (!showHeatwave) setActiveTab('heatwave');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showHeatwave
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                    : 'bg-[#050e1f]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${showHeatwave ? 'bg-amber-400 shadow-glow-sm' : 'bg-slate-600'}`}></span>
                  <span>Marine Heatwave Zones</span>
                </div>
                <span className="text-[9px] text-amber-400/80">{currentRegion.heatwaves.length}</span>
              </button>

              {/* Cyclone Trajectory */}
              <button
                onClick={() => {
                  setShowCyclone((v) => !v);
                  if (!showCyclone) setActiveTab('cyclone');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showCyclone
                    ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                    : 'bg-[#050e1f]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${showCyclone ? 'bg-rose-400 shadow-glow-sm' : 'bg-slate-600'}`}></span>
                  <span>Cyclone Forecast Track</span>
                </div>
                <span className="text-[9px] text-rose-400/80">Active</span>
              </button>

              {/* ARGO Floats */}
              <button
                onClick={() => {
                  setShowArgo((v) => !v);
                  if (!showArgo) setActiveTab('argo');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                  showArgo
                    ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                    : 'bg-[#050e1f]/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${showArgo ? 'bg-cyan-400 shadow-glow-sm' : 'bg-slate-600'}`}></span>
                  <span>In-Situ ARGO Network</span>
                </div>
                <span className="text-[9px] text-cyan-400/80">{currentRegion.argoFloats.length}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── FLOATING RIGHT INSPECTOR DRAWER (Does NOT push or squeeze the map!) ── */}
        {!isPanelCollapsed && (
          <aside className="absolute right-4 top-4 bottom-4 w-80 md:w-[26rem] z-20 glass-card rounded-2xl border border-cyan-500/30 flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl">
            
            {/* Header Tabs */}
            <div className="bg-[#050d1e]/90 p-2 border-b border-cyan-500/20 flex items-center justify-between shrink-0">
              <div className="flex gap-1 overflow-x-auto py-0.5 scrollbar-none">
                <button
                  onClick={() => setActiveTab('inspect')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all whitespace-nowrap ${
                    activeTab === 'inspect'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 font-bold shadow-glow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Inspection
                </button>
                <button
                  onClick={() => setActiveTab('heatwave')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all whitespace-nowrap ${
                    activeTab === 'heatwave'
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-400/40 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Heatwave ({currentRegion.heatwaves.length})
                </button>
                <button
                  onClick={() => setActiveTab('cyclone')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all whitespace-nowrap ${
                    activeTab === 'cyclone'
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-400/40 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cyclone
                </button>
                <button
                  onClick={() => setActiveTab('argo')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all whitespace-nowrap ${
                    activeTab === 'argo'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ARGO ({currentRegion.argoFloats.length})
                </button>
                <button
                  onClick={() => setActiveTab('export')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all whitespace-nowrap ${
                    activeTab === 'export'
                      ? 'bg-slate-700/60 text-white border border-slate-500'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  API
                </button>
              </div>

              <button
                onClick={() => setIsPanelCollapsed(true)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-1"
                title="Collapse Panel"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
              
              {/* ── TAB 1: POINT INSPECTION ── */}
              {activeTab === 'inspect' && (
                <div className="space-y-4">
                  {/* Coordinates Badge */}
                  <div className="bg-[#040c1a]/90 p-3.5 rounded-xl border border-cyan-500/30 glow-accent-sm">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest mb-1">
                      <span>Target Subsurface Column</span>
                      <span className="text-cyan-400 font-bold">0 – 1000m</span>
                    </div>
                    <div className="text-base font-bold text-cyan-300 text-glow">
                      {selectedPoint.lat.toFixed(4)}° N, {selectedPoint.lng.toFixed(4)}° E
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Region: <span className="text-slate-200">{currentRegion.name}</span>
                    </div>
                  </div>

                  {/* Surface Variables Readout */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                      Surface Satellite Inputs (X)
                    </div>
                    <div className="space-y-1.5">
                      {[
                        ['Sea Surface Temp (SST)', `${activeVars.sst} °C`, 'OSTIA / L4'],
                        ['Sea Surface Salinity (SSS)', `${activeVars.sss} PSU`, 'GLORYS12'],
                        ['Sea Level Anomaly (SSH)', `${activeVars.ssh} m`, 'DUACS'],
                        ['Current Speed (U/V)', `${activeVars.current} m/s`, 'GLORYS12'],
                        ['Surface Winds (10m)', `${activeVars.wind} m/s`, 'CCMP V3.1'],
                      ].map(([label, val, src]) => (
                        <div key={label} className="flex items-center justify-between p-2.5 rounded-lg bg-[#061226]/80 border border-cyan-500/15">
                          <div>
                            <div className="text-[11px] text-slate-200">{label}</div>
                            <div className="text-[9px] text-slate-500">{src}</div>
                          </div>
                          <span className="text-cyan-300 font-bold text-xs">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Derived Inferences */}
                  <div className="p-3 rounded-xl bg-[#061226]/80 border border-cyan-500/15">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                      Physical Indicators
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="p-2 rounded bg-[#030914]/80 border border-cyan-500/10">
                        <span className="text-slate-400">Mixed Layer:</span>
                        <div className="text-cyan-300 font-bold text-xs mt-0.5">{activeVars.mld} m</div>
                      </div>
                      <div className="p-2 rounded bg-[#030914]/80 border border-cyan-500/10">
                        <span className="text-slate-400">Heat Content (OHC):</span>
                        <div className="text-cyan-300 font-bold text-xs mt-0.5">{activeVars.ohc} kJ/cm²</div>
                      </div>
                    </div>
                  </div>

                  {/* CTA to Dive / Reconstruction */}
                  <button
                    onClick={() => onExploreProfile && onExploreProfile(selectedPoint.lat, selectedPoint.lng)}
                    className="btn-accent w-full py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 font-semibold shadow-glow-sm"
                  >
                    <span>Reconstruct Vertical Profile (OceanDive)</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── TAB 2: HEATWAVE ALERTS ── */}
              {activeTab === 'heatwave' && (
                <div className="space-y-3">
                  <div className="text-[10px] text-slate-400 leading-relaxed">
                    Areas where Sea Surface Temperature exceeds 90th percentile threshold for over 5 consecutive days.
                  </div>

                  {currentRegion.heatwaves.map((hw) => (
                    <div
                      key={hw.id}
                      onClick={() => flyToCoord(hw.lat, hw.lng, 8)}
                      className="p-3.5 rounded-xl border border-amber-500/30 bg-[#140f08]/80 hover:border-amber-400 transition-all cursor-pointer group shadow-lg"
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] text-slate-400">{hw.date}</span>
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {hw.severity}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                        {hw.region}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t border-amber-500/20 text-[10px] text-slate-300">
                        <span>Anomaly: <b className="text-amber-400">{hw.delta}</b></span>
                        <span>Duration: <b>{hw.duration}</b></span>
                        <span>Radius: <b>{hw.radiusKm} km</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── TAB 3: CYCLONE TRACKER ── */}
              {activeTab === 'cyclone' && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-rose-500/30 bg-[#1a080c]/80 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-rose-300">{currentRegion.cyclone.name}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        MONITORED
                      </span>
                    </div>
                    <div className="space-y-2 text-[11px]">
                      <div className="flex justify-between border-b border-rose-500/15 pb-1">
                        <span className="text-slate-400">Classification:</span>
                        <span className="text-white">{currentRegion.cyclone.status}</span>
                      </div>
                      <div className="flex justify-between border-b border-rose-500/15 pb-1">
                        <span className="text-slate-400">Eye Coordinates:</span>
                        <span className="text-rose-300 font-bold">{currentRegion.cyclone.center[0]}°N, {currentRegion.cyclone.center[1]}°E</span>
                      </div>
                      <div className="flex justify-between border-b border-rose-500/15 pb-1">
                        <span className="text-slate-400">Sustained Wind:</span>
                        <span className="text-white">{currentRegion.cyclone.maxWind}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Central Pressure:</span>
                        <span className="text-white">{currentRegion.cyclone.pressure}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => flyToCoord(currentRegion.cyclone.center[0], currentRegion.cyclone.center[1], 8)}
                      className="mt-3 w-full py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-bold transition-all"
                    >
                      Focus Cyclone Center
                    </button>
                  </div>
                </div>
              )}

              {/* ── TAB 4: ARGO IN-SITU FLOATS ── */}
              {activeTab === 'argo' && (
                <div className="space-y-2.5">
                  <div className="text-[10px] text-slate-400 mb-2">
                    Active floats profiling vertical temperature every 10 days for validation and truth-checking.
                  </div>

                  {currentRegion.argoFloats.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => flyToCoord(f.lat, f.lng, 8)}
                      className="p-3 rounded-xl border border-cyan-500/20 bg-[#061226]/80 hover:border-cyan-400 transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1.5">
                          <Anchor className="w-3 h-3 text-cyan-400" />
                          <span className="font-bold text-xs text-cyan-300 group-hover:text-cyan-200">#{f.id}</span>
                        </div>
                        <span className="text-[9px] text-slate-400">{f.cycles} cycles</span>
                      </div>
                      <div className="text-[10px] text-slate-300 space-y-0.5">
                        <div>Location: <span className="text-white">{f.lat}°N, {f.lng}°E</span></div>
                        <div>Max Depth: <span className="text-cyan-400 font-bold">{f.depth}m</span></div>
                        <div>Last Telemetry: <span className="text-slate-400">{f.lastProfile}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── TAB 5: API / EXPORT ── */}
              {activeTab === 'export' && (
                <div className="space-y-3">
                  <div className="text-[10px] text-slate-400">
                    Direct integration points for operational meteorological ingestion.
                  </div>
                  <div className="p-3 rounded-xl bg-[#061226]/80 border border-cyan-500/20 space-y-1">
                    <span className="text-[10px] text-slate-400">NetCDF-4 Export Format</span>
                    <div className="p-2 rounded bg-[#030914] text-[10px] text-cyan-300 font-mono break-all border border-cyan-500/10">
                      dataset.nc [60, 57, 81, 15]
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#061226]/80 border border-cyan-500/20 space-y-1">
                    <span className="text-[10px] text-slate-400">REST Inference Query</span>
                    <div className="p-2 rounded bg-[#030914] text-[10px] text-cyan-300 font-mono break-all border border-cyan-500/10">
                      GET /api/v1/profile?lat={selectedPoint.lat.toFixed(4)}&lon={selectedPoint.lng.toFixed(4)}&date={DEFAULT_DATE}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}



      </div>
    </div>
  );
};
