
import React, { useState, useRef } from 'react';
import { Plant, LocalizedString, LocalizedArray } from '../types';
import { Button } from './ui/Button';
import { useLanguage } from '../context/LanguageContext';
import { analyzePlantHealth } from '../services/plantAi';
import { usePlants } from '../context/PlantContext';
import { CameraCapture } from './ui/CameraCapture';
import { compressImage } from '../services/imageUtils';
import { generateUUID } from '../services/crypto';

interface HealthCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  plant: Plant;
}

export const HealthCheckModal: React.FC<HealthCheckModalProps> = ({ isOpen, onClose, plant }) => {
  const { t, lv, lva } = useLanguage();
  const { addLog, getEffectiveApiKey } = usePlants();
  const [observations, setObservations] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ diagnosis: LocalizedString; recoveryPlan: LocalizedArray } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (base64: string) => {
    setPhoto(base64);
    setIsCapturing(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const base64 = await compressImage(e.target.files[0]);
      setPhoto(base64);
    }
  };

  const handleRunCheck = async () => {
    if (!photo) return;
    setIsLoading(true);
    try {
      const diagnosis = await analyzePlantHealth(plant, photo, observations, getEffectiveApiKey());
      if (diagnosis) {
        setResult(diagnosis);
        // Save to history
        await addLog(plant.id, {
          id: `h-${generateUUID()}`,
          date: new Date().toISOString(),
          type: 'DISEASE_CHECK',
          imageUrl: photo,
          localizedNote: diagnosis.diagnosis,
          metadata: { 
            recoveryPlan: diagnosis.recoveryPlan,
            observations: observations
          }
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setObservations('');
    setPhoto(null);
    setResult(null);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 transition-all">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-black uppercase tracking-widest text-gray-900 dark:text-white">
            {t('health_check_title') || 'Botanical Health Check'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          {!result ? (
            <>
              <div className="space-y-4">
                <label className="text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {t('lbl_observations') || 'Your Observations'}
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder={t('placeholder_observations') || 'Describe any issues (yellowing, spots, pests)...'}
                  className="w-full h-32 p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 text-sm font-serif italic focus:ring-2 focus:ring-verdant outline-none transition-all resize-none dark:text-white"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {t('lbl_specimen_photo') || 'Specimen Photo'}
                </label>
                
                {photo ? (
                  <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-verdant">
                    <img src={photo} className="w-full h-full object-cover" alt="Specimen" />
                    <button 
                      onClick={() => setPhoto(null)}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setIsCapturing(true)}
                      className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:border-verdant hover:bg-verdant/5 transition-all text-gray-400 hover:text-verdant"
                    >
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('use_camera')}</span>
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2 hover:border-verdant hover:bg-verdant/5 transition-all text-gray-400 hover:text-verdant"
                    >
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('choose_picture')}</span>
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800/30 space-y-4">
                <h3 className="text-[10px] font-serif font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {t('lbl_diagnosis') || 'Diagnosis'}
                </h3>
                <p className="text-lg font-serif italic text-emerald-900 dark:text-emerald-100 leading-relaxed">
                  "{lv(result.diagnosis)}"
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-serif font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {t('lbl_recovery_plan') || 'Recovery Plan'}
                </h3>
                <div className="space-y-3">
                  {lva(result.recoveryPlan)?.map((step, idx) => (
                    <div key={idx} className="flex gap-4 items-start p-4 bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700">
                      <span className="w-6 h-6 bg-verdant text-white rounded-full flex items-center justify-center text-[10px] font-serif font-black shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-sm font-serif text-gray-700 dark:text-slate-200 leading-relaxed">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-slate-800 flex gap-4">
          {!result ? (
            <Button 
              variant="primary" 
              className="w-full rounded-2xl h-14 font-black uppercase tracking-widest"
              onClick={handleRunCheck}
              disabled={!photo || isLoading}
              isLoading={isLoading}
            >
              {t('btn_run_check') || 'Initiate Analysis'}
            </Button>
          ) : (
            <Button 
              variant="secondary" 
              className="w-full rounded-2xl h-14 font-black uppercase tracking-widest"
              onClick={reset}
            >
              {t('btn_new_check') || 'New Check'}
            </Button>
          )}
        </div>
      </div>

      {isCapturing && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
          <div className="w-full max-w-xl">
            <CameraCapture onCapture={handleCapture} onCancel={() => setIsCapturing(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
