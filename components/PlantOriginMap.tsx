import React, { useMemo, useState } from 'react';
import { Globe, MapPin } from 'lucide-react';

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

// Simplified equirectangular world continent paths (viewBox 0 0 1000 500)
// x = ((lon + 180) / 360) * 1000, y = ((90 - lat) / 180) * 500
const CONTINENTS: { id: ContinentId; d: string }[] = [
  {
    id: 'north_america',
    d: 'M 70,70 L 140,55 L 220,45 L 295,60 L 330,95 L 300,130 L 275,155 L 250,180 L 225,195 L 200,205 L 185,185 L 155,165 L 125,140 L 95,115 L 65,95 Z',
  },
  {
    id: 'central_america',
    d: 'M 195,198 L 225,205 L 255,220 L 285,225 L 280,238 L 255,235 L 235,245 L 220,235 L 205,220 Z',
  },
  {
    id: 'south_america',
    d: 'M 265,245 L 305,245 L 355,265 L 385,295 L 370,340 L 345,380 L 315,435 L 295,460 L 285,430 L 275,375 L 265,320 L 255,275 Z',
  },
  {
    id: 'europe',
    d: 'M 465,75 L 520,60 L 575,65 L 605,85 L 595,120 L 560,135 L 525,135 L 495,142 L 470,132 L 460,105 Z',
  },
  {
    id: 'africa',
    d: 'M 465,155 L 520,148 L 575,162 L 610,195 L 620,235 L 595,280 L 575,345 L 545,380 L 520,355 L 505,305 L 485,255 L 455,220 L 450,185 Z',
  },
  {
    id: 'asia',
    d: 'M 580,70 L 670,55 L 775,58 L 875,75 L 915,105 L 885,140 L 855,165 L 825,195 L 775,205 L 730,220 L 690,210 L 650,215 L 615,195 L 595,160 L 575,125 Z',
  },
  {
    id: 'southeast_asia',
    d: 'M 755,215 L 805,215 L 835,238 L 865,265 L 845,285 L 805,280 L 770,268 L 745,245 Z',
  },
  {
    id: 'oceania',
    d: 'M 815,305 L 880,298 L 918,325 L 915,372 L 875,392 L 825,380 L 805,345 Z M 945,395 L 962,380 L 968,402 L 948,415 Z',
  },
];

