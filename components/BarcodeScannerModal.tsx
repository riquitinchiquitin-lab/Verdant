import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScanBarcode, Camera, Keyboard } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (code: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const hasScannedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }
  }, []);

  const emitCode = useCallback(
    (raw: string) => {
      const cleaned = raw.trim();
      if (!cleaned || hasScannedRef.current) return;
      hasScannedRef.current = true;
      stopCamera();
      onScanSuccess(cleaned);
    },
    [onScanSuccess, stopCamera]
  );

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    hasScannedRef.current = false;
    setError(null);
    setManualCode('');
    let cancelled = false;

    const startScanner = async () => {
      const BarcodeDetectorCtor = (window as any).BarcodeDetector;

      // Path 1: Native hardware-accelerated BarcodeDetector (Chrome/Edge Android & Desktop)
      if (BarcodeDetectorCtor) {
        try {
          const detector = new BarcodeDetectorCtor({
            formats: ['code_128', 'code_39', 'ean_13'],
          });
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute('playsinline', 'true');
            await videoRef.current.play();

            const detectLoop = async () => {
              if (cancelled || hasScannedRef.current) return;
              const video = videoRef.current;
              if (video && video.readyState >= video.HAVE_ENOUGH_DATA) {
                try {
                  const barcodes = await detector.detect(video);
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    emitCode(barcodes[0].rawValue);
                    return;
                  }
                } catch {}
              }
              rafRef.current = requestAnimationFrame(detectLoop);
            };
            rafRef.current = requestAnimationFrame(detectLoop);
            return;
          }
        } catch {
          // Fall through to ZXing fallback or show error
        }
      }

      // Path 2: Universal @zxing/browser Code 128 fallback
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled || !videoRef.current) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              emitCode(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
        } else {
          zxingControlsRef.current = controls;
        }
      } catch (err) {
        console.error('Barcode Scanner Error:', err);
        if (!cancelled) {
          setError('Camera unavailable or permission denied. You can still enter or zap a barcode ID below.');
        }
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, emitCode, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      emitCode(manualCode.trim());
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan Plant Barcode">
      <div className="flex flex-col items-center space-y-5 py-2">
        {error ? (
          <div className="w-full text-center p-5 rounded-2xl bg-md-error-container/60 border border-md-error/25 space-y-2">
            <Camera className="w-6 h-6 text-md-error mx-auto" />
            <p className="text-xs font-semibold text-md-on-error-container">{error}</p>
          </div>
        ) : (
          <div className="relative w-full aspect-[16/10] rounded-3xl overflow-hidden border border-md-outline-variant/50 shadow-lg bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Horizontal Code 128 Reticle */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6">
              <div className="w-full max-w-[260px] h-24 border-2 border-md-primary/70 rounded-2xl relative bg-black/10">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-md-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-md-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-md-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-md-primary rounded-br-xl" />
                <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.85)]" />
              </div>
              <p className="mt-3 text-[11px] font-semibold text-white/85 bg-black/50 px-3 py-1 rounded-full">
                Align Code 128 label inside frame
              </p>
            </div>
          </div>
        )}

        {/* Manual / Hardware Scanner Input */}
        <form onSubmit={handleManualSubmit} className="w-full space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-md-on-surface-variant px-1">
            <Keyboard className="w-3.5 h-3.5" />
            Or type / zap Code 128 ID (e.g. V-3DA6F9F2)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="V-3DA6F9F2"
              className="flex-1 h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 font-mono text-sm text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30"
            />
            <Button type="submit" variant="primary" size="md" disabled={!manualCode.trim()}>
              <ScanBarcode className="w-4 h-4" />
              Open
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
