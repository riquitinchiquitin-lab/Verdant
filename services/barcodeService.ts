import { Plant } from '../types';
import { QRCodeWriter, BarcodeFormat, EncodeHintType } from '@zxing/library';

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
 * Generates a compact 10-character Code 128B ID (e.g. V-3DA6F9F2) from a plant UUID
 * so the barcode prints with wide, crisp 2px bars and full quiet zones on 15×50mm labels.
 */
export function getShortBarcodeId(id?: string): string {
  const raw = (id || 'NEW').trim();
  const stripped = raw.replace(/^p-(?:synced-)?/i, '').replace(/[^a-zA-Z0-9]/g, '');
  const short = (stripped || raw).slice(0, 8).toUpperCase();
  return `V-${short}`;
}

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
 * Hard-binarizes a canvas image into strictly pure black (#000000) or pure white (#FFFFFF).
 *
 * Why this is critical for Niimbot thermal printing:
 * Niimbot's ImageEncoder.encode uses `color !== 0xffffff` as the condition for a black dot.
 * Standard HTML5 Canvas antialiases text and curves with soft gray edge pixels (e.g., #EEEEEE).
 * Without binarization, every single gray subpixel gets turned into a 100% black thermal burn.
 * On 203 DPI thermal printheads, this causes catastrophic "dot bloom", bleeding letters together
 * and turning 11-12px subtitles into solid unreadable black smudges.
 *
 * Applying a strict luminance threshold completely removes antialiasing halos, preserving
 * wide-open letter counters ('e', 'o', 'a', 'c') and razor-sharp linear/QR barcodes.
 */
export function binarizeCanvas(canvas: HTMLCanvasElement, threshold: number = 160): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    // If pixel is semi-transparent, treat transparent background as white
    const alpha = data[i + 3] / 255;
    const r = data[i] * alpha + 255 * (1 - alpha);
    const g = data[i + 1] * alpha + 255 * (1 - alpha);
    const b = data[i + 2] * alpha + 255 * (1 - alpha);

    // Standard Rec. 601 perceived luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // Strict threshold: any pixel brighter than threshold becomes pure white; else pure black
    const val = luminance >= threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export type LabelLayoutType = 'qr' | 'barcode';

/**
 * Draws a crisp QR code onto the canvas using @zxing/library's QRCodeWriter.
 * Uses integer block scaling so that every QR module corresponds to an exact integer
 * number of physical 203 DPI thermal dots.
 */
function drawQrCodeToCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  destX: number,
  destY: number,
  boxSize: number
): void {
  try {
    const writer = new QRCodeWriter();
    const hints = new Map();
    hints.set(EncodeHintType.MARGIN, 0);
    // Request minimum size to get the native module matrix
    const matrix = writer.encode(text, BarcodeFormat.QR_CODE, 0, 0, hints);
    const modCount = matrix.getWidth(); // typically 21 or 25 modules
    const modSize = Math.max(1, Math.floor(boxSize / modCount));
    const renderSize = modCount * modSize;
    const offsetX = destX + Math.floor((boxSize - renderSize) / 2);
    const offsetY = destY + Math.floor((boxSize - renderSize) / 2);

    ctx.fillStyle = '#000000';
    for (let row = 0; row < modCount; row++) {
      for (let col = 0; col < modCount; col++) {
        if (matrix.get(col, row)) {
          ctx.fillRect(offsetX + col * modSize, offsetY + row * modSize, modSize, modSize);
        }
      }
    }
  } catch {
    // Fallback if zxing fails: draw a clear placeholder box
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(destX, destY, boxSize, boxSize);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('QR', destX + boxSize / 2, destY + boxSize / 2 + 3);
  }
}

/**
 * Renders an Option B (15 × 50 mm @ 203 DPI) sticker onto a 400 × 96 px canvas.
 * Supports both modern 2-column 'qr' layout (recommended for 15x50mm) and optimized 'barcode' layout.
 *
 * Automatically binarizes the canvas to eliminate all anti-aliasing gray halos that
 * cause smudged, illegible printing on Niimbot thermal printers.
 */
export function renderD110LabelCanvas(
  plant: Plant,
  nickname: string,
  targetCanvas?: HTMLCanvasElement | null,
  layout: LabelLayoutType = 'qr'
): HTMLCanvasElement {
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = D110_LABEL_W_PX;
  canvas.height = D110_LABEL_H_PX;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, D110_LABEL_W_PX, D110_LABEL_H_PX);

  const barcodeValue = getShortBarcodeId(plant.id);

  if (layout === 'qr') {
    // -------------------------------------------------------------
    // LAYOUT 1: SPLIT 2-COLUMN QR + SPECS (OPTIMAL FOR 15 × 50 mm)
    // Left: 84×84 px QR code with full quiet zone
    // Right: Spacious 3 lines of high-contrast botanical typography
    // -------------------------------------------------------------
    const qrSize = 82;
    const qrX = 8;
    const qrY = 7;
    drawQrCodeToCanvas(ctx, barcodeValue, qrX, qrY, qrSize);

    const textX = qrX + qrSize + 14;
    const textW = D110_LABEL_W_PX - textX - 8;

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Line 1: Plant Nickname (Bold 21px, crisp)
    ctx.font = 'bold 21px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const displayName = nickname || plant.species || 'Plant';
    ctx.fillText(fitText(ctx, displayName, textW), textX, 7);

    // Line 2: Botanical Species (14px semibold with room to breathe)
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const speciesText = plant.species || 'Verdant Specimen';
    ctx.fillText(fitText(ctx, speciesText, textW), textX, 35);

    // Line 3: Family + ID Badge (11px monospace)
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    const familyAndId = [plant.family, barcodeValue].filter(Boolean).join(' · ');
    ctx.fillText(fitText(ctx, familyAndId, textW), textX, 58);

    // Line 4: Compact timestamp or brand signature
    ctx.font = '500 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('VERDANT BOTANICAL ARCHIVE', textX, 76);
  } else {
    // -------------------------------------------------------------
    // LAYOUT 2: LINEAR CODE 128B BARCODE (SPACIOUS & DE-CLUTTERED)
    // Optimized vertical balance: reduced barcode height & integer 2px bars
    // -------------------------------------------------------------
    const padX = 14;
    const maxTextWidth = D110_LABEL_W_PX - padX * 2;

    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    // Line 1: Bold Nickname (19px)
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(fitText(ctx, nickname || plant.species || 'Plant', maxTextWidth), padX, 3);

    // Line 2: Species · Family (12px, clean spacing)
    const subline = [plant.species, plant.family].filter(Boolean).join(' · ');
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(fitText(ctx, subline || 'Verdant Specimen', maxTextWidth), padX, 24);

    // Line 3: Code 128B Barcode (26px height with 2px integer bars)
    const modules = encodeCode128B(barcodeValue);
    const maxBarcodeWidth = D110_LABEL_W_PX - 28;
    const barWidth = modules.length * 2 <= maxBarcodeWidth ? 2 : 1;
    const totalBarcodeWidth = modules.length * barWidth;
    const startX = Math.floor((D110_LABEL_W_PX - totalBarcodeWidth) / 2);
    const barcodeY = 41;
    const barcodeH = 26;

    for (let i = 0; i < modules.length; i++) {
      if (modules[i] === 1) {
        ctx.fillRect(startX + i * barWidth, barcodeY, barWidth, barcodeH);
      }
    }

    // Line 4: Human-readable ID (12px monospace, well separated from barcode bottom)
    ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(barcodeValue, D110_LABEL_W_PX / 2, 73);
  }

  // Hard binarize to eliminate thermal edge bleeding / anti-alias bloom
  return binarizeCanvas(canvas, 160);
}