// Lookup table of botanical countries, TDWG regions, and common origin terms -> [lon, lat, continent]
const GEO_LOOKUP: Array<{ keywords: string[]; lon: number; lat: number; continent: ContinentId }> = [
  // North America
  { keywords: ['canada', 'ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick'], lon: -96, lat: 56, continent: 'north_america' },
  { keywords: ['united states', 'usa', 'u.s.a', 'north america', 'california', 'florida', 'texas', 'arizona', 'oregon', 'washington', 'appalachian'], lon: -98, lat: 39, continent: 'north_america' },
  { keywords: ['mexico', 'yucatan', 'oaxaca', 'chiapas', 'veracruz', 'baja'], lon: -102, lat: 23, continent: 'north_america' },
  // Central America & Caribbean
  { keywords: ['central america', 'guatemala', 'belize', 'honduras', 'el salvador', 'nicaragua', 'costa rica', 'panama', 'mesoamerica'], lon: -85, lat: 12, continent: 'central_america' },
  { keywords: ['caribbean', 'west indies', 'cuba', 'jamaica', 'haiti', 'dominican', 'puerto rico', 'bahamas', 'trinidad', 'antilles'], lon: -74, lat: 19, continent: 'central_america' },
  // South America
  { keywords: ['south america', 'tropical america', 'neotropics', 'neotropical', 'amazon'], lon: -60, lat: -8, continent: 'south_america' },
  { keywords: ['colombia', 'andes'], lon: -74, lat: 4, continent: 'south_america' },
  { keywords: ['venezuela', 'guyana', 'suriname', 'french guiana'], lon: -65, lat: 6, continent: 'south_america' },
  { keywords: ['ecuador', 'galapagos'], lon: -78, lat: -2, continent: 'south_america' },
  { keywords: ['peru', 'bolivia'], lon: -72, lat: -12, continent: 'south_america' },
  { keywords: ['brazil', 'brasil', 'atlantic forest'], lon: -51, lat: -14, continent: 'south_america' },
  { keywords: ['argentina', 'chile', 'uruguay', 'paraguay', 'patagonia'], lon: -64, lat: -34, continent: 'south_america' },
  // Europe
  { keywords: ['europe', 'mediterranean', 'iberian', 'balkans', 'alps', 'scandinavia', 'britain', 'uk', 'united kingdom', 'ireland'], lon: 12, lat: 48, continent: 'europe' },
  { keywords: ['spain', 'portugal', 'france', 'italy', 'greece', 'germany', 'switzerland', 'austria', 'poland', 'netherlands'], lon: 10, lat: 46, continent: 'europe' },
  { keywords: ['canary islands', 'madeira', 'azores', 'macaronesia'], lon: -16, lat: 28, continent: 'africa' },
  // Africa
  { keywords: ['north africa', 'morocco', 'algeria', 'tunisia', 'egypt', 'libya'], lon: 10, lat: 30, continent: 'africa' },
  { keywords: ['west africa', 'nigeria', 'ghana', 'cameroon', 'ivory coast', 'senegal', 'congo', 'gabon', 'central africa', 'tropical africa'], lon: 12, lat: 3, continent: 'africa' },
  { keywords: ['east africa', 'kenya', 'tanzania', 'ethiopia', 'uganda', 'somalia', 'usambara'], lon: 37, lat: 0, continent: 'africa' },
  { keywords: ['south africa', 'southern africa', 'cape', 'namibia', 'botswana', 'zimbabwe', 'mozambique', 'swaziland'], lon: 24, lat: -28, continent: 'africa' },
  { keywords: ['madagascar', 'mascarene', 'mauritius', 'reunion'], lon: 47, lat: -19, continent: 'africa' },
  { keywords: ['africa'], lon: 20, lat: 2, continent: 'africa' },
  // Asia
  { keywords: ['middle east', 'west asia', 'turkey', 'iran', 'iraq', 'syria', 'israel', 'jordan', 'arabia', 'yemen', 'oman', 'socotra', 'caucasus'], lon: 45, lat: 30, continent: 'asia' },
  { keywords: ['india', 'sri lanka', 'himalaya', 'nepal', 'bhutan', 'pakistan', 'bangladesh', 'indian subcontinent', 'assam'], lon: 78, lat: 22, continent: 'asia' },
  { keywords: ['central asia', 'kazakhstan', 'uzbekistan', 'siberia', 'russia', 'mongolia'], lon: 75, lat: 48, continent: 'asia' },
  { keywords: ['china', 'tibet', 'yunnan', 'sichuan', 'guangdong', 'east asia'], lon: 105, lat: 34, continent: 'asia' },
  { keywords: ['japan', 'ryukyu', 'okinawa'], lon: 138, lat: 36, continent: 'asia' },
  { keywords: ['korea', 'taiwan'], lon: 125, lat: 32, continent: 'asia' },
  { keywords: ['asia'], lon: 95, lat: 34, continent: 'asia' },
  // Southeast Asia
  { keywords: ['southeast asia', 'indochina', 'thailand', 'vietnam', 'laos', 'cambodia', 'myanmar', 'burma'], lon: 102, lat: 15, continent: 'southeast_asia' },
  { keywords: ['malaysia', 'borneo', 'kalimantan', 'sumatra', 'java', 'indonesia', 'sulawesi', 'philippines', 'malay'], lon: 114, lat: 2, continent: 'southeast_asia' },
  { keywords: ['new guinea', 'papua'], lon: 143, lat: -5, continent: 'oceania' },
  // Oceania
  { keywords: ['australia', 'queensland', 'new south wales', 'victoria', 'tasmania'], lon: 135, lat: -25, continent: 'oceania' },
  { keywords: ['new zealand'], lon: 172, lat: -41, continent: 'oceania' },
  { keywords: ['hawaii', 'polynesia', 'fiji', 'pacific', 'oceania', 'new caledonia', 'solomon'], lon: 165, lat: -15, continent: 'oceania' },
];

