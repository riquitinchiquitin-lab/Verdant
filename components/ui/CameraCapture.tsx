import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { useLanguage } from '../../context/LanguageContext';

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
  onCancel: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onCancel }) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLensReady, setIsLensReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    setIsInitializing(true);
    setError(null);
    setIsLensReady(false);
    stopTracks();
    
    const tryStream = async (constraints: MediaStreamConstraints) => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          
          // Wait for metadata to ensure video width/height are available
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => {
              setIsLensReady(true);
            }).catch(err => {
              console.error("Video play failed:", err);
            });
          };

          // Safari/iOS fallback for direct play
          await videoRef.current.play();
        }
        return true;
      } catch (err) {
        console.warn("Camera attempt failed:", constraints, err);
        return false;
      }
    };

    // Attempt with current facingMode
    let success = await tryStream({ 
      video: { 
        facingMode: { ideal: facingMode } 
      }, 
      audio: false 
    });
    
    // Fallback (Any camera)
    if (!success) {
      success = await tryStream({ video: true, audio: false });
    }

    if (!success) {
      setError(t('msg_camera_denied'));
    }
    
    setIsInitializing(false);
  };

  useEffect(() => {
    startCamera();

    return () => {
      stopTracks();
    };
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current && isLensReady) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Safety check for dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        setError(t('msg_camera_empty'));
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        
        // CRITICAL: Stop tracks immediately to turn off hardware LED
        stopTracks();
        onCapture(dataUrl);
      }
    }
  };

  const handleCancel = () => {
    stopTracks();
    onCancel();
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-red-50 dark:bg-red-900/10 rounded-[32px] border border-red-100 dark:border-red-900/30">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-gray-700 dark:text-slate-300">{error}</p>
        <Button variant="secondary" size="sm" onClick={handleCancel} className="rounded-xl px-8">{t('cancel')}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-6 animate-in fade-in duration-300">
      <div className="relative w-full aspect-square max-w-[350px] rounded-[48px] overflow-hidden border-8 border-white dark:border-slate-800 shadow-2xl bg-black group">
        {(isInitializing || !isLensReady) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
            <div className="w-10 h-10 border-4 border-verdant border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-[10px] font-black text-verdant uppercase tracking-widest animate-pulse">{t('status_initializing_lens')}</p>
          </div>
        )}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Switch Camera Button */}
        <button 
          onClick={toggleCamera}
          className="absolute top-6 right-6 p-3 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-all z-20 border border-white/20"
          title={t('btn_switch_camera')}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Viewfinder Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-64 border-2 border-white/20 rounded-[32px] relative">
             <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
             <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
             <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
             <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl"></div>
             
             {/* Scanning Line */}
             <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-[scan_3s_infinite]"></div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 w-full px-4">
        <button 
          onClick={handleCancel}
          className="p-4 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <button 
          onClick={handleCapture}
          disabled={!isLensReady}
          className={`flex-1 h-16 bg-verdant hover:bg-verdant-hover text-white rounded-3xl shadow-xl shadow-verdant/20 flex items-center justify-center gap-3 transition-all group ${!isLensReady ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
            <div className="w-4 h-4 bg-white rounded-full"></div>
          </div>
          <span className="font-black uppercase tracking-widest text-sm">{t('btn_capture_specimen')}</span>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
          @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
          }
      `}} />
    </div>
  );
};
