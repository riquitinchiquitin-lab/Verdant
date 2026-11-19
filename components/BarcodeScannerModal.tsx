import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScanBarcode, Camera, Keyboard } from 'lucide-react';
import {
  QRCodeReader,
  MultiFormatOneDReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
} from '@zxing/library';
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
  const timerRef = useRef<NodeJS.Timeout | number | null>(null);
  const hasScannedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current as any);
      timerRef.current = null;
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
    let isCancelled = false;

    const startScanner = async () => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported or requires a secure HTTPS connection. Please enter the ID manually below.');
        return;
      }

      // Step 1: Acquire Camera Stream
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err: any) {
        // Fallback: try default video without constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2: any) {
          if (isCancelled) return;
          if (err2?.name === 'NotAllowedError' || err2?.name === 'PermissionDeniedError') {
            setError('Camera permission was denied. Please allow camera access in browser permissions or enter the code below.');
          } else if (err2?.name === 'NotFoundError' || err2?.name === 'DevicesNotFoundError') {
            setError('No camera found on this device. You can enter or zap the plant ID below.');
          } else if (err2?.name === 'NotReadableError' || err2?.name === 'TrackStartError') {
            setError('Camera is currently locked or in use by another tab/application.');
          } else {
            setError(err2?.message || 'Could not access camera.');
          }
          return;
        }
      }

      if (isCancelled) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (!stream) {
        setError('No camera stream available.');
        return;
      }

      streamRef.current = stream;

      // Inspect torch support
      try {
        const track = stream.getVideoTracks()[0];
        const capabilities: any = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
        if (capabilities?.torch) {
          setHasTorch(true);
        }
      } catch {}

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;

      try {
        await video.play();
      } catch (err: any) {
        if (err?.name !== 'AbortError' && !isCancelled) {
          console.warn('Video play warning:', err);
        }
      }

      if (isCancelled) return;

      // Step 2: Initialize Decoders
      // Decoder A: Native BarcodeDetector (if supported by browser/device)
      let nativeDetector: any = null;
      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      if (typeof BarcodeDetectorCtor === 'function') {
        try {
          const supported: string[] = typeof BarcodeDetectorCtor.getSupportedFormats === 'function'
            ? await BarcodeDetectorCtor.getSupportedFormats()
            : [];
          const wanted = ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'].filter((f) => supported.includes(f));
          if (wanted.length > 0) {
            nativeDetector = new BarcodeDetectorCtor({ formats: wanted });
          }
        } catch {
          nativeDetector = null;
        }
      }

      // Decoder B: Direct @zxing/library Readers (fail-safe fallback)
      const qrReader = new QRCodeReader();
      const oneDHints = new Map();
      oneDHints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
      ]);
      const oneDReader = new MultiFormatOneDReader(oneDHints);

      // Offscreen analysis canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Step 3: Scan loop running every 120ms (smooth, lightweight, responsive)
      let isProcessingFrame = false;

      const scanFrame = async () => {
        if (isCancelled || hasScannedRef.current || isProcessingFrame) return;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        isProcessingFrame = true;
        try {
          // Attempt 1: Native BarcodeDetector
          if (nativeDetector) {
            try {
              const barcodes = await nativeDetector.detect(video);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                emitCode(barcodes[0].rawValue);
                return;
              }
            } catch {
              // Ignore native frame failure, fall through to software decoder
            }
          }

          // Attempt 2: ZXing Software Decoder
          if (ctx) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            // Downscale to max 480px width for fast 3ms frame processing
            const scale = Math.min(1, 480 / vw);
            const cw = Math.round(vw * scale);
            const ch = Math.round(vh * scale);

            if (canvas.width !== cw || canvas.height !== ch) {
              canvas.width = cw;
              canvas.height = ch;
            }

            ctx.drawImage(video, 0, 0, cw, ch);
            const imgData = ctx.getImageData(0, 0, cw, ch);
            const data = imgData.data;
            const totalPixels = cw * ch;

            // Compute 1-byte perceived luminance array
            const luminances = new Uint8ClampedArray(totalPixels);
            for (let i = 0; i < totalPixels; i++) {
              luminances[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
            }

            const lumSource = new RGBLuminanceSource(luminances, cw, ch);
            const bitmap = new BinaryBitmap(new HybridBinarizer(lumSource));

            // Check QR Code first
            try {
              const qrRes = qrReader.decode(bitmap);
              if (qrRes && qrRes.getText()) {
                emitCode(qrRes.getText());
                return;
              }
            } catch {}

            // Check 1D Barcode (Code 128 / Code 39 / EAN 13)
            try {
              const oneDRes = oneDReader.decode(bitmap);
              if (oneDRes && oneDRes.getText()) {
                emitCode(oneDRes.getText());
                return;
              }
            } catch {}
          }
        } finally {
          isProcessingFrame = false;
        }
      };

      timerRef.current = setInterval(scanFrame, 120);
    };

    startScanner();

    return () => {
      isCancelled = true;
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
