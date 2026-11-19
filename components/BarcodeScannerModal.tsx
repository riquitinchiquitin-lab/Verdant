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
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

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
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
      } catch {}
    }
    setHasTorch(false);
    setTorchOn(false);
  }, []);

  const emitCode = useCallback(
    (raw: string) => {
      const cleaned = (raw || '').trim();
      if (!cleaned || hasScannedRef.current) return;
      hasScannedRef.current = true;
      stopCamera();
      onScanSuccess(cleaned);
    },
    [onScanSuccess, stopCamera]
  );

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && typeof (track as any).applyConstraints === 'function') {
      try {
        const next = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: next }],
        });
        setTorchOn(next);
      } catch (e) {
        console.warn('Torch toggle failed:', e);
      }
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

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
      // 1. Acquire media stream with robust fallbacks
      let stream: MediaStream | null = null;

      const constraintsList = [
        { video: { facingMode: { exact: facingMode } }, audio: false },
        { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { facingMode: { ideal: facingMode } }, audio: false },
        { video: true, audio: false },
      ];

      for (const constraints of constraintsList) {
        if (cancelled) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err: any) {
          // If permission denied explicitly, don't keep polling
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
            if (!cancelled) {
              setError('Camera permission was denied. Please allow camera access in browser settings, or enter the ID below.');
            }
            return;
          }
        }
      }

      if (cancelled) {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        return;
      }

      if (!stream) {
        setError('No available camera found on this device. You can type or zap the plant ID below.');
        return;
      }

      streamRef.current = stream;

      // Inspect torch support
      try {
        const track = stream.getVideoTracks()[0];
        const capabilities: any = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      } catch {}

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;

      try {
        await video.play();
      } catch (err: any) {
        // AbortError can occur if modal closes quickly or autoplay restricted
        if (err?.name !== 'AbortError' && !cancelled) {
          console.warn('Video play error:', err);
        }
      }

      if (cancelled) return;

      // 2. Barcode Detection Pipeline
      // Strategy A: Native BarcodeDetector (fast, hardware accelerated, battery efficient)
      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      let nativeDetectorWorking = false;

      if (BarcodeDetectorCtor) {
        try {
          const supportedFormats = typeof BarcodeDetectorCtor.getSupportedFormats === 'function'
            ? await BarcodeDetectorCtor.getSupportedFormats()
            : ['qr_code', 'code_128', 'code_39', 'ean_13'];

          const desiredFormats = ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'];
          const activeFormats = desiredFormats.filter((fmt) => supportedFormats.includes(fmt));

          const detector = new BarcodeDetectorCtor({
            formats: activeFormats.length > 0 ? activeFormats : ['qr_code', 'code_128'],
          });

          nativeDetectorWorking = true;

          const detectLoop = async () => {
            if (cancelled || hasScannedRef.current) return;
            if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
              try {
                const barcodes = await detector.detect(video);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  emitCode(barcodes[0].rawValue);
                  return;
                }
              } catch {
                // Ignore transient frame errors
              }
            }
            rafRef.current = requestAnimationFrame(detectLoop);
          };

          rafRef.current = requestAnimationFrame(detectLoop);
          return;
        } catch (detectorErr) {
          console.warn('Native BarcodeDetector initialization failed, falling back to ZXing:', detectorErr);
          nativeDetectorWorking = false;
        }
      }

      // Strategy B: Universal ZXing decode loop
      if (!nativeDetectorWorking) {
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');

          if (cancelled || !videoRef.current) return;

          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 200,
            delayBetweenScanSuccess: 500,
          });

          // decodeFromVideoElement will read the already playing video stream!
          const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (result && !cancelled) {
              emitCode(result.getText());
            }
          });

          if (cancelled) {
            controls.stop();
          } else {
            zxingControlsRef.current = controls;
          }
        } catch (zxingErr) {
          console.error('ZXing Scanner Fallback Error:', zxingErr);
          if (!cancelled) {
            setError('Unable to analyze camera frames. You can still enter or zap the barcode ID below.');
          }
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, facingMode, emitCode, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      emitCode(manualCode.trim());
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan Plant Code">
      <div className="flex flex-col items-center space-y-4 py-1">
        {error ? (
          <div className="w-full text-center p-6 rounded-3xl bg-md-error-container/60 border border-md-error/25 space-y-3">
            <Camera className="w-8 h-8 text-md-error mx-auto opacity-80" />
            <p className="text-xs font-semibold text-md-on-error-container max-w-sm mx-auto leading-relaxed">
              {error}
            </p>
          </div>
        ) : (
          <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] rounded-3xl overflow-hidden border border-md-outline-variant/50 shadow-xl bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Scanning Reticle (supports both 2D QR & 1D Barcode) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6">
              <div className="w-56 h-48 sm:w-64 sm:h-52 border-2 border-md-primary/70 rounded-3xl relative bg-black/10 backdrop-blur-[0.5px]">
                <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-md-primary rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-md-primary rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-md-primary rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-md-primary rounded-br-2xl" />

                {/* Animated Laser Beam */}
                <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)] animate-pulse" />
              </div>
              <p className="mt-3 text-[11px] font-semibold text-white/90 bg-black/60 px-3.5 py-1 rounded-full shadow-xs">
                Align QR Code or Barcode in frame
              </p>
            </div>

            {/* Camera Floating Controls (Switch Camera & Flashlight) */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  aria-label="Toggle Flashlight"
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    torchOn ? 'bg-amber-400 text-black shadow-md' : 'bg-black/60 text-white hover:bg-black/80'
                  }`}
                >
                  <span className="text-xs font-bold">⚡</span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleFacingMode}
                aria-label="Switch Camera"
                className="w-9 h-9 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition-all"
                title="Switch camera"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Manual / Hardware Scanner Input */}
        <form onSubmit={handleManualSubmit} className="w-full space-y-2 pt-1">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-md-on-surface-variant px-1">
            <Keyboard className="w-3.5 h-3.5" />
            Or enter / zap Plant Code (e.g. V-3DA6F9F2)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. V-3DA6F9F2 or plant ID"
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
