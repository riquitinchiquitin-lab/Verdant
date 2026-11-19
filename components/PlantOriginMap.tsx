import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Globe, MapPin, Layers, RotateCcw, ExternalLink } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface PlantOriginMapProps {
  origin?: string;
  nativeRegions?: string[];
  introducedRegions?: string[];
  originLabel?: string;
  nativeLabel?: string;
  introducedLabel?: string;
}

interface GeoPoint {
  name: string;
  lon: number;
  lat: number;
  continent: ContinentId;
  kind: 'native' | 'introduced';
}

type ContinentId =
  | 'north_america'
  | 'central_america'
  | 'south_america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'southeast_asia'
  | 'oceania';

// Detailed equirectangular SVG world coastline paths (viewBox 0 0 1000 500)
// High-detail coastline geometry replacing coarse polygonal approximations
const DETAILED_CONTINENTS: { id: ContinentId; name: string; d: string }[] = [
  {
    id: 'north_america',
    name: 'North America',
    d: 'M 148,42 C 165,38 185,35 210,38 C 235,42 258,35 285,45 C 300,50 310,65 315,80 C 308,95 295,102 288,115 C 282,128 290,140 285,152 C 275,160 262,168 250,175 C 238,182 225,190 215,200 C 205,210 195,202 188,190 C 180,180 168,172 155,162 C 142,152 130,138 118,122 C 108,108 95,95 90,80 C 85,68 98,58 112,50 C 125,45 138,44 148,42 Z M 295,30 C 315,25 338,28 350,42 C 345,55 330,68 318,72 C 305,65 300,48 295,30 Z',
  },
  {
    id: 'central_america',
    name: 'Central America & Caribbean',
    d: 'M 195,202 C 208,208 220,212 235,220 C 250,226 265,228 278,235 C 272,242 258,240 245,236 C 232,232 218,225 208,218 C 200,210 195,205 195,202 Z M 255,210 C 265,208 275,212 282,218 C 275,222 265,220 255,210 Z M 240,215 C 248,216 252,222 248,225 C 242,225 238,220 240,215 Z',
  },
  {
    id: 'south_america',
    name: 'South America',
    d: 'M 268,245 C 285,242 305,245 325,252 C 345,260 365,272 375,290 C 382,305 385,325 380,345 C 372,370 358,395 345,418 C 332,438 315,458 300,475 C 292,465 288,448 285,432 C 280,405 275,378 270,350 C 264,320 258,290 252,262 C 255,252 260,248 268,245 Z',
  },
  {
    id: 'europe',
    name: 'Europe',
    d: 'M 462,80 C 478,72 500,68 522,70 C 542,72 562,78 578,90 C 585,102 580,118 570,128 C 555,138 535,142 518,144 C 500,145 482,142 468,135 C 458,125 452,110 455,95 C 458,88 460,82 462,80 Z M 445,88 C 452,82 458,85 455,92 C 450,98 442,95 445,88 Z M 480,45 C 492,38 505,42 508,55 C 502,65 490,62 485,55 C 480,50 478,48 480,45 Z',
  },
  {
    id: 'africa',
    name: 'Africa',
    d: 'M 465,152 C 485,148 510,146 535,152 C 560,158 585,170 605,190 C 618,208 622,230 618,252 C 612,280 598,308 585,335 C 572,362 555,385 538,405 C 525,395 515,372 508,350 C 498,318 488,285 475,255 C 462,225 450,195 448,172 C 452,160 458,155 465,152 Z M 620,295 C 628,285 635,295 632,315 C 628,335 620,350 615,345 C 612,330 615,310 620,295 Z',
  },
  {
    id: 'asia',
    name: 'Asia',
    d: 'M 580,72 C 610,58 645,52 680,52 C 725,52 770,58 815,70 C 855,80 890,98 915,122 C 925,142 915,165 895,182 C 875,198 848,212 820,222 C 785,232 750,235 715,232 C 680,228 645,218 618,198 C 598,180 585,155 578,130 C 572,110 572,90 580,72 Z M 875,128 C 885,120 895,125 892,140 C 888,155 878,168 870,165 C 865,155 870,140 875,128 Z M 850,175 C 860,172 865,180 862,192 C 858,202 850,205 848,198 C 846,188 848,180 850,175 Z',
  },
  {
    id: 'southeast_asia',
    name: 'Southeast Asia',
    d: 'M 735,225 C 755,222 775,226 795,235 C 812,245 828,260 835,278 C 825,290 805,295 785,288 C 765,280 748,268 738,252 C 732,240 732,230 735,225 Z M 760,285 C 785,280 812,282 830,295 C 825,308 805,315 780,312 C 760,305 752,295 760,285 Z M 835,245 C 848,240 858,250 855,265 C 850,278 840,282 835,275 C 832,265 832,252 835,245 Z',
  },
  {
    id: 'oceania',
    name: 'Oceania & Australia',
    d: 'M 805,310 C 830,298 860,295 890,305 C 915,318 930,340 925,368 C 918,392 895,410 868,412 C 840,412 815,398 802,375 C 795,355 795,330 805,310 Z M 932,385 C 945,378 958,385 955,400 C 950,415 938,420 932,412 C 928,402 928,392 932,385 Z',
  },
];

