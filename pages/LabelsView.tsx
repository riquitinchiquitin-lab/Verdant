import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Bluetooth, Download, FileSpreadsheet, Tag, Check } from 'lucide-react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { exportPlantsToNiimbotExcel } from '../services/exportService';
import {
  D110_LABEL_W_PX,
  D110_LABEL_H_PX,
  isNiimbotWebBluetoothSupported,
  printLabelsToNiimbotD110,
  renderD110LabelCanvas,
} from '../services/barcodeService';

export const LabelsView: React.FC = () => {
  const { plants, houses } = usePlants();
  const { t, lv } = useLanguage();
  const { user } = useAuth();

  const [selectedHouseId, setSelectedHouseId] = useState<string>(user?.houseId || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isGlobalUser = ['OWNER', 'CO_CEO'].includes(user?.role || '');
  const bleSupported = isNiimbotWebBluetoothSupported();

  const filteredPlants = useMemo(() => {
    return plants.filter(p => {
      const matchesHouse = isGlobalUser
        ? selectedHouseId === 'ALL'
          ? true
          : selectedHouseId === 'UNATTRIBUTED'
            ? !p.houseId
            : p.houseId === selectedHouseId
        : (Boolean(user?.houseId) && p.houseId === user?.houseId);
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        (lv(p.nickname) || '').toLowerCase().includes(q) ||
        (p.species || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q);
      return matchesHouse && matchesSearch;
    });
  }, [plants, selectedHouseId, searchQuery, lv, isGlobalUser, user?.houseId]);

  const allFilteredSelected =
    filteredPlants.length > 0 && filteredPlants.every(p => selectedIds.has(p.id));

  const previewPlant = useMemo(() => {
    const firstSelected = filteredPlants.find(p => selectedIds.has(p.id));
    return firstSelected || filteredPlants[0] || null;
  }, [filteredPlants, selectedIds]);

  useEffect(() => {
    if (previewPlant && previewCanvasRef.current) {
      renderD110LabelCanvas(previewPlant, lv(previewPlant.nickname), previewCanvasRef.current);
    }
  }, [previewPlant, lv]);

  const handleExport = () => {
    const plantsToExport = plants.filter(p => selectedIds.has(p.id));
    if (plantsToExport.length === 0) return;

    const fileName = `verdant_labels_${selectedHouseId.toLowerCase()}_${Date.now()}.xlsx`;
    exportPlantsToNiimbotExcel(plantsToExport, lv, fileName);
  };

  const handleDownloadPreviewPng = () => {
    if (!previewPlant || !previewCanvasRef.current) return;
    const url = previewCanvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `label_${previewPlant.id}_15x50mm.png`;
    link.href = url;
    link.click();
  };

  const handlePrintD110 = async () => {
    const plantsToPrint = plants.filter(p => selectedIds.has(p.id));
    if (plantsToPrint.length === 0 || isPrinting) return;

    setIsPrinting(true);
    setPrintError(null);
    setPrintStatus(`Connecting to Niimbot D110 (${plantsToPrint.length} label${plantsToPrint.length > 1 ? 's' : ''})...`);
    try {
      await printLabelsToNiimbotD110(plantsToPrint, lv, (info) => {
        if (info.page && info.total) {
          setPrintStatus(`Printing ${info.page} / ${info.total}...`);
        }
      });
      setPrintStatus(`Printed ${plantsToPrint.length} label${plantsToPrint.length > 1 ? 's' : ''} to Niimbot D110.`);
    } catch (err: any) {
      setPrintError(err?.message || 'Failed to print to Niimbot D110.');
      setPrintStatus(null);
    } finally {
      setIsPrinting(false);
    }
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlants.map(p => p.id)));
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-6 pb-32 transition-all">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-md-outline-variant/30 pb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-md-primary-container text-md-on-primary-container rounded-2xl flex items-center justify-center shadow-xs">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-md-on-surface tracking-tight leading-none">
              {t('menu_labels')}
            </h1>
            <p className="text-xs font-medium text-md-on-surface-variant mt-1">
              Niimbot D110 · 15 × 50 mm Code 128 Barcode (203 DPI)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          <Button
            variant="tonal"
            size="md"
            onClick={handleExport}
            disabled={selectedIds.size === 0}
            className="flex-1 sm:flex-none"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t('labels_export_selected', { count: selectedIds.size.toString() })}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handlePrintD110}
            disabled={selectedIds.size === 0 || isPrinting}
            isLoading={isPrinting}
            className="flex-1 sm:flex-none"
          >
            <Bluetooth className="w-4 h-4" />
            Print D110 ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Print Feedback */}
      {printStatus && (
        <div className="p-3.5 rounded-2xl bg-md-primary-container/40 border border-md-primary/30 text-xs font-semibold text-md-on-primary-container">
          {printStatus}
        </div>
      )}
      {printError && (
        <div className="p-3.5 rounded-2xl bg-md-error-container border border-md-error/30 text-xs font-semibold text-md-on-error-container">
          {printError}
        </div>
      )}

      {/* Live Option B Sticker Preview */}
      {previewPlant && (
        <div className="m3-card-elevated rounded-3xl p-4 md:p-6 border border-md-outline-variant/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-md-primary">
                Option B Preview · 15 × 50 mm
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-md-surface-container-high text-md-on-surface-variant">
                {D110_LABEL_W_PX} × {D110_LABEL_H_PX} px
              </span>
            </div>
            <p className="text-xs text-md-on-surface-variant">
              {bleSupported
                ? 'Ready for direct Web Bluetooth printing on Chrome/Edge (Android & Desktop).'
                : 'Web Bluetooth unavailable in this browser. Export Excel or PNG to print.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            <div className="bg-white p-2.5 rounded-2xl border border-md-outline-variant/50 shadow-xs overflow-x-auto max-w-full">
              <canvas
                ref={previewCanvasRef}
                width={D110_LABEL_W_PX}
                height={D110_LABEL_H_PX}
                className="block h-[72px] w-auto image-rendering-pixelated"
              />
            </div>
            <Button variant="outlined" size="sm" onClick={handleDownloadPreviewPng}>
              <Download className="w-4 h-4" />
              PNG
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {isGlobalUser && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
              {t('labels_property_filter')}
            </label>
            <select
              value={selectedHouseId}
              onChange={(e) => {
                setSelectedHouseId(e.target.value);
                setSelectedIds(new Set());
              }}
              className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30 transition-all"
            >
              <option value="ALL">{t('labels_all_global_properties')}</option>
              <option value="UNATTRIBUTED">{t('lbl_unattributed')}</option>
              {houses.map(h => (
                <option key={h.id} value={h.id}>{lv(h.name)}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">
            {t('labels_quick_filter')}
          </label>
          <input
            type="text"
            placeholder={t('labels_search_specimen')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 bg-md-surface-container-high border border-md-outline-variant/50 rounded-2xl px-4 text-sm font-medium text-md-on-surface outline-none focus:ring-2 focus:ring-md-primary/30 transition-all"
          />
        </div>
      </div>

      {/* Specimen Selection Table */}
      <div className="m3-card-elevated rounded-3xl border border-md-outline-variant/30 overflow-hidden">
        <div className="overflow-x-auto touch-pan-y no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-md-surface-container-high/60 border-b border-md-outline-variant/30">
                <th className="px-4 md:px-6 py-3.5 w-12">
                  <button
                    onClick={toggleSelectAll}
                    aria-label="Select all"
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      allFilteredSelected
                        ? 'bg-md-primary border-md-primary text-md-on-primary'
                        : 'bg-md-surface border-md-outline'
                    }`}
                  >
                    {allFilteredSelected && (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    )}
                  </button>
                </th>
                <th className="px-4 md:px-6 py-3.5 text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">
                  {t('labels_specimen')}
                </th>
                <th className="px-4 md:px-6 py-3.5 text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider hidden md:table-cell">
                  {t('labels_family')}
                </th>
                <th className="px-4 md:px-6 py-3.5 text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider hidden sm:table-cell">
                  Code 128 ID
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-md-outline-variant/20">
              {filteredPlants.map(p => {
                const isSelected = selectedIds.has(p.id);

                return (
                  <tr
                    key={p.id}
                    onClick={() => toggleSelection(p.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-md-primary-container/20'
                        : 'hover:bg-md-surface-container-low'
                    }`}
                  >
                    <td className="px-4 md:px-6 py-3.5">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-md-primary border-md-primary text-md-on-primary'
                            : 'bg-md-surface border-md-outline-variant'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3.5 max-w-0 w-full sm:w-auto sm:max-w-none">
                      <div className="flex items-center gap-3">
                        {p.images && p.images[0] ? (
                          <img
                            src={p.images[0]}
                            className="w-10 h-10 rounded-xl object-cover border border-md-outline-variant/30 shrink-0"
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center font-bold text-xs shrink-0">
                            {(lv(p.nickname) || '?')[0]}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-md-on-surface truncate">
                            {lv(p.nickname)}
                          </p>
                          <p className="text-xs italic text-md-on-surface-variant truncate">
                            {p.species}
                          </p>
                          <code className="sm:hidden inline-block mt-1 text-[11px] font-mono text-md-primary bg-md-primary-container/25 px-2 py-0.5 rounded-md border border-md-primary/20">
                            {p.id}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 md:px-6 py-3.5 hidden md:table-cell whitespace-nowrap">
                      <span className="text-xs font-medium text-md-on-surface-variant bg-md-surface-container-high px-2.5 py-1 rounded-full">
                        {p.family || '-'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-3.5 hidden sm:table-cell whitespace-nowrap">
                      <code className="text-xs font-mono text-md-primary bg-md-primary-container/25 px-2.5 py-1 rounded-lg border border-md-primary/20 select-all">
                        {p.id}
                      </code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filteredPlants.length === 0 && (
        <div className="py-16 text-center bg-md-surface-container-low rounded-3xl border border-dashed border-md-outline-variant/50 space-y-1.5">
          <p className="text-sm font-semibold text-md-on-surface-variant">{t('labels_no_specimens_found')}</p>
          <p className="text-xs text-md-on-surface-variant/80">{t('labels_adjust_filters')}</p>
        </div>
      )}
    </div>
  );
};