import { Plant } from '../types';

/**
 * Code 128B encoding table (values 0..106).
 * Each entry is a 6-digit string of bar/space module widths (1..4),
 * except Stop (106) which has 7 modules (2331112).
 */
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

/**
 * Encodes an ASCII string (32..126) as a Code 128B module array (1 = black bar, 0 = white space).
 */
export function encodeCode128B(text: string): number[] {
  const sanitized = (text || '0').replace(/[^\x20-\x7E]/g, '-');
  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < sanitized.length; i++) {
    const val = sanitized.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop

  const modules: number[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      const isBar = j % 2 === 0;
      for (let k = 0; k < width; k++) {
        modules.push(isBar ? 1 : 0);
      }
    }
  }
  return modules;
}

/**
 * Niimbot D110 Option B (15 × 50 mm @ 203 DPI) hardware geometry.
 * Printhead is 96 px (12 mm printable band) × 400 px feed length (50 mm).
 */
export const D110_LABEL_W_PX = 400; // Landscape width (50 mm feed axis)
export const D110_LABEL_H_PX = 96;  // Landscape height (12 mm printhead axis)

export const D110_MODEL = {
  name_prefixes: ['D110'],
  task: 'b1',
  density: 3,
  label_type: 1,
  speed: 1,
};

export const D110_SIZE_T15x50 = {
  w_px: 96,
  h_px: 400,
  offset_y_px: -2,
};

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + '…').width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + '…';
}

/**
 * Renders an Option B (15 × 50 mm @ 203 DPI) landscape sticker onto a 400 × 96 px canvas.
 */
export function renderD110LabelCanvas(
  plant: Plant,
  nickname: string,
  targetCanvas?: HTMLCanvasElement | null
): HTMLCanvasElement {
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = D110_LABEL_W_PX;
  canvas.height = D110_LABEL_H_PX;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, D110_LABEL_W_PX, D110_LABEL_H_PX);

  const padX = 14;
  const maxTextWidth = D110_LABEL_W_PX - padX * 2;

  // Line 1: Bold Nickname
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, nickname || plant.species || 'Plant', maxTextWidth), padX, 3);

  // Line 2: Species · Family
  const subline = [plant.species, plant.family].filter(Boolean).join(' · ');
  ctx.font = '600 12px system-ui, -apple-system, sans-serif';
  ctx.fillText(fitText(ctx, subline || 'Verdant Specimen', maxTextWidth), padX, 24);

  // Line 3: Code 128B Barcode (integer bar width for razor-sharp 203 DPI thermal printing)
  const barcodeValue = (plant.id || 'NEW').trim();
  const modules = encodeCode128B(barcodeValue);
  const maxBarcodeWidth = D110_LABEL_W_PX - 24;
  const barWidth = modules.length * 2 <= maxBarcodeWidth ? 2 : 1;
  const totalBarcodeWidth = modules.length * barWidth;
  const startX = Math.floor((D110_LABEL_W_PX - totalBarcodeWidth) / 2);
  const barcodeY = 40;
  const barcodeH = 40;

  ctx.fillStyle = '#000000';
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === 1) {
      ctx.fillRect(startX + i * barWidth, barcodeY, barWidth, barcodeH);
    }
  }

  // Line 4: Human-readable ID
  ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, barcodeValue, maxTextWidth), D110_LABEL_W_PX / 2, 82);

  return canvas;
}

/**
 * Renders the landscape 400×96 label rotated 90° onto a 96×400 portrait canvas
 * matching the Niimbot D110 printhead (w_px=96, h_px=400) and returns a PNG data URL.
 */
export function renderD110PrintDataUrl(plant: Plant, nickname: string): string {
  const landscape = renderD110LabelCanvas(plant, nickname);
  const portrait = document.createElement('canvas');
  portrait.width = D110_LABEL_H_PX;  // 96
  portrait.height = D110_LABEL_W_PX; // 400

  const ctx = portrait.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, portrait.width, portrait.height);
    ctx.translate(portrait.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(landscape, 0, 0);
  }
  return portrait.toDataURL('image/png');
}

declare global {
  interface Window {
    Niimbot?: {
      isSupported: () => boolean;
      printImage: (url: string, opts: any) => Promise<void>;
      printBatch: (urls: string[], opts: any) => Promise<void>;
      disconnect: () => Promise<void>;
      printer?: { modelId?: number; label?: string; dpi?: number };
    };
  }
}

export function isNiimbotWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as any).bluetooth);
}

/**
 * Connects to a Niimbot D110 over Web Bluetooth and prints the selected plant labels.
 */
export async function printLabelsToNiimbotD110(
  plants: Plant[],
  lv: (val: any) => string,
  onProgress?: (info: { page?: number; total?: number; message?: string }) => void
): Promise<void> {
  if (!isNiimbotWebBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth is not available in this browser. Use Chrome/Edge on Android or Desktop over HTTPS (or Bluefy on iOS).'
    );
  }

  // @ts-expect-error - niimbot-web-bluetooth ships untyped JS attaching window.Niimbot
  await import('niimbot-web-bluetooth');
  const niimbot = window.Niimbot;
  if (!niimbot) {
    throw new Error('Niimbot Web Bluetooth driver failed to initialize.');
  }

  const dataUrls = plants.map(p => renderD110PrintDataUrl(p, lv(p.nickname)));
  await niimbot.printBatch(dataUrls, {
    model: D110_MODEL,
    size: D110_SIZE_T15x50,
    onProgress: (ev: any) => {
      if (onProgress) {
        onProgress({
          page: ev?.page,
          total: dataUrls.length,
          message: ev?.status || ev?.phase,
        });
      }
    },
  });
}
