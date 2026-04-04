import React from 'react';
import { Plant } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { motion } from 'framer-motion';
import { ArrowRight, Leaf, Activity } from 'lucide-react';

interface FeaturedPlantProps {
  plant: Plant;
  onClick: () => void;
}

export const FeaturedPlant: React.FC<FeaturedPlantProps> = ({ plant, onClick }) => {
  const { lv, t } = useLanguage();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full h-[400px] md:h-[500px] bg-white dark:bg-slate-950 rounded-[48px] overflow-hidden group cursor-pointer border border-gray-100 dark:border-white/5 shadow-xl dark:shadow-2xl"
      onClick={onClick}
    >
      {/* Background Image */}
      {plant.images?.[0] ? (
        <img 
          src={plant.images[0]} 
          alt={lv(plant.nickname)}
          className="absolute inset-0 w-full h-full object-cover opacity-80 dark:opacity-60 group-hover:scale-105 transition-transform duration-[2s] ease-out"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-800">
          <Leaf className="w-24 h-24 text-slate-200 dark:text-slate-700" />
        </div>
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 dark:from-black dark:via-black/20 to-transparent" />
      
      {/* Hardware Accents */}
      <div className="absolute top-10 left-10 z-20 space-y-1">
        <div className="flex items-center gap-2 bg-white/80 dark:bg-verdant/20 backdrop-blur-md px-3 py-1 rounded-full border border-gray-200 dark:border-verdant/30 shadow-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-verdant animate-pulse" />
          <span className="text-[9px] font-mono text-verdant tracking-[0.2em] uppercase font-bold">{t('lbl_priority_specimen')}</span>
        </div>
      </div>

      <div className="absolute top-10 right-10 z-20">
        <div className="text-[10px] font-mono text-slate-400 dark:text-white/40 tracking-widest uppercase [writing-mode:vertical-rl] rotate-180">
          EST. {plant.createdAt ? new Date(plant.createdAt).getFullYear() : '2024'}
        </div>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-10 md:p-16 z-20">
        <div className="max-w-3xl space-y-6">
          <div className="space-y-2">
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-3"
            >
              <span className="h-px w-8 bg-verdant" />
              <span className="text-[10px] font-black text-verdant uppercase tracking-[0.4em]">{t('lbl_featured_subject')}</span>
            </motion.div>
            <h2 className="text-5xl md:text-8xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.85] uppercase">
              {lv(plant.nickname)}
            </h2>
            <p className="text-xl md:text-2xl font-serif italic text-slate-600 dark:text-white/60">
              {plant.species}
            </p>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-verdant" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[8px] font-black text-slate-400 dark:text-white/40 uppercase tracking-widest">{t('lbl_health')}</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">{plant.healthStatus || t('sys_stable')}</p>
              </div>
            </div>
            
            <motion.button 
              whileHover={{ x: 5 }}
              className="flex items-center gap-3 text-slate-900 dark:text-white group/btn"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">{t('btn_examine_dossier')}</span>
              <div className="w-10 h-10 rounded-full border border-slate-900/20 dark:border-white/20 flex items-center justify-center group-hover/btn:bg-slate-900 group-hover/btn:text-white dark:group-hover/btn:bg-white dark:group-hover/btn:text-slate-950 transition-all">
                <ArrowRight className="w-5 h-5" />
              </div>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Hardware Grid Decoration */}
      <div className="absolute bottom-0 right-0 w-64 h-64 opacity-20 dark:opacity-10 pointer-events-none">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      </div>
    </motion.div>
  );
};
