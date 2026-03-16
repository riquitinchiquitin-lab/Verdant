import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Plant, Log, Task, House } from '../types';
import { ROOM_TYPES, GEMINI_API_KEY } from '../constants';
import { fetchWithAuth } from '../services/api';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';
import { translateInput } from '../services/translationService';
import { sendNotification } from '../services/notifications';

interface PlantContextType {
  plants: Plant[];
  tasks: Task[];
  houses: House[];
  isLoading: boolean;
  isSynced: boolean;
  addPlant: (plant: Plant) => Promise<void>;
  updatePlant: (id: string, updates: Partial<Plant>) => Promise<void>;
  deletePlant: (id: string) => Promise<void>;
  cloneHouse: (sourceId: string, newName: string) => Promise<void>;
  addHouse: (name: string, googleApiKey?: string) => Promise<void>;
  updateHouse: (id: string, updates: Partial<House>) => Promise<void>;
  deleteHouse: (id: string) => Promise<void>;
  addLog: (plantId: string, log: Log) => Promise<void>;
  restoreDemoData: () => void;
  allRooms: string[];
  customRooms: string[];
  addCustomRoom: (name: string) => void;
  removeCustomRoom: (name: string) => void;
  addTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTaskCompletion: (id: string) => Promise<void>;
  refreshAllData: () => Promise<void>;
  getEffectiveApiKey: () => string;
  alertMessage: string | null;
  setAlertMessage: (message: string | null) => void;
  searchFilter: string;
  setSearchFilter: (filter: string) => void;
}

const PlantContext = createContext<PlantContextType | undefined>(undefined);

