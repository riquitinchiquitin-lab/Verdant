import React, { useState, useMemo } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { useAuth } from '../context/AuthContext';
import { translateInput } from '../services/translationService';
import { generateUUID } from '../services/crypto';
import { RecurrenceSettings, RecurrenceType, Task, InventoryItem } from '../types';
import { getRecommendationsForTask, Recommendation } from '../services/recommendationService';
import { useInventory } from '../context/InventoryContext';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  taskToEdit?: Task;
}

const toLocalDateInput = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, taskToEdit }) => {
  const { t, lv, language } = useLanguage();
  const { plants, getEffectiveApiKey } = usePlants();
  const { user } = useAuth();
  const { inventory } = useInventory();
  
  const [title, setTitle] = useState(taskToEdit ? lv(taskToEdit.title) : '');
  const [date, setDate] = useState(taskToEdit ? toLocalDateInput(new Date(taskToEdit.date)) : toLocalDateInput());
  const [recurrence, setRecurrence] = useState<RecurrenceSettings>(taskToEdit?.recurrence || { type: 'NONE' });
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>(taskToEdit?.plantIds || []);
  const [type, setType] = useState<Task['type']>(taskToEdit?.type || 'GENERAL');
  const [description, setDescription] = useState(taskToEdit ? lv(taskToEdit.description as any) : '');
  const [isSaving, setIsSaving] = useState(false);

  // Recommendations based on current state
  const recommendations = useMemo(() => {
    const tempTask: Task = {
      id: taskToEdit?.id || 'temp',
      title: { en: title },
      description: { en: description },
      type,
      date: new Date(`${date}T12:00:00`).toISOString(),
      plantIds: selectedPlantIds,
      completed: false
    };
    return getRecommendationsForTask(tempTask, inventory, plants);
  }, [title, description, type, date, selectedPlantIds, inventory, plants, taskToEdit?.id]);

  // Only show plants relevant to the user's house
  const visiblePlants = useMemo(() => {
    if (!user?.houseId) return plants;
    return plants.filter(p => p.houseId === user.houseId);
  }, [plants, user?.houseId]);

  const handleSave = async () => {
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    try {
        const apiKey = getEffectiveApiKey();
        const titleObj = await translateInput(title, language, apiKey);
        const descObj = description ? await translateInput(description, language, apiKey) : undefined;

        const taskData: Task = {
          id: taskToEdit?.id || `t-${generateUUID()}`,
          title: titleObj,
          description: descObj,
          type,
          date: new Date(`${date}T12:00:00`).toISOString(),
          recurrence,
          plantIds: selectedPlantIds,
          completed: taskToEdit?.completed || false,
          houseId: taskToEdit?.houseId || user?.houseId
        };

        onSave(taskData);
        handleClose();
    } catch (e) {
        console.error("Task Protocol Failure:", e);
    } finally {
        setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!taskToEdit) {
      setTitle('');
      setDate(toLocalDateInput());
      setRecurrence({ type: 'NONE' });
      setSelectedPlantIds([]);
      setType('GENERAL');
      setDescription('');
    }
    setIsSaving(false);
    onClose();
  };

  const togglePlantSelection = (id: string) => {
    setSelectedPlantIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
      if (selectedPlantIds.length > 0 && selectedPlantIds.length === visiblePlants.length) {
          setSelectedPlantIds([]);
      } else {
          setSelectedPlantIds(visiblePlants.map(p => p.id));
      }
  };

  const isAllSelected = visiblePlants.length > 0 && selectedPlantIds.length === visiblePlants.length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={taskToEdit ? t('edit_task') : t('add_task')}>
      <div className="space-y-5 max-h-[75vh] overflow-y-auto no-scrollbar py-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('task_title_placeholder')}</label>
            <input
              type="text"
              className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Feeding Protocol"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('category')}</label>
            <select
              className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium appearance-none transition-all"
              value={type}
              onChange={(e) => setType(e.target.value as Task['type'])}
            >
              <option value="GENERAL">{t('cat_custom_mix')}</option>
              <option value="WATER">{t('water')}</option>
              <option value="FERTILIZE">{t('cat_fertiliser')}</option>
              <option value="REPOT">{t('repot')}</option>
              <option value="PRUNE">{t('prune')}</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('lbl_desc')}</label>
          <textarea
            className="w-full p-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface text-sm min-h-[100px] resize-none transition-all"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('usage_desc')}
          />
        </div>

        {recommendations.length > 0 && (
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-md-primary uppercase tracking-wider px-1">{t('lbl_recommendations')}</label>
            <div className="flex flex-col gap-2">
              {recommendations.map(rec => (
                <div key={rec.item.id} className="flex items-center gap-3 p-3 bg-md-primary-container/25 border border-md-primary/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-md-surface-container-lowest border border-md-outline-variant/30">
                    {rec.item.images?.[0] && <img src={rec.item.images[0]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-md-on-surface truncate">{lv(rec.item.name)}</p>
                    <p className="text-[11px] text-md-primary font-medium leading-tight mt-0.5">{rec.reason}</p>
                    {rec.item.category === 'custom-mix' && rec.item.ingredients && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rec.item.ingredients.map((ing, i) => (
                          <span key={i} className="text-[11px] bg-md-surface-container-lowest px-2 py-0.5 rounded-md border border-md-outline-variant/30 text-md-on-surface-variant font-medium">
                            {ing.quantity}{ing.unit} {lv(ing.name as any)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('task_date')}</label>
            <input
              type="date"
              className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('task_recurrence')}</label>
            <select
              className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium appearance-none transition-all"
              value={recurrence.type}
              onChange={(e) => setRecurrence({ type: e.target.value as RecurrenceType, hour: 0, minute: 0, dayOfWeek: 0, dayOfMonth: 1 })}
            >
              <option value="NONE">{t('recurrence_none')}</option>
              <option value="DAILY">{t('recurrence_daily')}</option>
              <option value="WEEKLY">{t('recurrence_weekly')}</option>
              <option value="MONTHLY">{t('recurrence_monthly')}</option>
            </select>
          </div>
        </div>

        {recurrence.type === 'DAILY' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('hour')}</label>
              <input type="number" min="0" max="23" value={recurrence.hour ?? ''} onChange={(e) => { const v = parseInt(e.target.value, 10); setRecurrence(prev => ({ ...prev, hour: Number.isNaN(v) ? undefined : v })); }} className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('minute')}</label>
              <input type="number" min="0" max="59" value={recurrence.minute ?? ''} onChange={(e) => { const v = parseInt(e.target.value, 10); setRecurrence(prev => ({ ...prev, minute: Number.isNaN(v) ? undefined : v })); }} className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" />
            </div>
          </div>
        )}

        {recurrence.type === 'WEEKLY' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('day_of_week')}</label>
            <select value={recurrence.dayOfWeek ?? ''} onChange={(e) => { const v = parseInt(e.target.value, 10); setRecurrence(prev => ({ ...prev, dayOfWeek: Number.isNaN(v) ? undefined : v })); }} className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium appearance-none transition-all">
              <option value="0">{t('sunday')}</option>
              <option value="1">{t('monday')}</option>
              <option value="2">{t('tuesday')}</option>
              <option value="3">{t('wednesday')}</option>
              <option value="4">{t('thursday')}</option>
              <option value="5">{t('friday')}</option>
              <option value="6">{t('saturday')}</option>
            </select>
          </div>
        )}

        {recurrence.type === 'MONTHLY' && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider px-1">{t('day_of_month')}</label>
            <input type="number" min="1" max="31" value={recurrence.dayOfMonth ?? ''} onChange={(e) => { const v = parseInt(e.target.value, 10); setRecurrence(prev => ({ ...prev, dayOfMonth: Number.isNaN(v) ? undefined : v })); }} className="w-full h-12 px-4 border border-md-outline-variant/50 rounded-2xl outline-none focus:ring-2 focus:ring-md-primary/30 focus:border-md-primary bg-md-surface-container-high text-md-on-surface font-medium transition-all" />
          </div>
        )}

        <div className="space-y-2.5 pt-2">
          <div className="flex justify-between items-center px-1">
            <label className="text-xs font-semibold text-md-on-surface-variant uppercase tracking-wider">{t('associated_plants')}</label>
            {visiblePlants.length > 0 && (
                <button type="button" onClick={toggleSelectAll} className="text-xs text-md-primary font-semibold hover:underline">
                    {isAllSelected ? t('deselect_all') : t('select_all')}
                </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto custom-scrollbar border border-md-outline-variant/30 rounded-3xl p-3 bg-md-surface-container-low space-y-1">
            {visiblePlants.length === 0 ? (
                <div className="py-8 text-center">
                    <p className="text-xs text-md-on-surface-variant font-medium">{t('no_plants_title')}</p>
                </div>
            ) : (
                visiblePlants.map(plant => (
                    <div
                        key={plant.id}
                        onClick={() => togglePlantSelection(plant.id)}
                        className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border ${selectedPlantIds.includes(plant.id) ? 'bg-md-primary-container/30 border-md-primary/30' : 'hover:bg-md-surface-container border-transparent'}`}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-md-surface-container-high border border-md-outline-variant/30 flex items-center justify-center">
                                {plant.images?.[0] ? (
                                    <img src={plant.images[0]} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-xs font-bold text-md-on-surface-variant">{(lv(plant.nickname) || '?')[0]}</span>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-md-on-surface truncate">{lv(plant.nickname)}</p>
                                <p className="text-[11px] text-md-on-surface-variant truncate">{plant.species}</p>
                            </div>
                        </div>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedPlantIds.includes(plant.id) ? 'bg-md-primary border-md-primary text-md-on-primary' : 'border-md-outline-variant'}`}>
                            {selectedPlantIds.includes(plant.id) && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path d="M5 13l4 4L19 7" /></svg>}
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" onClick={handleClose} disabled={isSaving} className="flex-1 h-12 rounded-2xl">{t('cancel')}</Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving} isLoading={isSaving} className="flex-[2] h-12 rounded-2xl">{t('save')}</Button>
        </div>
      </div>
    </Modal>
  );
};