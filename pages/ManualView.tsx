import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { PlantCard } from '../components/PlantCard';

export const ManualView: React.FC = () => {
  const { t } = useLanguage();

  const handlePrint = () => {
    window.print();
  };

  const demoPlant = {
    id: 'demo-1',
    nickname: { en: 'Monstera Deliciosa', zh: '龟背竹' },
    species: 'Monstera deliciosa',
    images: ['https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&q=80&w=800'],
    isPetSafe: false,
    category: 'Aroid',
    minSoilMoist: 60,
    minTemp: 18,
    minLightLux: 5000,
    minEnvHumid: 65,
    lastWatered: new Date().toISOString(),
    wateringInterval: 7,
    moistureAdvice: { en: 'Maintain consistent soil moisture without waterlogging.' },
    lightAdvice: { en: 'Thrives in bright, indirect solar radiation.' },
    tempAdvice: { en: 'Optimal range between 18°C and 27°C.' },
    nutritionAdvice: { en: 'Nitrogen-rich fertilization during growth cycles.' }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] p-6 md:p-14 pb-32 transition-colors duration-500">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-break { page-break-before: always; }
          aside, header { display: none !important; }
          main { margin: 0 !important; width: 100% !important; max-width: 100% !important; padding: 0 !important; }
          .max-w-7xl { max-width: 100% !important; }
          .p-14 { padding: 1cm !important; }
          .shadow-xl, .shadow-2xl, .shadow-sm { box-shadow: none !important; border: 1px solid #eee !important; }
          .rounded-\[48px\] { rounded: 24px !important; }
        }
      `}} />

      <div className="max-w-5xl mx-auto space-y-16">
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b-2 border-slate-200 dark:border-white/5 pb-12 relative">
          <div className="flex items-center gap-8">
            <div className="w-20 h-20 drop-shadow-[0_0_15px_rgba(94,143,71,0.5)]">
              <Logo />
            </div>
            <div>
              <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">{t('manual_title')}</h1>
              <p className="text-emerald-600 dark:text-emerald-500/60 mt-3 font-black uppercase tracking-[0.4em] text-xs">{t('manual_subtitle')}</p>
            </div>
          </div>
          <Button onClick={handlePrint} className="no-print rounded-3xl h-16 px-10 bg-emerald-600 hover:bg-emerald-700 shadow-2xl shadow-emerald-500/20 font-black uppercase tracking-widest border-b-4 border-emerald-900 active:translate-y-1 transition-all">
            <svg className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {t('manual_print')}
          </Button>
        </div>

        {/* SECTION 1: ARCHITECTURE */}
        <div className="space-y-10">
            <div className="p-12 bg-white dark:bg-slate-900/50 rounded-[50px] border border-slate-100 dark:border-white/5 relative overflow-hidden group shadow-sm dark:shadow-none">
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 blur-[120px] rounded-full group-hover:bg-emerald-500/10 transition-all duration-1000"></div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-6">{t('doc_intro_title')}</h2>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium text-lg max-w-3xl">
                    {t('doc_intro_body')}
                </p>
                <div className="mt-12 flex flex-wrap gap-8">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 px-4 py-2 bg-slate-50 dark:bg-slate-900/40 rounded-full border border-slate-100 dark:border-white/5">{t('manual_aes')}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 px-4 py-2 bg-slate-50 dark:bg-slate-900/40 rounded-full border border-slate-100 dark:border-white/5">{t('manual_proxmox')}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-500 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/5 rounded-full border border-emerald-100 dark:border-emerald-500/20">{t('manual_ai_uplink')}</span>
                </div>
            </div>
        </div>

        {/* SECTION 2: ACCESS CONTROL - HIDDEN AS REQUESTED */}
        {/*
        <div className="space-y-10">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-6">
                <div className="w-14 h-14 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-blue-500/20">🔑</div>
                {t('doc_auth_title')}
            </h2>
            <div className="pl-20 space-y-10">
                <p className="text-slate-400 leading-relaxed font-medium text-lg">
                    {t('doc_auth_body')}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {['OWNER', 'CO_CEO', 'LEAD_HAND', 'GARDENER'].map(role => (
                        <div key={role} className="p-6 bg-slate-900 border border-white/5 rounded-3xl text-center shadow-xl">
                            <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest mb-2">{t('role_' + role.toLowerCase())}</p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{t('manual_access_level', { level: (role === 'OWNER' ? 0 : 1).toString() })}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
        */}

        {/* SECTION 3: SPECIMEN DASHBOARD */}
        <div className="space-y-10 print-break">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-6">
                <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-emerald-500/20">📸</div>
                {t('doc_ident_title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 pl-20 items-center">
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium text-lg">
                    {t('doc_ident_body')}
                </p>
                <div className="relative">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.5em] mb-6 text-right print:hidden">{t('manual_visual_asset_preview')}</p>
                    <div className="transform scale-90 md:scale-100 origin-top-right">
                        <PlantCard plant={demoPlant as any} showActions={false} />
                    </div>
                </div>
            </div>
        </div>

        {/* SECTION 4: INVENTORY & MIXES */}
        <div className="space-y-10">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-6">
                <div className="w-14 h-14 bg-amber-500/10 text-amber-600 dark:text-amber-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-amber-500/20">📦</div>
                {t('doc_inventory_title')}
            </h2>
            <div className="pl-20 space-y-10">
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium text-lg">
                    {t('doc_inventory_body')}
                </p>
                <div className="bg-slate-900 dark:bg-slate-950 rounded-[40px] p-10 text-white space-y-6 shadow-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <div className="flex justify-between border-b border-white/10 pb-4">
                        <span className="text-[10px] font-black tracking-[0.3em] opacity-40 uppercase italic">{t('manual_formula_engine')}</span>
                        <span className="text-[10px] font-black tracking-[0.3em] text-emerald-500 uppercase">{t('manual_dual_unit_ready')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-mono">
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 text-slate-300">
                           <span className="block text-emerald-500 mb-2">{t('manual_proportion_logic')}</span>
                           {t('manual_proportion_formula')}
                        </div>
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 text-slate-300">
                           <span className="block text-emerald-500 mb-2">{t('manual_persistance')}</span>
                           {t('manual_vault')}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* SECTION 5: LABEL PROTOCOL */}
        <div className="space-y-10 print-break">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-6">
                <div className="w-14 h-14 bg-purple-500/10 text-purple-600 dark:text-purple-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-purple-500/20">🏷️</div>
                {t('doc_labels_title')}
            </h2>
            <div className="flex flex-col md:flex-row gap-16 pl-20">
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium text-lg flex-1">
                    {t('doc_labels_body')}
                </p>
                <div className="w-56 h-72 bg-white p-8 rounded-[40px] shadow-2xl border-4 border-emerald-500 border-dashed flex flex-col items-center justify-center text-center shrink-0">
                    <p className="text-[10px] font-black text-emerald-600 uppercase mb-6 tracking-widest leading-none">{t('manual_security_token')}</p>
                    <div className="w-32 h-32 bg-gray-50 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                        <svg className="w-16 h-16 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-3 0h2v2h-2v-2zm3 3h3v2h-3v-2zm-3 0h2v2h-2v-2zm3 3h3v2h-3v-2z" /></svg>
                    </div>
                    <p className="text-[8px] font-black text-gray-400 uppercase leading-relaxed tracking-tighter">
                        {t('manual_uuid', { id: demoPlant.id })}<br/>
                        {t('manual_hash', { species: demoPlant.species })}
                    </p>
                </div>
            </div>
        </div>

        {/* FOOTER */}
        <div className="pt-24 text-center opacity-30 border-t border-slate-200 dark:border-white/5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em]">{t('manual_footer_copyright')}</p>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-3 italic">{t('manual_footer_optimized')}</p>
        </div>
      </div>
    </div>
  );
};