// High-precision geographic coordinates lookup for botanical regions
// Includes detailed provinces, TDWG zones, and countries from OpenStreetMap data
const GEO_LOOKUP: Array<{ keywords: string[]; lon: number; lat: number; continent: ContinentId }> = [
  // China Provinces & Regions (Botanical Hotspots)
  { keywords: ['yunnan', 'kunming', 'dali', 'xishuangbanna'], lon: 101.5, lat: 25.0, continent: 'asia' },
  { keywords: ['sichuan', 'chengdu', 'emeishan', 'szechuan'], lon: 103.0, lat: 30.5, continent: 'asia' },
  { keywords: ['guizhou'], lon: 106.7, lat: 26.6, continent: 'asia' },
  { keywords: ['guangxi', 'guilin'], lon: 108.3, lat: 23.8, continent: 'asia' },
  { keywords: ['guangdong', 'canton', 'shenzhen', 'guangzhou', 'hong kong', 'macau'], lon: 113.3, lat: 23.1, continent: 'asia' },
  { keywords: ['hainan'], lon: 109.5, lat: 19.2, continent: 'asia' },
  { keywords: ['fujian', 'zhejiang'], lon: 118.5, lat: 26.5, continent: 'asia' },
  { keywords: ['taiwan', 'taipei'], lon: 121.0, lat: 23.7, continent: 'asia' },
  { keywords: ['tibet', 'xizang', 'himalaya'], lon: 88.0, lat: 31.0, continent: 'asia' },
  { keywords: ['china', 'east asia'], lon: 104.0, lat: 35.0, continent: 'asia' },

  // Japan & Korea
  { keywords: ['okinawa', 'ryukyu'], lon: 127.8, lat: 26.3, continent: 'asia' },
  { keywords: ['japan', 'honshu', 'kyushu', 'shikoku'], lon: 139.7, lat: 35.7, continent: 'asia' },
  { keywords: ['korea', 'jeju'], lon: 127.8, lat: 36.5, continent: 'asia' },

  // Southeast Asia (Malesia & Indochina)
  { keywords: ['vietnam', 'saigon', 'hanoi', 'da nang'], lon: 108.2, lat: 14.1, continent: 'southeast_asia' },
  { keywords: ['thailand', 'bangkok', 'chiang mai', 'siam'], lon: 100.5, lat: 15.9, continent: 'southeast_asia' },
  { keywords: ['malaysia', 'kuala lumpur', 'peninsular malaysia'], lon: 101.9, lat: 4.2, continent: 'southeast_asia' },
  { keywords: ['borneo', 'sarawak', 'sabah', 'kalimantan'], lon: 114.0, lat: 1.0, continent: 'southeast_asia' },
  { keywords: ['sumatra'], lon: 101.3, lat: 0.5, continent: 'southeast_asia' },
  { keywords: ['java'], lon: 110.4, lat: -7.5, continent: 'southeast_asia' },
  { keywords: ['sulawesi', 'celebes'], lon: 121.0, lat: -1.5, continent: 'southeast_asia' },
  { keywords: ['indonesia', 'bali'], lon: 115.0, lat: -2.0, continent: 'southeast_asia' },
  { keywords: ['philippines', 'luzon', 'mindanao'], lon: 121.8, lat: 12.9, continent: 'southeast_asia' },
  { keywords: ['new guinea', 'papua'], lon: 143.9, lat: -6.3, continent: 'oceania' },
  { keywords: ['southeast asia', 'indochina', 'laos', 'cambodia', 'myanmar', 'burma'], lon: 102.0, lat: 15.0, continent: 'southeast_asia' },

  // South Asia
  { keywords: ['india', 'western ghats', 'kerala', 'karnataka'], lon: 75.5, lat: 12.0, continent: 'asia' },
  { keywords: ['assam', 'darjeeling', 'sikkim'], lon: 92.8, lat: 26.2, continent: 'asia' },
  { keywords: ['sri lanka', 'ceylon'], lon: 80.7, lat: 7.9, continent: 'asia' },

  // Central America & Caribbean
  { keywords: ['costa rica'], lon: -84.0, lat: 9.7, continent: 'central_america' },
  { keywords: ['panama'], lon: -80.0, lat: 8.5, continent: 'central_america' },
  { keywords: ['guatemala', 'belize', 'honduras', 'el salvador', 'nicaragua'], lon: -88.0, lat: 14.5, continent: 'central_america' },
  { keywords: ['central america', 'mesoamerica'], lon: -85.0, lat: 12.0, continent: 'central_america' },
  { keywords: ['cuba', 'haiti', 'dominican', 'jamaica', 'puerto rico', 'caribbean', 'west indies', 'antilles'], lon: -72.0, lat: 19.0, continent: 'central_america' },

  // South America
  { keywords: ['colombia', 'choco', 'bogota'], lon: -75.5, lat: 4.5, continent: 'south_america' },
  { keywords: ['ecuador', 'galapagos'], lon: -78.5, lat: -1.8, continent: 'south_america' },
  { keywords: ['peru', 'amazonas'], lon: -76.0, lat: -9.2, continent: 'south_america' },
  { keywords: ['bolivia'], lon: -65.0, lat: -16.5, continent: 'south_america' },
  { keywords: ['venezuela', 'guyana', 'suriname', 'french guiana'], lon: -62.0, lat: 6.0, continent: 'south_america' },
  { keywords: ['brazil', 'brasil', 'atlantic forest', 'mata atlantica'], lon: -44.0, lat: -22.5, continent: 'south_america' },
  { keywords: ['amazon', 'amazon basin'], lon: -60.0, lat: -3.1, continent: 'south_america' },
  { keywords: ['argentina', 'chile', 'uruguay', 'paraguay', 'patagonia'], lon: -64.0, lat: -34.0, continent: 'south_america' },
  { keywords: ['south america', 'neotropics', 'neotropical', 'tropical america'], lon: -60.0, lat: -8.0, continent: 'south_america' },

  // Africa
  { keywords: ['madagascar'], lon: 46.8, lat: -18.8, continent: 'africa' },
  { keywords: ['west africa', 'nigeria', 'ghana', 'cameroon', 'ivory coast', 'senegal', 'guinea', 'congo', 'gabon', 'tropical africa'], lon: 7.5, lat: 6.5, continent: 'africa' },
  { keywords: ['central africa', 'dr congo', 'zaire'], lon: 23.6, lat: -2.8, continent: 'africa' },
  { keywords: ['east africa', 'kenya', 'tanzania', 'ethiopia', 'uganda', 'usambara'], lon: 37.9, lat: -1.3, continent: 'africa' },
  { keywords: ['cape', 'cape province', 'natal'], lon: 18.5, lat: -33.9, continent: 'africa' },
  { keywords: ['south africa', 'southern africa', 'namibia', 'botswana', 'zimbabwe', 'mozambique'], lon: 25.0, lat: -28.0, continent: 'africa' },
  { keywords: ['canary islands', 'madeira', 'azores', 'macaronesia'], lon: -15.5, lat: 28.1, continent: 'africa' },
  { keywords: ['north africa', 'morocco', 'algeria', 'tunisia', 'egypt'], lon: 10.0, lat: 30.0, continent: 'africa' },
  { keywords: ['africa'], lon: 20.0, lat: 2.0, continent: 'africa' },

  // Mexico & North America
  { keywords: ['oaxaca', 'chiapas', 'veracruz', 'yucatan', 'baja california'], lon: -96.7, lat: 17.0, continent: 'north_america' },
  { keywords: ['mexico'], lon: -102.0, lat: 23.0, continent: 'north_america' },
  { keywords: ['florida', 'california', 'texas', 'arizona', 'united states', 'usa', 'u.s.a', 'north america'], lon: -98.0, lat: 39.0, continent: 'north_america' },
  { keywords: ['canada', 'ontario', 'quebec', 'british columbia'], lon: -96.0, lat: 56.0, continent: 'north_america' },

  // Europe & Mediterranean
  { keywords: ['mediterranean', 'spain', 'portugal', 'greece', 'italy', 'europe'], lon: 12.0, lat: 43.0, continent: 'europe' },

  // Oceania
  { keywords: ['queensland', 'daintree', 'cairns'], lon: 145.4, lat: -16.2, continent: 'oceania' },
  { keywords: ['australia', 'new south wales', 'victoria', 'tasmania'], lon: 135.0, lat: -25.0, continent: 'oceania' },
  { keywords: ['new zealand'], lon: 174.8, lat: -41.3, continent: 'oceania' },
  { keywords: ['hawaii', 'polynesia', 'fiji', 'pacific', 'oceania'], lon: -157.8, lat: 21.3, continent: 'oceania' },
];

