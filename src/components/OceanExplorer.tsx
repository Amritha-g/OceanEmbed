import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { useNeuralProfile } from '../hooks/useNeuralProfile';
import {
  DataSource, DEFAULT_DATE, describeLineage, fetchProductGrid, fetchTransect, LatLng, pointBulletinUrl,
  ProductGrid, ProductVar, SurfaceField, TransectResponse,
} from '../utils/api';
import { useArgo } from '../hooks/useArgo';
import { gridToDataUrl, PRODUCT_RANGE, RAMP_CSS } from '../utils/colormap';
import { SourceToggle } from './SourceToggle';
import { TransectSection } from './TransectSection';
import {
  Layers, ChevronRight, Anchor,
  Sun, Moon, Globe, Eye, EyeOff, Activity, Route, FileText, Loader2
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

// Preset sections across the model domain (Bay of Bengal)
const TRANSECT_PRESETS: Array<{ label: string; points: LatLng[] }> = [
  { label: 'Chennai → Port Blair', points: [{ lat: 13.08, lng: 80.29 }, { lat: 11.62, lng: 92.73 }] },
  { label: '88°E meridional', points: [{ lat: 8.0, lng: 88.0 }, { lat: 21.5, lng: 88.0 }] },
  { label: 'Along 15°N', points: [{ lat: 15.0, lng: 80.5 }, { lat: 15.0, lng: 97.5 }] },
];

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
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const [overlay, setOverlay] = useState<ProductVar | 'none'>('none');
  const [overlayGrid, setOverlayGrid] = useState<ProductGrid | null>(null);
  const selectedMarkerRef = useRef<L.Marker | null>(null);

  // Transect drawing and the resulting cross-section
  const transectGroupRef = useRef<L.LayerGroup | null>(null);
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [transect, setTransect] = useState<TransectResponse | null>(null);
  const [transectStatus, setTransectStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [transectHover, setTransectHover] = useState<number | null>(null);

  const currentRegion = REGION_CONFIGS[selectedRegion];

  // Real ARGO floats (latest profile per float) replace the hard-coded list in the Bay of Bengal
  const { profiles: argoProfiles, status: argoStatus } = useArgo();
  const realFloats = React.useMemo(() => {
    const byFloat = new Map<string, typeof argoProfiles>();
    argoProfiles.forEach((p) => byFloat.set(p.platform, [...(byFloat.get(p.platform) ?? []), p]));
    return [...byFloat.entries()].map(([id, ps]) => {
      const last = ps.reduce((a, b) => (a.time > b.time ? a : b));
      const deepest = Math.max(...last.depths_m.filter((_, i) => last.argo[i] !== null));
      return { id, lat: last.lat, lng: last.lon, lastProfile: last.date, depth: deepest, cycles: ps.length };
    });
  }, [argoProfiles]);
  const useRealFloats = argoStatus === 'live' && selectedRegion === 'bob' && realFloats.length > 0;
  const floats = useRealFloats ? realFloats : currentRegion.argoFloats;
  const physicsVars = getPhysicalVariables(selectedPoint.lat, selectedPoint.lng, selectedRegion);
  const [dataSource, setDataSource] = useState<DataSource>('archive');
  const { result: neural, status: neuralStatus } = useNeuralProfile(
    selectedPoint.lat, selectedPoint.lng, selectedRegion, undefined, dataSource);
  // Show the model's actual inputs when they are real data (in-domain archive, or live readings)
  const useNeuralInputs = !!neural && (neural.in_domain || neural.source_mode === 'live');
  const activeVars = useNeuralInputs && neural
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
    transectGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Ocean Click Listener to sample coordinates (or add a transect vertex while drawing)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = +e.latlng.lat.toFixed(4);
      const lng = +e.latlng.lng.toFixed(4);
      if (drawingRef.current) {
        // A double-click to finish also fires two clicks at the same spot
        setWaypoints((w) => {
          const last = w[w.length - 1];
          return last && Math.abs(last.lat - lat) < 1e-3 && Math.abs(last.lng - lng) < 1e-3 ? w : [...w, { lat, lng }];
        });
        return;
      }
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
      floats.forEach((f) => {
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
  }, [selectedRegion, showHeatwave, showCyclone, showArgo, showPointCloud, selectedPoint, floats]);

  // ── Transect: drawing mode, request, and map layer ───────────────────────
  const runTransect = (points: LatLng[]) => {
    if (points.length < 2) return;
    setTransectStatus('loading');
    fetchTransect(points)
      .then((t) => {
        setTransect(t);
        setTransectStatus('idle');
      })
      .catch(() => setTransectStatus('error'));
  };

  const startDrawing = () => {
    setWaypoints([]);
    setTransect(null);
    setTransectStatus('idle');
    setDrawing(true);
  };

  const finishDrawing = (points = waypoints) => {
    setDrawing(false);
    runTransect(points);
  };

  const clearTransect = () => {
    setDrawing(false);
    setWaypoints([]);
    setTransect(null);
    setTransectStatus('idle');
    setTransectHover(null);
  };

  const applyPreset = (points: LatLng[]) => {
    setWaypoints(points);
    setDrawing(false);
    setTransect(null);
    runTransect(points);
    mapInstanceRef.current?.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.3));
  };

  useEffect(() => {
    const map = mapInstanceRef.current;
    drawingRef.current = drawing;
    if (!map) return;
    // While drawing, the hazard layers would swallow clicks, so they are hidden
    if (drawing) {
      map.doubleClickZoom.disable();
      if (layerGroupRef.current) map.removeLayer(layerGroupRef.current);
      const finish = () => drawingRef.current && setDrawing(false);
      map.on('dblclick', finish);
      return () => {
        map.off('dblclick', finish);
      };
    }
    map.doubleClickZoom.enable();
    if (layerGroupRef.current && !map.hasLayer(layerGroupRef.current)) layerGroupRef.current.addTo(map);
  }, [drawing]);

  // Double-click ends drawing; request the section once drawing stops with a usable line
  const prevDrawing = useRef(false);
  useEffect(() => {
    if (prevDrawing.current && !drawing && waypoints.length >= 2 && !transect && transectStatus === 'idle') {
      runTransect(waypoints);
    }
    prevDrawing.current = drawing;
  }, [drawing]);

  useEffect(() => {
    const group = transectGroupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!waypoints.length) return;
    const latlngs = waypoints.map((p) => [p.lat, p.lng] as [number, number]);
    group.addLayer(L.polyline(latlngs, { color: '#0b1220', weight: 6, opacity: 0.6, interactive: false }));
    group.addLayer(L.polyline(latlngs, {
      color: '#00f0ff', weight: 3, opacity: 0.95, dashArray: drawing ? '6, 6' : undefined, interactive: false,
    }));
    waypoints.forEach((p, i) => {
      const label = i === 0 ? 'A' : i === waypoints.length - 1 && !drawing ? 'B' : '';
      group.addLayer(L.marker([p.lat, p.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'transect-vertex',
          html: `<div style="position:relative;width:12px;height:12px;border-radius:50%;background:#050b14;border:2px solid #00f0ff;">
            ${label ? `<span style="position:absolute;left:12px;top:-14px;font:bold 11px monospace;color:#00f0ff;text-shadow:0 0 3px #000">${label}</span>` : ''}
          </div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }));
    });
    if (transect && transectHover !== null) {
      group.addLayer(L.circleMarker([transect.lat[transectHover], transect.lon[transectHover]], {
        radius: 7, color: '#ffffff', weight: 2, fillColor: '#f43f5e', fillOpacity: 1, interactive: false,
      }));
    }
  }, [waypoints, drawing, transect, transectHover]);

  // ── Product overlay (TCHP, D26, MLD, SLD, σ) from the model's daily grid ──
  useEffect(() => {
    if (overlay === 'none') {
      setOverlayGrid(null);
      return;
    }
    let cancelled = false;
    fetchProductGrid(overlay)
      .then((g) => !cancelled && setOverlayGrid(g))
      .catch(() => !cancelled && setOverlayGrid(null));
    return () => {
      cancelled = true;
    };
  }, [overlay]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    overlayRef.current?.remove();
    overlayRef.current = null;
    if (!overlayGrid) return;
    const half = Math.abs(overlayGrid.lat[1] - overlayGrid.lat[0]) / 2;
    const bounds: L.LatLngBoundsExpression = [
      [overlayGrid.lat[0] - half, overlayGrid.lon[0] - half],
      [overlayGrid.lat[overlayGrid.lat.length - 1] + half, overlayGrid.lon[overlayGrid.lon.length - 1] + half],
    ];
    const [lo, hi] = PRODUCT_RANGE[overlayGrid.var];
    const img = L.imageOverlay(gridToDataUrl(overlayGrid, lo, hi), bounds, { opacity: 0.85, className: 'pixelated-overlay' });
    img.addTo(map);
    overlayRef.current = img;
  }, [overlayGrid]);

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
                <span className="text-[9px] text-cyan-400/80">{floats.length}{useRealFloats ? ' real' : ' sim'}</span>
              </button>

              {/* Model product overlay */}
              <div className="pt-1.5 mt-1 border-t border-slate-800 space-y-1.5">
                <label className="flex items-center justify-between gap-2 text-slate-300">
                  <span>Model product</span>
                  <select
                    value={overlay}
                    onChange={(e) => setOverlay(e.target.value as ProductVar | 'none')}
                    className="bg-[#050e1f] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                  >
                    <option value="none">None</option>
                    <option value="tchp">Cyclone heat potential</option>
                    <option value="d26">26 °C isotherm depth</option>
                    <option value="mld">Mixed-layer depth</option>
                    <option value="sld">Sonic layer depth</option>
                    <option value="sigma100">Uncertainty at 100 m</option>
                  </select>
                </label>
                {overlayGrid && (
                  <div className="text-[9px] text-slate-400">
                    <div className="h-1.5 rounded" style={{ background: RAMP_CSS }} />
                    <div className="flex justify-between mt-0.5">
                      <span>{PRODUCT_RANGE[overlayGrid.var][0]}</span>
                      <span>{overlayGrid.units} · {overlayGrid.date}</span>
                      <span>{PRODUCT_RANGE[overlayGrid.var][1]}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Transect / cross-section */}
              <div className="pt-1.5 mt-1 border-t border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5"><Route className="w-3 h-3 text-cyan-400" />Transect</span>
                  {transectStatus === 'loading' && <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />}
                </div>
                {drawing ? (
                  <>
                    <div className="text-[9px] text-cyan-300/90 leading-snug">
                      Click the map to add points ({waypoints.length}). Double-click or Finish to build the section.
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => finishDrawing()}
                        disabled={waypoints.length < 2}
                        className="flex-1 px-2 py-1 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 disabled:opacity-40"
                      >
                        Finish
                      </button>
                      <button onClick={clearTransect} className="px-2 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-white">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={startDrawing}
                      className="flex-1 px-2 py-1 rounded-md border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                    >
                      Draw line
                    </button>
                    {waypoints.length > 0 && (
                      <button onClick={clearTransect} className="px-2 py-1 rounded-md border border-slate-700 text-slate-400 hover:text-white">
                        Clear
                      </button>
                    )}
                  </div>
                )}
                <select
                  value=""
                  onChange={(e) => {
                    const preset = TRANSECT_PRESETS[Number(e.target.value)];
                    if (preset) applyPreset(preset.points);
                  }}
                  className="w-full bg-[#050e1f] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                >
                  <option value="">Preset sections…</option>
                  {TRANSECT_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                </select>
                {transectStatus === 'error' && (
                  <div className="text-[9px] text-rose-300">Section request failed (is the API running?)</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTTOM CROSS-SECTION PANEL ── */}
        {transect && (
          <div
            className={`absolute left-4 bottom-4 h-[300px] z-20 glass-card rounded-2xl border border-cyan-500/30 overflow-hidden shadow-2xl backdrop-blur-xl bg-[#050b14]/95 ${
              isPanelCollapsed ? 'right-4' : 'right-4 md:right-[28rem]'
            }`}
          >
            <TransectSection data={transect} onHover={setTransectHover} onClose={clearTransect} />
          </div>
        )}

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
                  ARGO ({floats.length})
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
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>Region: <span className="text-slate-200">{currentRegion.name}</span></span>
                      {neural && <span className="text-emerald-400/90 font-mono">{neural.inference_latency_ms} ms</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <SourceToggle value={dataSource} onChange={setDataSource} />
                      <span className="text-[9px] font-mono text-slate-400">
                        {neuralStatus === 'loading' ? 'loading…' : neuralStatus === 'live' ? 'neural model' : 'physics sim (API offline)'}
                      </span>
                    </div>
                    {neural?.warning && (
                      <div className="mt-2 text-[9px] leading-snug text-amber-300/90">⚠ {neural.warning}</div>
                    )}
                  </div>

                  {/* Surface Variables Readout */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">
                      Surface Satellite Inputs (X)
                    </div>
                    <div className="space-y-1.5">
                      {([
                        ['Sea Surface Temp (SST)', `${activeVars.sst} °C`, 'sst'],
                        ['Sea Surface Salinity (SSS)', `${activeVars.sss} PSU`, 'sss'],
                        ['Sea Level Anomaly (SSH)', `${activeVars.ssh} m`, 'sla'],
                        ['Current Speed (U/V)', `${activeVars.current} m/s`, 'u_cur'],
                        ['Surface Winds (10m)', `${activeVars.wind} m/s`, 'u_wind'],
                      ] as [string, string, SurfaceField][]).map(([label, val, field]) => [
                        label,
                        val,
                        (useNeuralInputs && describeLineage(neural?.lineage?.[field])) || 'Physics simulation',
                      ]).map(([label, val, src]) => (
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

                  {/* One-page operational bulletin for this location and day */}
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-[10px] text-slate-400 mr-auto">Point bulletin · {DEFAULT_DATE}</span>
                    {(['pdf', 'png'] as const).map((f) => (
                      <a
                        key={f}
                        href={pointBulletinUrl(selectedPoint.lat, selectedPoint.lng, f)}
                        download
                        className="px-2.5 py-1 rounded-lg border border-cyan-500/30 text-cyan-300 text-[10px] hover:bg-cyan-500/10 uppercase"
                      >
                        {f}
                      </a>
                    ))}
                  </div>
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
                    {useRealFloats
                      ? 'Real ARGO floats with good-QC profiles in Feb–Mar 2024 (latest profile shown). Used to validate the model in Truth Check.'
                      : 'Simulated floats (the API is offline or this basin has no data).'}
                  </div>

                  {floats.map((f) => (
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
                        <span className="text-[9px] text-slate-400">{f.cycles} {useRealFloats ? 'profiles' : 'cycles'}</span>
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
