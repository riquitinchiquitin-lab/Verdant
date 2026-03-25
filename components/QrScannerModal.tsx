import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (data: string) => void;
}

declare global {
  interface Window {
    jsQR: any;
  }
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ isOpen, onClose, onScanSuccess }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<number>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }

    if (requestRef.current !== null) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      
      if (!isOpen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.play();
        requestRef.current = requestAnimationFrame(tick);
      }
    } catch (err) {
      console.error("Scanner Camera Error:", err);
      setError("Camera access denied.");
    }
  };

  const tick = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      
      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          stopCamera();
          onScanSuccess(code.data);
          return;
        }
      }
    }
    
    if (isOpen) {
      requestRef.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('scan_garden_sync') || "Identity Scanner"}>
      <div className="flex flex-col items-center space-y-6 py-4">
        {error ? (
          <div className="text-center p-8 bg-red-50 rounded-[32px] border border-red-100">
             <p className="text-red-600 font-black uppercase tracking-widest text-xs mb-4">{error}</p>
             <Button onClick={onClose}>{t('done')}</Button>
          </div>
        ) : (
          <div className="relative w-full aspect-square max-w-[300px] rounded-[48px] overflow-hidden border-8 border-gray-100 dark:border-slate-800 shadow-2xl bg-black">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover" 
              playsInline 
              muted 
            />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-verdant/50 rounded-[32px] relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-verdant rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-verdant rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-verdant rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-verdant rounded-br-xl"></div>
                
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-verdant shadow-[0_0_15px_rgba(94,143,71,0.8)] animate-[scan_2s_infinite]"></div>
              </div>
              <p className="mt-8 text-[10px] font-black text-white/50 uppercase tracking-[0.3em]">{t('align_sync_code') || "Align Garden Code"}</p>
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest text-center px-4">
          Scan a garden label to import specimen metadata from another site.
        </p>
        
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes scan {
            0% { top: 0%; opacity: 0; }
            5% { opacity: 1; }
            95% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
          }
        `}} />
      </div>
    </Modal>
  );
};