const project = (lon: number, lat: number) => ({
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
  const [hovered, setHovered] = useState<GeoPoint | null>(null);

  const { points, nativeContinents, introducedContinents } = useMemo(() => {
    const allPoints: GeoPoint[] = [];
    const seen = new Set<string>();
    const nativeConts = new Set<ContinentId>();
    const introConts = new Set<ContinentId>();

    const addText = (txt: string, kind: 'native' | 'introduced') => {
      if (!txt || txt.trim().toLowerCase() === 'n/a' || txt.trim().toLowerCase() === 'unknown') return;
      // Split comma/semicolon/slash-separated origin strings into segments
      const parts = txt.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
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

  if (!origin && nativeRegions.length === 0 && introducedRegions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-md-surface-container-low border border-md-outline-variant/25 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-md-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-md-on-surface-variant">
            {originLabel}
          </span>
          {origin && (
            <span className="text-xs font-medium text-md-on-surface">— {origin}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-md-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-md-primary inline-block" />
            {nativeLabel}
          </span>
          {introducedRegions.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-md-tertiary inline-block" />
              {introducedLabel}
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl bg-md-surface-container border border-md-outline-variant/20">
        <svg
          viewBox="0 0 1000 500"
          className="w-full h-auto block select-none"
          role="img"
          aria-label={`World origin map${origin ? ` for ${origin}` : ''}`}
        >
          {/* Subtle graticule lines (Equator & Tropics) */}
          <line x1="0" y1="250" x2="1000" y2="250" stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />
          <line x1="0" y1="185" x2="1000" y2="185" stroke="currentColor" strokeOpacity="0.05" strokeDasharray="3 6" />
          <line x1="0" y1="315" x2="1000" y2="315" stroke="currentColor" strokeOpacity="0.05" strokeDasharray="3 6" />
          <line x1="500" y1="0" x2="500" y2="500" stroke="currentColor" strokeOpacity="0.05" strokeDasharray="3 6" />

          {/* Continents */}
          {CONTINENTS.map((c) => {
            const isNative = nativeContinents.has(c.id);
            const isIntro = introducedContinents.has(c.id);
            return (
              <path
                key={c.id}
                d={c.d}
                className={
                  isNative
                    ? 'fill-md-primary/25 stroke-md-primary/60'
                    : isIntro
                      ? 'fill-md-tertiary/20 stroke-md-tertiary/50'
                      : 'fill-md-surface-container-highest/80 stroke-md-outline-variant/30'
                }
                strokeWidth="1.25"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Region Pins */}
          {points.map((pt, idx) => {
            const { x, y } = project(pt.lon, pt.lat);
            const isNative = pt.kind === 'native';
            return (
              <g
                key={`${pt.name}-${idx}`}
                transform={`translate(${x}, ${y})`}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(pt)}
                onMouseLeave={() => setHovered((prev) => (prev === pt ? null : prev))}
                onClick={() => setHovered((prev) => (prev === pt ? null : pt))}
              >
                <circle
                  r="14"
                  className={isNative ? 'fill-md-primary/20' : 'fill-md-tertiary/20'}
                />
                <circle
                  r="6"
                  className={
                    isNative
                      ? 'fill-md-primary stroke-md-surface'
                      : 'fill-md-tertiary stroke-md-surface'
                  }
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="absolute bottom-2.5 left-2.5 px-3 py-1.5 rounded-full bg-md-surface/95 backdrop-blur border border-md-outline-variant/30 shadow-md flex items-center gap-1.5 text-xs font-medium text-md-on-surface">
            <MapPin className={`w-3.5 h-3.5 ${hovered.kind === 'native' ? 'text-md-primary' : 'text-md-tertiary'}`} />
            <span>{hovered.name}</span>
            <span className="text-[10px] text-md-on-surface-variant">
              ({hovered.kind === 'native' ? nativeLabel : introducedLabel})
            </span>
          </div>
        )}
      </div>

      {points.length === 0 && (origin || nativeRegions.length > 0) && (
        <p className="text-[11px] text-md-on-surface-variant">
          {origin || nativeRegions.join(', ')}
        </p>
      )}
    </div>
  );
};