/**
 * Renders the landscape 400×96 label rotated 90° onto a 96×400 portrait canvas
 * matching the Niimbot D110 printhead (w_px=96, h_px=400) and returns a PNG data URL.
 */
export function renderD110PrintDataUrl(
  plant: Plant,
  nickname: string,
  layout: LabelLayoutType = 'qr'
): string {
  const landscape = renderD110LabelCanvas(plant, nickname, null, layout);
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

export function isNiimbotWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as any).bluetooth);
}

export function isNiimbotWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as any).serial);
}

export interface NiimbotPrintProgressInfo {
  page?: number;
  total?: number;
  message?: string;
}

export interface NiimbotPrintOptions {
  transport?: 'bluetooth' | 'serial';
  layout?: LabelLayoutType;
  density?: number; // 1 = light, 2 = normal, 3 = high
  onProgress?: (info: NiimbotPrintProgressInfo) => void;
}

/**
 * Connects to a Niimbot printer over Web Bluetooth or Web Serial using @mmote/niimbluelib
 * (the reference library powering niim.blue) and prints the selected plant labels.
 */
export async function printLabelsToNiimbot(
  plants: Plant[],
  lv: (val: any) => string,
  options: NiimbotPrintOptions = {}
): Promise<void> {
  const { transport = 'bluetooth', layout = 'qr', density: customDensity, onProgress } = options;

  if (transport === 'bluetooth' && !isNiimbotWebBluetoothSupported()) {
    throw new Error(
      'Web Bluetooth is not available in this browser. Use Chrome/Edge on Android or Desktop over HTTPS (or Bluefy on iOS).'
    );
  }
  if (transport === 'serial' && !isNiimbotWebSerialSupported()) {
    throw new Error(
      'Web Serial is not available in this browser. Use Chrome or Edge on Desktop.'
    );
  }

  const {
    NiimbotBluetoothClient,
    NiimbotSerialClient,
    ImageEncoder,
    PageColorType,
    LabelType,
  } = await import('@mmote/niimbluelib');

  const client = transport === 'serial' ? new NiimbotSerialClient() : new NiimbotBluetoothClient();

  if (onProgress) {
    onProgress({
      message: `Connecting via ${transport === 'serial' ? 'USB' : 'Bluetooth'}...`,
    });
  }

  await client.connect();

  try {
    const meta = client.getModelMetadata();
    const taskType = client.getPrintTaskType() ?? 'D110';
    const printDirection = meta?.printDirection ?? 'left';
    const density = customDensity ?? meta?.densityDefault ?? 2;

    if (onProgress) {
      onProgress({
        total: plants.length,
        message: `Connected to ${meta?.model ?? 'Niimbot'} (${taskType}). Density: ${density}. Preparing...`,
      });
    }

    const printTask = client.protocol.newPrintTask(taskType, {
      totalPages: plants.length,
      density,
      labelType: LabelType.WithGaps,
      statusPollIntervalMs: 150,
      statusTimeoutMs: 10000,
    });

    await printTask.printInit();

    for (let i = 0; i < plants.length; i++) {
      const plant = plants[i];
      const canvas = renderD110LabelCanvas(plant, lv(plant.nickname), null, layout);
      const encoded = ImageEncoder.encodeCanvas(canvas, PageColorType.SingleColor, printDirection);

      if (onProgress) {
        onProgress({
          page: i + 1,
          total: plants.length,
          message: `Printing ${i + 1} of ${plants.length}...`,
        });
      }

      await printTask.printPage(encoded, 1);
      await printTask.waitForPageFinished();
    }

    await printTask.waitForFinished();
    await printTask.printEnd();

    if (onProgress) {
      onProgress({
        page: plants.length,
        total: plants.length,
        message: `Finished printing ${plants.length} label(s).`,
      });
    }
  } finally {
    try {
      await client.disconnect();
    } catch {
      // Disconnect cleanup error ignored
    }
  }
}

/**
 * Backwards-compatible wrapper targeting D110 over Web Bluetooth.
 */
export async function printLabelsToNiimbotD110(
  plants: Plant[],
  lv: (val: any) => string,
  onProgress?: (info: NiimbotPrintProgressInfo) => void
): Promise<void> {
  return printLabelsToNiimbot(plants, lv, { transport: 'bluetooth', onProgress });
}
