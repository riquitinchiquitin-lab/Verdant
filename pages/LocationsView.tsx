import React, { useState, useMemo } from 'react';
import { usePlants } from '../context/PlantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PlantDetailsModal } from '../components/PlantDetailsModal';
import { Plant } from '../types';
import { useDraggableScroll } from '../hooks/useDraggableScroll';

const LocationAccordion: React.FC<{ 
    name: string; 
    plants: Plant[]; 
    isCustom: boolean; 
    onDelete: (name: string) => void;
    onPlantClick: (plant: Plant) => void;
}> = ({ name, plants, isCustom, onDelete, onPlantClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { t, lv } = useLanguage();
    const accordionScroll = useDraggableScroll();

    const translatedRoomName = useMemo(() => {
        // Predefined rooms in constants use specific strings that we map to translation keys
        const slug = name.toLowerCase().replace(/[\/\s-]/g, '_');
        const key = `room_${slug}`;
        const translation = t(key);
        // If the translation returns the key (meaning it wasn't found), fallback to original name or formatted string
        return translation || name;
    }, [name, t]);

    return (
        <div className="m3-card-elevated border border-md-outline-variant/30 rounded-[24px] overflow-hidden transition-all duration-200">
            <div className="m3-state-layer p-4 md:p-5 flex items-center justify-between cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${isOpen ? 'bg-md-primary-container text-md-on-primary-container' : 'bg-md-surface-container-highest text-md-on-surface-variant'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <div>
                        <h3 className="font-bold text-md-on-surface flex items-center gap-2 text-sm md:text-base">
                            {translatedRoomName}
                            {!isCustom && <span className="text-[11px] bg-md-surface-container-highest text-md-on-surface-variant px-2 py-0.5 rounded-full font-medium">{t('predefined_location_tag')}</span>}
                        </h3>
                        <p className="text-xs font-medium text-md-on-surface-variant">{plants.length} {t('menu_my_plants')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isCustom && <button onClick={(e) => { e.stopPropagation(); onDelete(name); }} className="m3-state-layer w-9 h-9 flex items-center justify-center text-md-on-surface-variant hover:text-md-error rounded-full transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
                    <svg className={`w-5 h-5 text-md-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>
            {isOpen && (
                <div className="p-4 border-t border-md-outline-variant/30 bg-md-surface-container space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {plants.length > 0 ? (
                        <div {...accordionScroll.props} className={`flex gap-2.5 pb-1 ${accordionScroll.props.className}`}>
                            {plants.map(plant => (
                              <div key={plant.id} onClick={() => onPlantClick(plant)} className="w-52 flex-shrink-0 flex items-center gap-3 p-2.5 rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant/30 cursor-pointer hover:border-md-primary transition-colors shadow-xs">
                                <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-md-surface-container-highest">
                                  {plant.images && plant.images[0] ? (
                                    <img src={plant.images[0]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-md-on-surface-variant text-xs">?</div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-md-on-surface truncate leading-tight">{lv(plant.nickname)}</p>
                                  <p className="text-xs text-md-on-surface-variant truncate">{plant.species}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                    ) : <p className="text-center py-5 text-xs font-medium text-md-on-surface-variant">{t('empty_jungle')}</p>}
                </div>
            )}
        </div>
    );
};

export const LocationsView: React.FC = () => {
    const { plants, houses, allRooms, customRooms, addCustomRoom, removeCustomRoom } = usePlants();
    const { t, lv } = useLanguage();
    const { user } = useAuth();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
    const [selectedHouseFilter, setSelectedHouseFilter] = useState<string | 'ALL' | 'UNATTRIBUTED'>('ALL');
    const isRestricted = user?.role === 'SEASONAL' || user?.role === 'GARDENER';
    const isAdmin = user?.role === 'OWNER' || user?.role === 'CO_CEO';
    
    const handleAdd = () => { if (newRoomName.trim()) { addCustomRoom(newRoomName.trim()); setNewRoomName(''); setIsAddOpen(false); } };
    const handleDelete = (name: string) => {
        const hasPlants = plants.some(p => lv(p.room) === name);
        if (hasPlants) { alert(t('err_delete_location_plants')); return; }
        if (confirm(t('confirm_delete_location', { name }))) { removeCustomRoom(name); }
    };

    const roomsWithStats = useMemo(() => {
        const filteredPlants = plants.filter(p => {
            if (isAdmin) {
                if (selectedHouseFilter === 'ALL') return true;
                if (selectedHouseFilter === 'UNATTRIBUTED') return !p.houseId;
                return p.houseId === selectedHouseFilter;
            }
            if (user?.houseId) return p.houseId === user.houseId;
            return false;
        });

        return allRooms.map(room => ({ 
            name: room, 
            plants: filteredPlants.filter(p => lv(p.room) === room), 
            isCustom: customRooms.includes(room) 
        })).sort((a, b) => b.plants.length - a.plants.length || a.name.localeCompare(b.name));
    }, [allRooms, plants, customRooms, lv, user, isAdmin, selectedHouseFilter]);

    return (
        <div className="p-4 md:p-10 max-w-4xl mx-auto space-y-6 md:space-y-8 pb-32">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div><h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tighter uppercase leading-none">{t('stats_locations')}</h1><p className="text-gray-500 dark:text-slate-400 mt-1.5 md:mt-2 text-[10px] md:text-sm font-bold uppercase tracking-widest">{t('manage_desc')}</p></div>
                
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 w-full sm:w-auto">
                    {isAdmin && (
                        <select 
                            className="h-10 md:h-12 px-4 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all appearance-none min-w-[160px] w-full sm:w-auto"
                            value={selectedHouseFilter}
                            onChange={(e) => setSelectedHouseFilter(e.target.value as any)}
                        >
                            <option value="ALL">{t('labels_all_global_properties')}</option>
                            <option value="UNATTRIBUTED">{t('lbl_unattributed')}</option>
                            {houses.map(h => (
                                <option key={h.id} value={h.id}>{lv(h.name)}</option>
                            ))}
                        </select>
                    )}
                    {!isRestricted && (
                        <Button 
                            className="h-10 md:h-12 px-5 md:px-6 rounded-xl md:rounded-2xl shadow-xl shadow-verdant/20 font-black uppercase tracking-widest text-[10px] md:text-base w-full sm:w-auto" 
                            onClick={() => setIsAddOpen(true)}
                        >
                            {t('add_location')}
                        </Button>
                    )}
                </div>
            </div>
            <div className="space-y-4">
                {roomsWithStats.map(room => <LocationAccordion key={room.name} name={room.name} plants={room.plants} isCustom={room.isCustom} onDelete={handleDelete} onPlantClick={setSelectedPlant} />)}
            </div>
            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title={t('add_location')}>
                <div className="space-y-6">
                    <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{t('house_name_placeholder')}</label><input type="text" className="w-full h-14 px-6 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl outline-none font-bold dark:text-white focus:ring-4 focus:ring-verdant/10" placeholder={t('enter_custom_room')} value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} autoFocus /></div>
                    <div className="flex gap-3"><Button variant="ghost" className="flex-1 font-black uppercase tracking-widest text-xs" onClick={() => setIsAddOpen(false)}>{t('cancel')}</Button><Button className="flex-1 h-14 rounded-2xl" onClick={handleAdd} disabled={!newRoomName.trim()}>{t('deploy_property')}</Button></div>
                </div>
            </Modal>
            <PlantDetailsModal isOpen={!!selectedPlant} plant={selectedPlant} onClose={() => setSelectedPlant(null)} />
        </div>
    );
};
