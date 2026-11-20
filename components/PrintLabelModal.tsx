import React, { useState, useRef, useEffect } from 'react';
import { Bluetooth, Usb, Printer, Download, FileSpreadsheet, QrCode, Barcode, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Plant } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  renderD110LabelCanvas,
  getShortBarcodeId,
  isNiimbotWebBluetoothSupported,
  isNiimbotWebSerialSupported,
  printLabelsToNiimbot,
  LabelLayoutType,
  D110_LABEL_W_PX,
  D110_LABEL_H_PX
} from '../services/barcodeService';
import { exportPlantsToNiimbotExcel } from '../services/exportService';

interface PrintLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant | Partial<Plant> | null;
  isInitialPrompt?: boolean;
}

export const PrintLabelModal: React.FC<PrintLabelModalProps> = ({
  isOpen,
  onClose,
  plant,
  isInitialPrompt = false
}) => {
  const { t, lv } = useLanguage();
  const [layout, setLayout] = useState<LabelLayoutType>('qr');
  const [density, setDensity] = useState<number>(2);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const bleSupported = isNiimbotWebBluetoothSupported();
  const serialSupported = isNiimbotWebSerialSupported();

  useEffect(() => {
    if (isOpen && plant && canvasRef.current) {
      const fullPlant = plant as Plant;
      renderD110LabelCanvas(fullPlant, lv(fullPlant.nickname), canvasRef.current, layout);
    }
  }, [isOpen, plant, layout, lv]);

  if (!plant) return null;

  const fullPlant = plant as Plant;
  const barcodeId = getShortBarcodeId(fullPlant.id);
  const plantName = lv(fullPlant.nickname) || fullPlant.species || 'Specimen';

  const handlePrint = async (transport: 'bluetooth' | 'serial' = 'bluetooth') => {
    if (isPrinting) return;
    setIsPrinting(true);
    setPrintError(null);
    setPrintStatus(
      transport === 'serial' ? 'Connecting via USB Serial...' : 'Connecting via Bluetooth...'
    );

    try {
      await printLabelsToNiimbot([fullPlant], lv, {
        transport,
        layout,
        density,
        onProgress: (info) => {
          setPrintStatus(info.message || 'Printing label...');
        }
      });
      setPrintStatus('✓ Label printed successfully!');
    } catch (err: any) {
      console.error('Print error:', err);
      setPrintError(err?.message || 'Failed to communicate with printer.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBrowserPrint = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const printWindow = window.open('', '_blank', 'width=700,height=500');
    if (!printWindow) {
      setPrintError('Popup blocked by browser. Please allow popups to use browser print.');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Label - ${plantName}</title>
          <style>
            @page {
              size: 50mm 15mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background: #ffffff;
            }
            img {
              width: 50mm;
              height: 15mm;
              object-fit: contain;
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
              image-rendering: pixelated;
            }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" onload="window.print(); window.close();" />
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `label_${fullPlant.id || 'plant'}_15x50mm_${layout}.png`;
    link.href = url;
    link.click();
  };

  const handleDownloadExcel = () => {
    const fileName = `verdant_label_${barcodeId.toLowerCase()}_${Date.now()}.xlsx`;
    exportPlantsToNiimbotExcel([fullPlant], lv, fileName);
    setPrintStatus('Label spreadsheet (.xlsx) downloaded.');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isInitialPrompt ? 'Specimen Saved · Print Label' : 'Print Botanical Label'}
    >
      <div className="space-y-5 max-h-[85vh] overflow-y-auto no-scrollbar px-1 pb-2">
        {isInitialPrompt && (
          <div className="p-4 rounded-2xl bg-md-primary-container/60 border border-md-primary/20 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-md-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-md-on-surface">
                {plantName} has been cataloged!
              </p>
              <p className="text-xs text-md-on-surface-variant">
                Print a physical weatherproof 15×50mm sticker with barcode ID{' '}
                <span className="font-mono font-semibold text-md-primary">{barcodeId}</span> for this specimen.
              </p>
            </div>
          </div>
        )}

        {/* Live Label Canvas Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-md-on-surface-variant">
            <span>Live Label Preview (15 × 50 mm)</span>
            <span className="font-mono text-[11px] text-md-primary">{barcodeId}</span>
          </div>

          <div className="p-4 bg-slate-900 rounded-2xl border border-md-outline-variant/30 flex flex-col items-center justify-center overflow-hidden shadow-inner">
            <div className="bg-white rounded-lg p-2 shadow-md max-w-full overflow-x-auto flex justify-center">
              <canvas
                ref={canvasRef}
                width={D110_LABEL_W_PX}
                height={D110_LABEL_H_PX}
                className="w-full max-w-[360px] h-auto object-contain border border-slate-200"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-mono">
              Niimbot D110/B21 Compatible · 203 DPI · Binarized Monochrome
            </p>
          </div>
        </div>

        {/* Layout & Density Controls */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5">
              Layout Style
            </label>
            <div className="inline-flex w-full bg-md-surface-container-high rounded-2xl p-1 border border-md-outline-variant/30">
              <button
                type="button"
                onClick={() => setLayout('qr')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  layout === 'qr'
                    ? 'bg-md-primary text-md-on-primary shadow-sm'
                    : 'text-md-on-surface-variant hover:text-md-on-surface'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setLayout('barcode')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  layout === 'barcode'
                    ? 'bg-md-primary text-md-on-primary shadow-sm'
                    : 'text-md-on-surface-variant hover:text-md-on-surface'
                }`}
              >
                <Barcode className="w-3.5 h-3.5" />
                <span>Barcode 128B</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-md-on-surface-variant mb-1.5">
              Print Density
            </label>
            <div className="inline-flex w-full bg-md-surface-container-high rounded-2xl p-1 border border-md-outline-variant/30">
              {[
                { label: 'Normal', value: 2 },
                { label: 'High Contrast', value: 3 }
              ].map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDensity(d.value)}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all ${
                    density === d.value
                      ? 'bg-md-primary text-md-on-primary shadow-sm'
                      : 'text-md-on-surface-variant hover:text-md-on-surface'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feedback Messages */}
        {printStatus && (
          <div className="p-3 rounded-2xl bg-md-primary-container text-md-on-primary-container text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{printStatus}</span>
          </div>
        )}

        {printError && (
          <div className="p-3 rounded-2xl bg-md-error-container text-md-on-error-container text-xs font-medium flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{printError}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="primary"
              isLoading={isPrinting}
              disabled={isPrinting}
              onClick={() => void handlePrint('bluetooth')}
              className="w-full"
            >
              <Bluetooth className="w-4 h-4" />
              <span>Print Bluetooth (Niimbot)</span>
            </Button>

            <Button
              type="button"
              variant="tonal"
              disabled={isPrinting || !serialSupported}
              title={!serialSupported ? 'USB Serial requires Chrome/Edge on Desktop' : undefined}
              onClick={() => void handlePrint('serial')}
              className="w-full"
            >
              <Usb className="w-4 h-4" />
              <span>Print USB Serial</span>
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outlined"
              size="sm"
              onClick={handleBrowserPrint}
              className="w-full"
              title="Print via standard system printer or AirPrint"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="text-xs">Browser Print</span>
            </Button>

            <Button
              type="button"
              variant="outlined"
              size="sm"
              onClick={handleDownloadPng}
              className="w-full"
              title="Download crisp 203 DPI PNG image"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="text-xs">Download PNG</span>
            </Button>

            <Button
              type="button"
              variant="outlined"
              size="sm"
              onClick={handleDownloadExcel}
              className="w-full"
              title="Download Niimbot-compatible Excel spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="text-xs">Niimbot .xlsx</span>
            </Button>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            {isInitialPrompt ? 'Done / Later' : 'Close'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
