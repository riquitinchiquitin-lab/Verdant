import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSystem } from '../context/SystemContext';
import { usePlants } from '../context/PlantContext';
import { Logo } from './ui/Logo';
import { LanguageSelector } from './ui/LanguageSelector';
import { AddPlantModal } from './AddPlantModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { PlantDetailsModal } from './PlantDetailsModal';
import { getShortBarcodeId } from '../services/barcodeService';
import { Plant } from '../types';
import {
  ScanBarcode,
  Sprout,
  Droplets,
  ClipboardList,
  Package,
  Tags,
  MapPin,
  ShieldCheck,
  Search,
  Plus,
  LogOut,
  Menu,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const NotificationToast: React.FC = () => {
  const { notification, clearNotification } = useSystem();
  if (!notification) return null;

  const typeStyles = {
    SUCCESS: 'bg-md-primary-container text-md-on-primary-container border-md-primary/20',
    ERROR: 'bg-md-error-container text-md-on-error-container border-md-error/20',
    WARNING: 'bg-amber-100 text-amber-950 dark:bg-amber-900/80 dark:text-amber-100 border-amber-500/20',
    INFO: 'bg-md-tertiary-container text-md-on-tertiary-container border-md-tertiary/20',
  };

  const icons = {
    SUCCESS: <CheckCircle2 className="w-4 h-4 shrink-0" />,
    ERROR: <AlertCircle className="w-4 h-4 shrink-0" />,
    WARNING: <AlertTriangle className="w-4 h-4 shrink-0" />,
    INFO: <Info className="w-4 h-4 shrink-0" />,
  };

  return (
    <div className="fixed top-[calc(1rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-top-4 duration-300">
      <div className={`${typeStyles[notification.type]} px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 border`}>
        {icons[notification.type]}
        <p className="text-xs font-semibold tracking-wide whitespace-nowrap">{notification.message}</p>
        <button
          onClick={clearNotification}
          aria-label="Dismiss notification"
          className="ml-1 opacity-70 hover:opacity-100 rounded-full p-1 transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const QuotaBar: React.FC = () => {
  const { rpm, limit, status } = useSystem();
  const { isSynced } = usePlants();
  const { t } = useLanguage();

  const percentage = Math.min(100, (rpm / limit) * 100);

  const barColor =
    status === 'COOLDOWN' ? 'bg-md-error' :
    status === 'BUSY' ? 'bg-amber-500' :
    'bg-md-primary';

  const textColor =
    status === 'COOLDOWN' ? 'text-md-error' :
    status === 'BUSY' ? 'text-amber-600 dark:text-amber-400' :
    'text-md-primary';

  return (
    <div className="mx-3 mb-3 p-4 rounded-2xl bg-md-surface-container text-md-on-surface space-y-3">
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[11px] font-medium text-md-on-surface-variant">{t('sys_uplink')}</span>
          <span className={`text-[11px] font-semibold ${textColor}`}>
            {status === 'COOLDOWN' ? t('sys_cooldown') : status === 'BUSY' ? t('sys_busy') : t('sys_stable')}
          </span>
        </div>
        <div className="h-1.5 w-full bg-md-surface-container-highest rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-md-primary animate-pulse' : 'bg-md-outline'}`} />
          <span className="text-[11px] font-medium text-md-on-surface-variant">{t('sys_db_link')}</span>
        </div>
        <span className="text-[10px] font-medium text-md-on-surface-variant/80">
          {isSynced ? t('sys_proxmox_online') : t('sys_local_cache')}
        </span>
      </div>
    </div>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout, user, can } = useAuth();
  const { plants, alertMessage, searchFilter, setSearchFilter, addPlant } = usePlants();
  const { t, lv } = useLanguage();
  const { showNotification } = useSystem();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedPlantId, setScannedPlantId] = useState<string | null>(null);

  const scannedPlant: Plant | null = scannedPlantId
    ? plants.find((p) => p.id === scannedPlantId) || null
    : null;

  const handleScanSuccess = (rawCode: string) => {
    setIsScannerOpen(false);
    const cleaned = rawCode.trim();
    if (!cleaned) return;

    // Support compact V-XXXXXXXX Code 128 IDs, full plant IDs, or legacy pipe-delimited codes
    const parts = cleaned.split('|');
    const candidateId = parts.length >= 2 ? parts[1].trim() : cleaned;
    const upper = candidateId.toUpperCase();
    const lower = candidateId.toLowerCase();

    const matched = plants.find(
      (p) =>
        p.id.toLowerCase() === lower ||
        getShortBarcodeId(p.id).toUpperCase() === upper
    );

    if (matched) {
      setScannedPlantId(matched.id);
    } else {
      showNotification(`No plant found for barcode "${candidateId}"`, 'WARNING');
    }
  };

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) {
      setShowInstallBtn(false);
      return;
    }

    const handlePromptAvailable = () => setShowInstallBtn(true);
    const handleInstalled = () => setShowInstallBtn(false);

    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('pwa-installed', handleInstalled);

    if ((window as any).deferredPwaPrompt) setShowInstallBtn(true);

    return () => {
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPwaPrompt;
    if (!promptEvent) return;

    promptEvent.prompt();
    await promptEvent.userChoice;
    (window as any).deferredPwaPrompt = null;
    setShowInstallBtn(false);
  };

  const navItems = [
    { to: '/', label: t('menu_my_plants'), Icon: Sprout },
    { to: '/care', label: t('menu_care'), Icon: Droplets },
    { to: '/tasks', label: t('menu_tasks'), Icon: ClipboardList },
    { to: '/inventory', label: t('menu_inventory'), Icon: Package },
    { to: '/labels', label: t('menu_labels'), Icon: Tags },
    { to: '/locations', label: t('stats_locations'), Icon: MapPin },
  ];

  const isManager = ['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(user?.role || '');
  if (isManager) {
    navItems.push({ to: '/admin', label: t('menu_admin'), Icon: ShieldCheck });
  }

  const mobilePrimaryItems = navItems.slice(0, 4);

  return (
    <div className="h-dvh w-full bg-md-surface text-md-on-surface flex transition-colors duration-300 overflow-hidden print:h-auto print:overflow-visible">
      <NotificationToast />
      {alertMessage && (
        <div className="fixed top-[calc(4.75rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[900] bg-md-inverse-surface text-md-inverse-on-surface text-xs font-semibold px-5 py-2.5 rounded-2xl shadow-lg animate-in fade-in slide-in-from-top-2 whitespace-nowrap">
          {alertMessage}
        </div>
      )}

      {/* Mobile Scrim */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* M3 Navigation Drawer */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-md-surface-container-low border-r border-md-outline-variant/30 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 flex flex-col no-print pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}>
        <AddPlantModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={addPlant} />
        <BarcodeScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleScanSuccess} />
        <PlantDetailsModal isOpen={!!scannedPlant} plant={scannedPlant} onClose={() => setScannedPlantId(null)} />

        <div className="px-6 pt-7 pb-5">
          <Link to="/" className="flex items-center gap-3.5 group" onClick={() => setIsSidebarOpen(false)}>
            <div className="w-10 h-10 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center p-1.5 group-hover:scale-105 transition-transform duration-300">
              <Logo className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-md-on-surface tracking-tight leading-none">{t('app_name')}</h1>
              <span className="text-[11px] font-medium text-md-on-surface-variant">
                {(window as any)._ENV_?.WORKSPACE_NAME || 'Botanical Workspace'}
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto no-scrollbar pb-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.Icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsSidebarOpen(false)}
                className={`m3-state-layer flex items-center gap-3.5 px-4 h-12 rounded-full text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-md-secondary-container text-md-on-secondary-container'
                    : 'text-md-on-surface-variant hover:text-md-on-surface'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}

          {showInstallBtn && (
            <div className="pt-4 px-1">
              <button
                onClick={handleInstallClick}
                className="m3-state-layer w-full flex items-center gap-3 p-4 rounded-2xl bg-md-tertiary-container text-md-on-tertiary-container shadow-sm transition-all text-left"
              >
                <Download className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight">{t('sys_install_app')}</p>
                  <p className="text-[11px] opacity-80 truncate">{t('sys_ready_standalone')}</p>
                </div>
              </button>
            </div>
          )}
        </nav>

        <div className="mt-auto">
          <QuotaBar />
          <div className="px-4 py-4 border-t border-md-outline-variant/30 space-y-3">
            <div className="flex items-center justify-between">
              <LanguageSelector direction="up" />
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <button
                  onClick={logout}
                  className="m3-state-layer w-10 h-10 flex items-center justify-center text-md-on-surface-variant hover:text-md-error rounded-full transition-colors"
                  title={t('menu_sign_out')}
                  aria-label={t('menu_sign_out')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
            {user && (
              <div className="flex items-center gap-3 px-2 py-1.5 rounded-2xl bg-md-surface-container">
                <div className="w-9 h-9 rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center text-sm font-bold uppercase shrink-0">
                  {(lv(user.name) || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-md-on-surface truncate">{lv(user.name) || 'Anonymous'}</p>
                  <p className="text-[11px] text-md-on-surface-variant truncate">{t('role_' + user.role.toLowerCase())}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* M3 Tablet Navigation Rail (Medium Window Size Class: md to lg) */}
      <aside className="hidden md:flex lg:hidden w-20 shrink-0 bg-md-surface-container-low border-r border-md-outline-variant/30 flex-col items-center py-5 justify-between z-30 no-print">
        <div className="flex flex-col items-center gap-5 w-full">
          <Link to="/" className="w-11 h-11 rounded-2xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center p-2 shadow-xs">
            <Logo className="w-full h-full" />
          </Link>
          <nav className="flex flex-col items-center gap-2 w-full px-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to;
              const Icon = item.Icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className="flex flex-col items-center justify-center gap-1 w-full py-1 text-center group"
                >
                  <div className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-md-secondary-container text-md-on-secondary-container'
                      : 'text-md-on-surface-variant group-hover:bg-md-surface-container-high'
                  }`}>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                  </div>
                  <span className={`text-[10px] truncate max-w-[68px] ${isActive ? 'font-semibold text-md-on-surface' : 'font-medium text-md-on-surface-variant'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ThemeToggle />
          <button
            onClick={logout}
            className="m3-state-layer w-10 h-10 flex items-center justify-center text-md-on-surface-variant hover:text-md-error rounded-full transition-colors"
            title={t('menu_sign_out')}
            aria-label={t('menu_sign_out')}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col relative h-full overflow-hidden bg-md-surface print:h-auto print:overflow-visible">
        {/* M3 Top App Bar with Pill Search */}
        <header className="h-[calc(4.5rem+env(safe-area-inset-top))] md:h-20 pt-[env(safe-area-inset-top)] bg-md-surface/95 backdrop-blur-md flex items-center justify-between px-4 md:px-8 shrink-0 z-30 no-print gap-3">
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="md:hidden m3-state-layer w-10 h-10 flex items-center justify-center text-md-on-surface-variant rounded-full shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 max-w-2xl h-12 pl-4 pr-1.5 bg-md-surface-container-high rounded-full flex items-center gap-3 focus-within:ring-2 focus-within:ring-md-primary/40 transition-all">
            <Search className="w-4 h-4 text-md-on-surface-variant shrink-0 pointer-events-none" />
            <input
              type="text"
              placeholder={t('search_placeholder') || "Search plants, inventory, tasks..."}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="flex-1 min-w-0 h-full bg-transparent text-md-on-surface placeholder:text-md-on-surface-variant/70 text-sm font-medium outline-none"
            />
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="m3-state-layer w-9 h-9 shrink-0 flex items-center justify-center text-md-on-surface-variant hover:text-md-primary rounded-full transition-colors"
              title="Scan plant barcode"
              aria-label="Scan plant barcode"
            >
              <ScanBarcode className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {can('create_plants') && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="m3-state-layer h-12 px-4 md:px-5 rounded-2xl bg-md-primary-container text-md-on-primary-container font-semibold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden md:inline">{t('btn_add_plant')}</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y no-scrollbar pb-24 lg:pb-8 print:pb-0 print:overflow-visible">
          <div className="max-w-7xl mx-auto pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
            {children}
          </div>
        </div>

        {/* M3 Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-md-surface-container border-t border-md-outline-variant/30 pb-[env(safe-area-inset-bottom)] z-30 no-print">
          <div className="flex items-center justify-around h-20 px-2">
            {mobilePrimaryItems.map((item) => {
              const isActive = location.pathname === item.to;
              const Icon = item.Icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-center"
                >
                  <div className={`w-16 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? 'bg-md-secondary-container text-md-on-secondary-container' : 'text-md-on-surface-variant'
                  }`}>
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                  </div>
                  <span className={`text-[11px] truncate max-w-[72px] ${isActive ? 'font-semibold text-md-on-surface' : 'font-medium text-md-on-surface-variant'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-center text-md-on-surface-variant"
            >
              <div className="w-16 h-8 rounded-full flex items-center justify-center">
                <Menu className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <span className="text-[11px] font-medium">More</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
};
