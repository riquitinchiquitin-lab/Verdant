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

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, taskToEdit }) => {
  const { t, lv } = useLanguage();
  const { plants } = usePlants();
  const { user } = useAuth();
  const { inventory } = useInventory();
  
  const [title, setTitle] = useState(taskToEdit ? lv(taskToEdit.title) : '');
  const [date, setDate] = useState(taskToEdit ? new Date(taskToEdit.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
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
      date: new Date(date).toISOString(),
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
        const titleObj = await translateInput(title);
        const descObj = description ? await translateInput(description) : undefined;

        const taskData: Task = {
          id: taskToEdit?.id || `t-${generateUUID()}`,
          title: titleObj,
          description: descObj,
          type,
          date: new Date(date).toISOString(),
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
      setDate(new Date().toISOString().split('T')[0]);
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
      <div className="space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar py-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('task_title_placeholder')}</label>
            <input 
              type="text" 
              className="w-full h-14 px-5 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Feeding Protocol"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('category')}</label>
            <select
              className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold appearance-none"
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

        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('lbl_desc')}</label>
          <textarea 
            className="w-full p-5 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-medium min-h-[100px] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('usage_desc')}
          />
        </div>

        {recommendations.length > 0 && (
          <div className="space-y-3">
            <label className="text-[10px] font-black text-verdant uppercase tracking-widest px-1">{t('lbl_recommendations')}</label>
            <div className="flex flex-col gap-2">
              {recommendations.map(rec => (
                <div key={rec.item.id} className="flex items-center gap-3 p-3 bg-verdant/5 dark:bg-verdant/10 border border-verdant/20 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-white dark:bg-slate-800 border border-verdant/10">
                    {rec.item.images?.[0] && <img src={rec.item.images[0]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">{lv(rec.item.name)}</p>
                    <p className="text-[9px] text-verdant font-bold uppercase tracking-widest leading-none mt-0.5">{rec.reason}</p>
                    {rec.item.category === 'custom-mix' && rec.item.ingredients && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rec.item.ingredients.map((ing, i) => (
                          <span key={i} className="text-[8px] bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-verdant/10 text-gray-500 dark:text-slate-400 font-bold">
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
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('task_date')}</label>
            <input 
              type="date" 
              className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('task_recurrence')}</label>
            <select
              className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold appearance-none"
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
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('hour')}</label>
              <input type="number" min="0" max="23" value={recurrence.hour || ''} onChange={(e) => setRecurrence(prev => ({ ...prev, hour: parseInt(e.target.value) }))} className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('minute')}</label>
              <input type="number" min="0" max="59" value={recurrence.minute || ''} onChange={(e) => setRecurrence(prev => ({ ...prev, minute: parseInt(e.target.value) }))} className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" />
            </div>
          </div>
        )}

        {recurrence.type === 'WEEKLY' && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('day_of_week')}</label>
            <select value={recurrence.dayOfWeek || ''} onChange={(e) => setRecurrence(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))} className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold appearance-none">
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
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{t('day_of_month')}</label>
            <input type="number" min="1" max="31" value={recurrence.dayOfMonth || ''} onChange={(e) => setRecurrence(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value) }))} className="w-full h-14 px-4 border border-gray-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-verdant/10 bg-white dark:bg-slate-800 dark:text-white font-bold" />
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('associated_plants')}</label>
            {visiblePlants.length > 0 && (
                <button onClick={toggleSelectAll} className="text-[9px] text-verdant font-black uppercase tracking-widest hover:underline">
                    {isAllSelected ? t('deselect_all') : t('select_all')}
                </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-slate-800 rounded-3xl p-3 bg-gray-50/50 dark:bg-slate-900/50 space-y-1">
            {visiblePlants.length === 0 ? (
                <div className="py-8 text-center">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest italic">{t('no_plants_title')}</p>
                </div>
            ) : (
                visiblePlants.map(plant => (
                    <div 
                        key={plant.id} 
                        onClick={() => togglePlantSelection(plant.id)}
                        className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${selectedPlantIds.includes(plant.id) ? 'bg-verdant/10 dark:bg-verdant/20 border-verdant/20' : 'hover:bg-white dark:hover:bg-slate-800 border-transparent'} border`}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-gray-200 border border-white dark:border-slate-800 shadow-sm">
                                {plant.images?.[0] && <img src={plant.images[0]} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-black text-gray-800 dark:text-slate-200 uppercase tracking-tight truncate">{lv(plant.nickname)}</p>
                                <p className="text-[9px] text-gray-400 font-sans font-normal normal-case truncate">{plant.species}</p>
                            </div>
                        </div>
                        <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${selectedPlantIds.includes(plant.id) ? 'bg-verdant border-verdant text-white' : 'border-gray-200 dark:border-slate-700'}`}>
                            {selectedPlantIds.includes(plant.id) && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M5 13l4 4L19 7" /></svg>}
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-6">
          <Button variant="ghost" onClick={handleClose} disabled={isSaving} className="flex-1 rounded-2xl font-black uppercase tracking-widest text-[10px]">{t('cancel')}</Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving} isLoading={isSaving} className="flex-[2] h-14 rounded-2xl shadow-xl shadow-verdant/20 font-black uppercase tracking-widest">{t('save')}</Button>
        </div>
      </div>
    </Modal>
  );
};