export const PlantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const { lv, t, language } = useLanguage();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSynced, setIsSynced] = useState(false);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const refreshAllData = useCallback(async () => {
    if (!token) return;
    try {
      const [plantRes, houseRes, taskRes] = await Promise.all([
        fetchWithAuth('/api/plants', token),
        fetchWithAuth('/api/houses', token),
        fetchWithAuth('/api/tasks', token)
      ]);

      if (plantRes.ok) {
        const remotePlants: Plant[] = await plantRes.json();
        if (Array.isArray(remotePlants)) {
          setPlants(prev => {
            const merged = [...prev];
            remotePlants.forEach(remote => {
              const localIdx = merged.findIndex(p => p.id === remote.id);
              if (localIdx === -1) {
                merged.push(remote);
              } else {
                const local = merged[localIdx];
                const localTime = Math.max(new Date(local.updatedAt || 0).getTime(), new Date(local.lastModified || 0).getTime());
                const remoteTime = Math.max(new Date(remote.updatedAt || 0).getTime(), new Date(remote.lastModified || 0).getTime());
                if (remoteTime > localTime) {
                  merged[localIdx] = remote;
                }
              }
            });
            return merged;
          });
        }
      }
      if (houseRes.ok) {
        const remoteHouses = await houseRes.json();
        if (Array.isArray(remoteHouses)) setHouses(remoteHouses);
      }
      if (taskRes.ok) {
        const remoteTasks = await taskRes.json();
        if (Array.isArray(remoteTasks)) setTasks(remoteTasks);
      }
      setIsSynced(true);
    } catch (e) { 
      console.warn("Sync Heartbeat Failed: Proxmox Node Offline."); 
      setIsSynced(false);
    }
  }, [token]);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const p = localStorage.getItem('verdant_plants_v8');
        const h = localStorage.getItem('verdant_houses_v8');
        const t = localStorage.getItem('verdant_tasks_v8');
        if (p) setPlants(JSON.parse(p));
        if (h) setHouses(JSON.parse(h));
        if (t) setTasks(JSON.parse(t));
      } finally { 
        setIsPersistenceReady(true); 
        setIsLoading(false); 
      }
    };
    hydrate();
  }, []);

  // Sync whenever token or refreshAllData changes
  useEffect(() => {
    if (token) {
        refreshAllData();
    }
  }, [token, refreshAllData]);

  // Sync heartbeat every 20 seconds
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(refreshAllData, 20000);
    return () => clearInterval(interval);
  }, [token, refreshAllData]);

  useEffect(() => {
    if (!isPersistenceReady) return;
    localStorage.setItem('verdant_plants_v8', JSON.stringify(plants));
    localStorage.setItem('verdant_houses_v8', JSON.stringify(houses));
    localStorage.setItem('verdant_tasks_v8', JSON.stringify(tasks));
  }, [plants, houses, tasks, isPersistenceReady]);

  // Automated Thirsty Plant Notifications
  useEffect(() => {
    if (!isPersistenceReady || plants.length === 0) return;
    
    const checkThirstyPlants = () => {
      const thirstyPlants = plants.filter(plant => {
        // Simple check: if lastWatered + interval < now
        if (!plant.lastWatered || !plant.wateringInterval) return false;
        const last = new Date(plant.lastWatered);
        const next = new Date(last.getTime() + plant.wateringInterval * 24 * 60 * 60 * 1000);
        return next < new Date();
      });

      if (thirstyPlants.length > 0) {
        const names = thirstyPlants.map(p => lv(p.nickname)).join(', ');
        sendNotification(t('app_name'), {
          body: thirstyPlants.length === 1 
            ? t('notification_thirsty_single', { name: names })
            : t('notification_thirsty_multiple', { count: thirstyPlants.length.toString() }),
          icon: '/logo.svg'
        });
      }
    };

    // Check once on load/sync
    const timeout = setTimeout(checkThirstyPlants, 5000);
    return () => clearTimeout(timeout);
  }, [plants, isPersistenceReady, lv, t]);

  const generateAutomatedTasks = async (plant: Plant) => {
    const newTasks: Task[] = [];
    const now = new Date();

    // 1. Rotation Task
    const lightAdvice = lv(plant.lightAdvice).toLowerCase();
    const hasRotationAdvice = lightAdvice.includes('rotate') || lightAdvice.includes('weekly');
    const rotationInterval = plant.rotationFrequency || (hasRotationAdvice ? 7 : null);

    if (rotationInterval) {
      newTasks.push({
        id: `t-rotate-${plant.id}-${Date.now()}`,
        plantIds: [plant.id],
        type: 'GENERAL',
        title: { en: `Rotate ${lv(plant.nickname)}`, fr: `Pivoter ${lv(plant.nickname)}` },
        description: { 
          en: `Rotate every ${rotationInterval} days for even growth.`, 
          fr: `Pivoter tous les ${rotationInterval} jours pour une croissance uniforme.` 
        },
        date: new Date(now.getTime() + rotationInterval * 24 * 60 * 60 * 1000).toISOString(),
        completed: false,
        recurrence: rotationInterval === 7 ? { type: 'WEEKLY', dayOfWeek: now.getDay() } : { type: 'DAILY' },
        houseId: plant.houseId
      });
    }

    // 2. Fertilizing Task (Monthly)
    const nutritionAdvice = lv(plant.nutritionAdvice).toLowerCase();
    if (nutritionAdvice.includes('fertilize') || nutritionAdvice.includes('month')) {
      newTasks.push({
        id: `t-fert-${plant.id}-${Date.now()}`,
        plantIds: [plant.id],
        type: 'FERTILIZE',
        title: { en: `Fertilize ${lv(plant.nickname)}`, fr: `Fertiliser ${lv(plant.nickname)}` },
        description: { en: lv(plant.nutritionAdvice), fr: lv(plant.nutritionAdvice) },
        date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false,
        recurrence: { type: 'MONTHLY', dayOfMonth: now.getDate() },
        houseId: plant.houseId
      });
    }

    // 3. Repotting Task
    if (plant.repottingFrequency && plant.lastPotSize) {
      newTasks.push({
        id: `t-repot-${plant.id}-${Date.now()}`,
        plantIds: [plant.id],
        type: 'REPOT',
        title: { en: `Repot ${lv(plant.nickname)}`, fr: `Rempoter ${lv(plant.nickname)}` },
        description: { 
          en: `Recommended pot size: ${parseInt(plant.lastPotSize) + 2}cm (Current: ${plant.lastPotSize}cm)`,
          fr: `Taille de pot recommandée: ${parseInt(plant.lastPotSize) + 2}cm (Actuel: ${plant.lastPotSize}cm)`
        },
        date: new Date(now.getTime() + (plant.repottingFrequency * 30 * 24 * 60 * 60 * 1000)).toISOString(),
        completed: false,
        recurrence: { type: 'NONE' },
        houseId: plant.houseId
      });
    }

    // 4. Watering Task
    if (plant.wateringInterval) {
      newTasks.push({
        id: `t-water-${plant.id}-${Date.now()}`,
        plantIds: [plant.id],
        type: 'WATER',
        title: { en: `Water ${lv(plant.nickname)}`, fr: `Arroser ${lv(plant.nickname)}` },
        description: { en: `Standard interval: ${plant.wateringInterval} days`, fr: `Intervalle standard: ${plant.wateringInterval} jours` },
        date: new Date(now.getTime() + (plant.wateringInterval * 24 * 60 * 60 * 1000)).toISOString(),
        completed: false,
        recurrence: { type: 'DAILY' }, // We use DAILY but it's actually interval-based, simplified for now
        houseId: plant.houseId
      });
    }

    if (newTasks.length > 0) {
      setTasks(prev => [...newTasks, ...prev]);
      if (token) {
        for (const task of newTasks) {
          await fetchWithAuth('/api/tasks', token, { method: 'POST', body: JSON.stringify(task) });
        }
      }
    }
  };

  const addPlant = async (plant: Plant) => {
    setPlants(p => [plant, ...p]);
    await generateAutomatedTasks(plant);
    if (token) await fetchWithAuth('/api/plants', token, { method: 'POST', body: JSON.stringify(plant) });
    setAlertMessage(t('log_alert_message').replace('{action}', t('menu_my_plants')).replace('{date}', new Date().toLocaleDateString()));
    setTimeout(() => setAlertMessage(null), 3000);
  };

  const updatePlant = async (id: string, updates: Partial<Plant>) => {
    const plant = plants.find(p => p.id === id);
    if (!plant) return;

    const updatedPlant = { ...plant, ...updates, lastModified: new Date().toISOString() };
    setPlants(prev => prev.map(p => p.id === id ? updatedPlant : p));
    
    // If key fields changed, regenerate tasks (simple approach: delete old auto-tasks and create new ones)
    const keyFields = ['repottingFrequency', 'lastPotSize', 'wateringInterval', 'lightAdvice', 'nutritionAdvice'];
    const hasKeyChanges = keyFields.some(f => updates[f as keyof Plant] !== undefined);
    
    if (hasKeyChanges) {
      // Remove existing automated tasks for this plant that are not completed
      setTasks(prev => prev.filter(t => !(t.plantIds.includes(id) && !t.completed && (t.id.startsWith('t-repot-') || t.id.startsWith('t-rotate-') || t.id.startsWith('t-fert-') || t.id.startsWith('t-water-')))));
      await generateAutomatedTasks(updatedPlant);
    }

    if (token) {
      try {
        await fetchWithAuth('/api/plants', token, { method: 'POST', body: JSON.stringify(updatedPlant) });
      } catch (e) {
        console.error("Failed to sync plant update:", e);
      }
    }
    setAlertMessage(t('log_alert_message').replace('{action}', t('menu_my_plants')).replace('{date}', new Date().toLocaleDateString()));
    setTimeout(() => setAlertMessage(null), 3000);
  };

  const deletePlant = async (id: string) => {
    setPlants(p => p.filter(x => x.id !== id));
    if (token) await fetchWithAuth(`/api/plants/${id}`, token, { method: 'DELETE' });
  };

  const addHouse = async (name: string, googleApiKey?: string) => {
    // 1. Localize the property name via AI
    const localizedName = await translateInput(name);
    
    // 2. Create the internal object
    const newH: House = { 
      id: `h-${Date.now()}`, 
      name: localizedName, 
      googleApiKey,
      createdAt: new Date().toISOString() 
    };
    
    // 3. Update local state for immediate UI feedback
    setHouses(prev => [...prev, newH]);
    
    // 4. Force synchronization with Proxmox node
    if (token) {
        try {
            const response = await fetchWithAuth('/api/houses', token, { 
                method: 'POST', 
                body: JSON.stringify(newH) 
            });
            if (!response.ok) throw new Error("Server rejected property creation protocol.");
            // Re-sync after successful POST to ensure ID consistency and linked data
            await refreshAllData();
        } catch (e) {
            console.error("House Creation Error:", e);
            // Rollback local state if server fails
            setHouses(prev => prev.filter(h => h.id !== newH.id));
            throw e;
        }
    }
  };

  const updateHouse = async (id: string, updates: Partial<House>) => {
      const house = houses.find(h => h.id === id);
      if (!house) return;
      
      const updatedHouse = { ...house, ...updates };
      setHouses(prev => prev.map(h => h.id === id ? updatedHouse : h));
      
      if (token) {
          fetchWithAuth('/api/houses', token, { method: 'POST', body: JSON.stringify(updatedHouse) });
      }
  };

  const deleteHouse = async (id: string) => {
    if (!token) throw new Error("Authentication token not found.");
    try {
      const response = await fetchWithAuth(`/api/houses/${id}`, token, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`Server-side deletion failed with status: ${response.status}`);
      }
      await refreshAllData();
    } catch (error) {
      console.error("Error during house deletion:", error);
      throw error;
    }
  };

  const addTask = async (task: Task) => {
    setTasks(prev => [task, ...prev]);
    if (token) await fetchWithAuth('/api/tasks', token, { method: 'POST', body: JSON.stringify(task) });
  };

  const deleteTask = async (id: string) => { 
    setTasks(p => p.filter(t => t.id !== id)); 
    if (token) await fetchWithAuth(`/api/tasks/${id}`, token, { method: 'DELETE' });
  };

  const toggleTaskCompletion = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    const isCompleting = !task.completed;
    const updatedTask = { 
        ...task, 
        completed: isCompleting, 
        completedAt: isCompleting ? new Date().toISOString() : undefined 
    };
    
    setTasks(prev => prev.map(t => t.id === id ? updatedTask : t));
    
    // If it's a watering task being completed, update the plant's lastWatered
    if (isCompleting && task.type === 'WATER' && task.plantIds.length > 0) {
      for (const plantId of task.plantIds) {
        await addLog(plantId, {
          id: `l-auto-${Date.now()}`,
          date: new Date().toISOString(),
          type: 'WATER',
          localizedNote: { en: 'Automated task completed', fr: 'Tâche automatisée terminée' }
        });
      }
    }

    if (token) {
        fetchWithAuth('/api/tasks', token, { method: 'POST', body: JSON.stringify(updatedTask) });
    }
  };

  const getEffectiveApiKey = useCallback(() => {
    if (!user) return GEMINI_API_KEY;
    
    // If user has a specific house assigned, use that house's key
    if (user.houseId) {
      const house = houses.find(h => h.id === user.houseId);
      if (house?.googleApiKey) return house.googleApiKey;
    }
    
    // Fallback to global key
    return GEMINI_API_KEY;
  }, [user, houses]);

  const addLog = async (plantId: string, log: Log) => {
    const plant = plants.find(p => p.id === plantId);
    if (!plant) return;
    
    let finalLog = { ...log };
    
    // Ensure 11 languages translation for every log entry
    const currentLangs = Object.keys(finalLog.localizedNote || {});
    if (currentLangs.length < 11) {
      let textToTranslate = '';
      if (finalLog.localizedNote) {
        textToTranslate = (finalLog.localizedNote as any)[language] || finalLog.localizedNote.en || Object.values(finalLog.localizedNote)[0] as string;
      } else {
        // Fallback to default note keys if no note provided
        const noteKey = log.type === 'NEW_LEAF' ? 'log_new_leaf' : ('log_' + log.type.toLowerCase() + '_manual');
        textToTranslate = t(noteKey as any);
      }

      if (textToTranslate) {
        try {
          finalLog.localizedNote = await translateInput(textToTranslate, language, getEffectiveApiKey());
        } catch (e) {
          console.warn("Auto-translation failed in addLog:", e);
          // Fallback to what we have or at least the source text
          if (!finalLog.localizedNote) {
            finalLog.localizedNote = { en: textToTranslate, [language]: textToTranslate };
          }
        }
      }
    }
    
    const updatedPlant = {
        ...plant,
        logs: [finalLog, ...(plant.logs || [])],
        lastWatered: finalLog.type === 'WATER' ? finalLog.date : plant.lastWatered,
        lastRotated: finalLog.type === 'ROTATED' ? finalLog.date : plant.lastRotated,
        lastModified: new Date().toISOString()
    };

    setPlants(prev => prev.map(p => p.id === plantId ? updatedPlant : p));

    if (token) {
      try {
        await fetchWithAuth('/api/plants', token, { method: 'POST', body: JSON.stringify(updatedPlant) });
      } catch (e) {
        console.error("Failed to sync log addition:", e);
      }
    }
  };

  const cloneHouse = async (s: string, n: string) => {}; 
  const addCustomRoom = (name: string) => { setCustomRooms(prev => [...new Set([...prev, name])]); };
  const removeCustomRoom = (name: string) => { setCustomRooms(prev => prev.filter(r => r !== name)); };
  const restoreDemoData = () => {};
  const allRooms = [...ROOM_TYPES, ...customRooms];

  return (
    <PlantContext.Provider value={{ 
        plants, tasks, houses, isLoading, isSynced, addPlant, updatePlant, deletePlant, 
        addLog, restoreDemoData, allRooms, addHouse, updateHouse, deleteHouse, cloneHouse,
        customRooms, addCustomRoom, removeCustomRoom, addTask, deleteTask, toggleTaskCompletion,
        refreshAllData, getEffectiveApiKey,
        alertMessage,
        setAlertMessage,
        searchFilter,
        setSearchFilter
    }}>
      {children}
    </PlantContext.Provider>
  );
};

export const usePlants = () => {
  const context = useContext(PlantContext);
  if (!context) throw new Error('usePlants must be used within a PlantProvider');
  return context;
};