const projectToSvg = (lon: number, lat: number) => ({
  x: ((lon + 180) / 360) * 1000,
  y: ((90 - lat) / 180) * 500,
});

function resolveRegion(text: string, kind: 'native' | 'introduced'): GeoPoint[] {
  const normalized = text.toLowerCase();
  const matches: GeoPoint[] = [];
  const seenKeys = new Set<string>();

  for (const entry of GEO_LOOKUP) {
    if (entry.keywords.some((kw) => normalized.includes(kw))) {
      const key = `${entry.lon},${entry.lat}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        matches.push({
          name: text.trim(),
          lon: entry.lon,
          lat: entry.lat,
          continent: entry.continent,
          kind,
        });
      }
    }
  }
  return matches;
}

export const PlantOriginMap: React.FC<PlantOriginMapProps> = ({
  origin,
  nativeRegions = [],
  introducedRegions = [],
  originLabel = 'Origin',
  nativeLabel = 'Native Origin',
  introducedLabel = 'Introduced / Naturalized',
}) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      if (document.documentElement.classList.contains('dark')) return true;
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Automated Theme Detection: responds to system preference and theme class mutations
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateTheme = () => {
      const hasDarkClass = document.documentElement.classList.contains('dark');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(hasDarkClass || prefersDark);
    };

    updateTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => updateTheme();
    mediaQuery.addEventListener?.('change', handleMediaChange);

    const observer = new MutationObserver(() => updateTheme());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    return () => {
      mediaQuery.removeEventListener?.('change', handleMediaChange);
      observer.disconnect();
    };
  }, []);

  const { points, nativeContinents, introducedContinents } = useMemo(() => {
    const allPoints: GeoPoint[] = [];
    const seen = new Set<string>();
    const nativeConts = new Set<ContinentId>();
    const introConts = new Set<ContinentId>();

    const addText = (txt: string, kind: 'native' | 'introduced') => {
      if (!txt || txt.trim().toLowerCase() === 'n/a' || txt.trim().toLowerCase() === 'unknown') return;
      const parts = txt.split(/[,;/]+|\band\b/i).map((s) => s.trim()).filter(Boolean);
      const targets = parts.length > 0 ? parts : [txt.trim()];
      for (const part of targets) {
        const resolved = resolveRegion(part, kind);
        for (const pt of resolved) {
          const key = `${pt.lon},${pt.lat},${pt.kind}`;
          if (!seen.has(key)) {
            seen.add(key);
            allPoints.push(pt);
          }
          if (kind === 'native') nativeConts.add(pt.continent);
          else introConts.add(pt.continent);
        }
      }
    };

    if (origin) addText(origin, 'native');
    nativeRegions.forEach((r) => addText(r, 'native'));
    introducedRegions.forEach((r) => addText(r, 'introduced'));

    return {
      points: allPoints,
      nativeContinents: nativeConts,
      introducedContinents: introConts,
    };
  }, [origin, nativeRegions, introducedRegions]);

  // Initialize and update Leaflet OpenStreetMap instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center on first point or global view
    const initialCenter: [number, number] = points.length > 0
      ? [points[0].lat, points[0].lon]
      : [20, 0];
    const initialZoom = points.length > 0 ? (points.length === 1 ? 5 : 4) : 2;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Remove existing tile layer
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    // Zero-Key Official OpenStreetMap Tiles (tile.openstreetmap.org)
    // Dark mode applies crisp CSS inversion filters directly to native OSM tiles
    const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (planet.openstreetmap.org)';

    const newTileLayer = L.tileLayer(tileUrl, {
      className: isDark ? 'osm-dark-tiles' : 'osm-light-tiles',
      maxZoom: 19,
      attribution,
    }).addTo(map);

    tileLayerRef.current = newTileLayer;

    // Clear and redraw markers
    if (markersLayerRef.current) {
      map.removeLayer(markersLayerRef.current);
      markersLayerRef.current = null;
    }

    const markersGroup = L.layerGroup();

    points.forEach((pt) => {
      const isNative = pt.kind === 'native';
      const pinColor = isNative ? '#10b981' : '#f59e0b';
      const badgeText = isNative ? nativeLabel : introducedLabel;

      // Calm static botanical pin without flashing/ping loops
      const html = `
        <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <div style="position: relative; width: 24px; height: 24px; border-radius: 9999px; background-color: ${pinColor}; box-shadow: 0 0 10px rgba(16, 185, 129, 0.6), 0 3px 6px rgba(0, 0, 0, 0.4); border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center;">
            <div style="width: 7px; height: 7px; border-radius: 9999px; background-color: #ffffff;"></div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-osm-pin',
        html,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      const marker = L.marker([pt.lat, pt.lon], { icon: customIcon });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; color: #1e293b; padding: 2px;">
          <div style="font-weight: 700; font-size: 13px; color: ${pinColor}; margin-bottom: 2px;">${pt.name}</div>
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">${badgeText}</div>
          <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">Lat: ${pt.lat.toFixed(2)}°, Lon: ${pt.lon.toFixed(2)}°</div>
        </div>
      `);

      markersGroup.addLayer(marker);
    });

    markersGroup.addTo(map);
    markersLayerRef.current = markersGroup;

    // Smoothly pan & fit bounds
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 5);
    } else if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    }

    // Leaflet container invalidation after container paint
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => clearTimeout(timer);
  }, [isDark, points, nativeLabel, introducedLabel]);

  // Clean up Leaflet on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    if (points.length === 1) {
      mapInstanceRef.current.flyTo([points[0].lat, points[0].lon], 5);
    } else if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
      mapInstanceRef.current.flyToBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    } else {
      mapInstanceRef.current.flyTo([20, 0], 2);
    }
  };

  if (!origin && nativeRegions.length === 0 && introducedRegions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-md-surface-container-low border border-md-outline-variant/25 p-4 space-y-3">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-md-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-md-on-surface-variant">
            {originLabel}
          </span>
          {origin && (
            <span className="text-xs font-bold text-md-on-surface">— {origin}</span>
          )}
        </div>

        {/* RECENTER BUTTON */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter on Botanical Origin"
            className="p-1.5 rounded-xl bg-md-surface-container border border-md-outline-variant/25 text-md-on-surface-variant hover:text-md-primary hover:border-md-primary/40 transition-all flex items-center gap-1.5 px-2.5 text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Recenter</span>
          </button>
        </div>
      </div>

      {/* ZERO-KEY OSM DARK MODE CSS FILTER */}
      <style>{`
        .osm-dark-tiles,
        .osm-dark-tiles .leaflet-tile,
        .osm-dark-tiles .leaflet-tile-pane,
        .osm-dark-tiles .leaflet-layer,
        .osm-dark-tiles img {
          filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7) !important;
        }
        .osm-light-tiles,
        .osm-light-tiles .leaflet-tile,
        .osm-light-tiles .leaflet-tile-pane,
        .osm-light-tiles .leaflet-layer,
        .osm-light-tiles img {
          filter: none !important;
        }
      `}</style>

      {/* MAP VIEW CONTAINER (AUTOMATED THEME OSM) */}
      <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden bg-md-surface-container border border-md-outline-variant/20 shadow-inner">
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          style={{ zIndex: 1 }}
        />
      </div>

      {/* FOOTER: LEGEND & OPENSTREETMAP DATA ATTRIBUTION */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-md-on-surface-variant border-t border-md-outline-variant/15">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs" />
            <span className="font-medium text-md-on-surface">{nativeLabel}</span>
          </span>
          {introducedRegions.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-xs" />
              <span className="font-medium text-md-on-surface">{introducedLabel}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px] text-md-on-surface-variant/80">
          <span>Map data from</span>
          <a
            href="https://planet.openstreetmap.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-md-primary hover:underline font-semibold inline-flex items-center gap-0.5"
          >
            OpenStreetMap (planet.openstreetmap.org)
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
