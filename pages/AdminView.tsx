import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePlants } from '../context/PlantContext';
import { usePersonnel } from '../context/PersonnelContext';
import { useSystem, SystemLog } from '../context/SystemContext';
import { useInventory } from '../context/InventoryContext';
import { House, User, Plant } from '../types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { SystemTelemetry } from '../components/SystemTelemetry';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { fetchWithAuth } from '../services/api'; // Mandatory import for handshake
import { generateSecure50CharKey } from '../services/security';
import { generateUUID } from '../services/crypto';
import { useDraggableScroll } from '../hooks/useDraggableScroll';

export const AdminView: React.FC = () => {
  const { user, token } = useAuth();
  const { t, lv, language } = useLanguage();
  const { showNotification, fetchSystemLogs } = useSystem();
  const { houses, plants, updateHouse, deleteHouse, addHouse, updatePlant, deleteAllLogs, deleteLogsByDay } = usePlants();
  const { users, addUser, updateUser, deleteUser, removeUserPermanently } = usePersonnel();
  const [activeTab, setActiveTab] = useState<'HOUSES' | 'PERSONNEL' | 'PLANTS' | 'DATABASE' | 'SECURITY' | 'LOGS'>('HOUSES');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectedLogDate, setSelectedLogDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isExportingLogs, setIsExportingLogs] = useState(false);
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);
  const [movingPlantId, setMovingPlantId] = useState<string | null>(null);
  const [targetHouseId, setTargetHouseId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabsScroll = useDraggableScroll();
  const plantsScroll = useDraggableScroll();
  const personnelScroll = useDraggableScroll();

  // Modal States
  const [editingHouse, setEditingHouse] = useState<House | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isAddingHouse, setIsAddingHouse] = useState(false);
  const [isBackupKeyModalOpen, setIsBackupKeyModalOpen] = useState(false);
  const [backupKeyInput, setBackupKeyInput] = useState('');
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [isSavingHouse, setIsSavingHouse] = useState(false);
  const [newHouseName, setNewHouseName] = useState('');
  const [newUser, setNewUser] = useState<Partial<User>>({ role: 'GARDENER' });
  const [hasMasterKey, setHasMasterKey] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    console.log("[Verdant] AdminView Protocol v1.0.1 Loaded");
    setHasMasterKey(!!localStorage.getItem('verdant_master_key'));
  }, []);

  useEffect(() => {
    if (activeTab === 'LOGS') {
      loadLogs();
    }
  }, [activeTab]);

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await fetchSystemLogs();
      setLogs(data);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const isOwner = user?.role === 'OWNER';
  const isDirector = user?.role === 'CO_CEO';
  const isLeadHand = user?.role === 'LEAD_HAND';

  const visibleHouses = useMemo(() => {
    if (isOwner || isDirector) return houses;
    if (isLeadHand) return houses.filter(h => h.id === user?.houseId);
    return [];
  }, [houses, isOwner, isDirector, isLeadHand, user]);

  const visiblePersonnel = useMemo(() => {
    if (isOwner || isDirector) return users;
    if (isLeadHand) return users.filter(u => u.houseId === user?.houseId && (u.role === 'GARDENER' || u.role === 'SEASONAL'));
    return users.filter(u => u.id === user?.id);
  }, [users, isOwner, isDirector, isLeadHand, user]);

  const availableTabs = useMemo(() => {
    const tabs: ('HOUSES' | 'PERSONNEL' | 'PLANTS' | 'DATABASE' | 'SECURITY' | 'LOGS')[] = ['HOUSES', 'PERSONNEL'];
    if (isOwner || isDirector) {
      tabs.splice(2, 0, 'PLANTS');
      tabs.push('DATABASE', 'SECURITY', 'LOGS');
    }
    return tabs;
  }, [isOwner, isDirector]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs, activeTab]);

  const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.enc')) {
      setPendingBackupFile(file);
      setBackupKeyInput('');
      setIsBackupKeyModalOpen(true);
    } else {
      processRestore(file, null);
    }
  };

  const handleBackupKeySubmit = () => {
    if (!pendingBackupFile) return;
    if (!backupKeyInput) return showNotification(t('msg_enter_backup_key'), "ERROR");
    processRestore(pendingBackupFile, backupKeyInput);
    setIsBackupKeyModalOpen(false);
    setPendingBackupFile(null);
  };

  const processRestore = async (file: File, backupKey: string | null) => {
    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawContent = event.target?.result as string;
        let payload: any;
        if (backupKey) {
            payload = { data: rawContent, backupKey };
        } else {
          try {
            const content = JSON.parse(rawContent);
            // Handle both {data: ...} and direct data
            payload = { data: content.data || content };
          } catch (e) {
            console.error("[ADMIN] Invalid JSON file:", e);
            setIsRestoring(false);
            return showNotification(t('msg_invalid_json_format'), "ERROR");
          }
        }

        console.log("[ADMIN] Restore Payload Prepared. Size:", rawContent.length);
        const token = localStorage.getItem('verdant_token') || '';
        const response = await fetchWithAuth('/api/system/restore', token, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("[ADMIN] Restore failed:", response.status, errorData);
            if (errorData.error === 'INVALID_BACKUP_KEY') {
                showNotification(t('msg_invalid_key'), "ERROR");
                return;
            }
            if (errorData.error === 'DECRYPTION_PROTOCOL_FAULT') {
                showNotification(t('msg_decryption_protocol_fault'), "ERROR");
                return;
            }
            showNotification(t('msg_restore_failed', { error: errorData.details || errorData.error || response.statusText }), "ERROR");
            return;
        }

        console.log("[ADMIN] Restore successful");
        showNotification(t('msg_restore_success'), "SUCCESS");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) { 
        console.error("[ADMIN] Protocol Fault during restore:", err);
        showNotification(t('msg_protocol_fault'), "ERROR"); 
      } 
      finally { setIsRestoring(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };
    reader.readAsText(file);
  };

  const handleDownloadBackup = async () => {
    console.log("[ADMIN] Initiating backup download...");
    setIsBackingUp(true);
    try {
      const token = localStorage.getItem('verdant_token') || '';
      
      // Use a controller to implement a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetchWithAuth('/api/system/backup', token, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[ADMIN] Backup request failed with status:", response.status, "Error Data:", errorData);
        throw new Error(`BACKUP_FAILED: ${response.status} ${JSON.stringify(errorData)}`);
      }
      
      console.log("[ADMIN] Backup data received, creating blob...");
      
      let blob: Blob;
      let fileName: string;

      if (response.vault) {
        // If the response contains a vault property, it's encrypted
        // We save ONLY the ciphertext string to the .enc file
        blob = new Blob([response.vault], { type: 'application/octet-stream' });
        fileName = `verdant_backup_${new Date().toISOString().split('T')[0]}.enc`;
      } else {
        // Otherwise, it's a standard JSON response
        // We need to call .json() to get the data, but fetchWithAuth might have already consumed it
        // if it was encrypted (but in this branch it wasn't).
        const data = await response.json();
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        fileName = `verdant_backup_${new Date().toISOString().split('T')[0]}.json`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("[ADMIN] Backup download triggered successfully");
      showNotification(t('msg_backup_downloaded'), "SUCCESS");
    } catch (err: any) {
      console.error("[ADMIN] Backup error:", err);
      if (err.name === 'AbortError') {
        showNotification(t('msg_backup_timeout'), "ERROR");
      } else {
        showNotification(t('msg_backup_failed'), "ERROR");
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.name) return showNotification(t('msg_missing_data'), "ERROR");
    
    // Restriction: Lead Hand can only add Gardeners or Seasonal
    if (isLeadHand && !['GARDENER', 'SEASONAL'].includes(newUser.role || '')) {
      return showNotification(t('msg_unauthorized_role'), "ERROR");
    }

    try {
      await addUser({
        id: `u-${generateUUID()}`,
        email: newUser.email.trim().toLowerCase(),
        name: newUser.name,
        role: newUser.role as any,
        houseId: newUser.houseId || null,
        caretakerStart: newUser.caretakerStart,
        caretakerEnd: newUser.caretakerEnd
      } as User);
      setIsAddingUser(false);
      setNewUser({ role: 'GARDENER' });
      showNotification(t('msg_personnel_added'), "SUCCESS");
    } catch (e) {
      showNotification(t('msg_creation_failed'), "ERROR");
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    try {
      const userToUpdate = { ...editingUser, email: editingUser.email?.trim().toLowerCase() };
      await updateUser(editingUser.id, userToUpdate);
      setEditingUser(null);
      showNotification(t('msg_authority_updated'), "SUCCESS");
    } catch (e) {
      showNotification(t('msg_update_failed'), "ERROR");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;

    setConfirmation({
      isOpen: true,
      title: t('lbl_delete_personnel'),
      message: t('msg_confirm_delete_personnel', { name: typeof target.name === 'object' ? lv(target.name as any) : target.name || target.email }),
      onConfirm: async () => {
        try {
          await removeUserPermanently(userId);
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          showNotification(t('msg_personnel_deleted'), "SUCCESS");
        } catch (e) {
          showNotification(t('msg_deletion_failed'), "ERROR");
        }
      }
    });
  };

  const handleUpdateHouse = async () => {
    if (!editingHouse) return;
    try {
      await updateHouse(editingHouse.id, editingHouse);
      setEditingHouse(null);
      showNotification(t('msg_house_updated'), "SUCCESS");
    } catch (e) {
      showNotification(t('msg_update_failed'), "ERROR");
    }
  };

  const handleAddHouse = async () => {
    console.log("[AdminView] handleAddHouse triggered with name:", newHouseName);
    if (!newHouseName) return showNotification(t('msg_missing_name'), "ERROR");
    setIsSavingHouse(true);
    try {
      console.log("[AdminView] Calling addHouse context function...");
      await addHouse(newHouseName);
      console.log("[AdminView] addHouse successful.");
      setIsAddingHouse(false);
      setNewHouseName('');
      showNotification(t('msg_house_established'), "SUCCESS");
    } catch (e) {
      console.error("[AdminView] handleAddHouse Error:", e);
      showNotification(t('msg_establishment_failed'), "ERROR");
    } finally {
      setIsSavingHouse(false);
    }
  };

  const handleMovePlant = async () => {
    if (!movingPlantId) return;
    setIsMoving(true);
    try {
      await updatePlant(movingPlantId, { houseId: targetHouseId || null });
      showNotification(t('msg_plant_moved'), "SUCCESS");
      setMovingPlantId(null);
      setTargetHouseId('');
    } catch (e) {
      showNotification(t('msg_move_failed'), "ERROR");
    } finally {
      setIsMoving(false);
    }
  };

  const handleDeleteHouse = (id: string) => {
    setConfirmation({
      isOpen: true,
      title: t('decommission_protocol'),
      message: t('confirm_delete_location').replace('{name}', ''),
      onConfirm: async () => {
        try {
          await deleteHouse(id);
          showNotification(t('msg_house_decommissioned'), "SUCCESS");
        } catch (e) {
          showNotification(t('msg_deletion_failed'), "ERROR");
        }
        setConfirmation(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleExportCareLogs = async () => {
    const { exportCombinedLogsToExcel } = await import('../services/exportService');
    setIsExportingLogs(true);
    try {
      await exportCombinedLogsToExcel(combinedLogs);
      showNotification(t('msg_backup_downloaded'), 'SUCCESS');
    } catch (error) {
      showNotification(t('msg_backup_failed'), 'ERROR');
    } finally {
      setIsExportingLogs(false);
    }
  };

  const handleDeleteAllCareLogs = () => {
    setConfirmation({
      isOpen: true,
      title: t('admin_database'),
      message: t('confirm_delete_all_logs'),
      onConfirm: async () => {
        setIsDeletingLogs(true);
        try {
          await deleteAllLogs();
          showNotification(t('msg_logs_deleted'), 'SUCCESS');
        } catch (error) {
          showNotification(t('msg_deletion_failed'), 'ERROR');
        } finally {
          setIsDeletingLogs(false);
          setConfirmation(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteDayCareLogs = () => {
    setConfirmation({
      isOpen: true,
      title: t('admin_database'),
      message: t('confirm_delete_day_logs').replace('{date}', selectedLogDate),
      onConfirm: async () => {
        setIsDeletingLogs(true);
        try {
          await deleteLogsByDay(selectedLogDate);
          showNotification(t('msg_logs_deleted'), 'SUCCESS');
        } catch (error) {
          showNotification(t('msg_deletion_failed'), 'ERROR');
        } finally {
          setIsDeletingLogs(false);
          setConfirmation(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const combinedLogs = useMemo(() => {
    const systemLogsMapped = logs.map(l => ({
      id: l.id,
      timestamp: l.created_at,
      category: 'SYSTEM',
      event: l.event,
      details: l.details,
      level: l.level
    }));

    const careLogsMapped: any[] = [];
    plants.forEach(plant => {
      (plant.logs || []).forEach((log, idx) => {
        careLogsMapped.push({
          id: `care-${plant.id}-${idx}`,
          timestamp: log.date,
          category: 'CARE',
          event: lv(plant.nickname),
          details: `${log.type}${log.value ? `: ${log.value}` : ''}${log.localizedNote ? ` - ${lv(log.localizedNote)}` : (log.note ? ` - ${log.note}` : '')}`,
          level: 'INFO'
        });
      });
    });

    const all = [...systemLogsMapped, ...careLogsMapped];
    
    const filtered = all.filter(log => {
        const logDate = new Date(log.timestamp).toISOString().split('T')[0];
        return logDate === selectedLogDate;
    });

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [logs, plants, lv, selectedLogDate]);

  const handleRotateKey = () => {
    const rotate = async () => {
      try {
        const newKey = generateSecure50CharKey();
        
        // 1. Sync with server first (encrypted with OLD key if it exists)
        const token = localStorage.getItem('verdant_token') || '';
        const response = await fetchWithAuth('/api/system/vault-key', token, {
          method: 'POST',
          body: JSON.stringify({ key: newKey })
        });

        if (!response.ok) throw new Error("SERVER_SYNC_FAILED");

        // 2. Update local storage
        localStorage.setItem('verdant_master_key', newKey);
        setHasMasterKey(true);
        showNotification(hasMasterKey ? t('msg_master_key_rotated') : t('msg_master_key_generated'), "SUCCESS");
        
        // Give the user a moment to see the success notification
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        console.error("Key generation failed:", err);
        showNotification(t('msg_protocol_fault'), "ERROR");
      }
      setConfirmation(prev => ({ ...prev, isOpen: false }));
    };

    if (hasMasterKey) {
      setConfirmation({
        isOpen: true,
        title: t('sec_rotate_key'),
        message: t('sec_key_warning'),
        onConfirm: rotate
      });
    } else {
      rotate();
    }
  };

  const handleExportPublicKey = () => {
    const masterKey = localStorage.getItem('verdant_master_key');
    if (!masterKey) return showNotification(t('msg_no_key_found'), "ERROR");
    
    const blob = new Blob([masterKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verdant_master_key_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(t('msg_key_exported'), "SUCCESS");
  };

  const openAddUserModal = () => {
    setNewUser({ 
      role: 'GARDENER', 
      houseId: isLeadHand ? user?.houseId : null 
    });
    setIsAddingUser(true);
  };

  const visiblePlants = useMemo(() => {
    if (isOwner || isDirector) return plants;
    if (user?.houseId) return plants.filter(p => p.houseId === user.houseId);
    return plants;
  }, [plants, user, isOwner, isDirector]);

  return (
    <div className="p-4 md:p-14 max-w-7xl mx-auto space-y-12 pb-32">
        {/* Modals */}
        {isAddingHouse && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] p-8 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl mb-[env(safe-area-inset-bottom)]">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('lbl_add_house')}</h2>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_name')}</label>
                            <input 
                                type="text" 
                                value={newHouseName}
                                onChange={(e) => setNewHouseName(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                                placeholder={t('lbl_example_house')}
                            />
                        </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button variant="secondary" onClick={() => setIsAddingHouse(false)} className="flex-1 rounded-2xl uppercase font-black">{t('btn_cancel')}</Button>
                        <Button variant="primary" onClick={handleAddHouse} isLoading={isSavingHouse} className="flex-1 rounded-2xl uppercase font-black">{t('btn_save')}</Button>
                    </div>
                </div>
            </div>
        )}

        {editingHouse && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] p-8 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl mb-[env(safe-area-inset-bottom)]">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('lbl_edit_house')}</h2>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_name')}</label>
                            <input 
                                type="text" 
                                value={typeof editingHouse.name === 'object' ? lv(editingHouse.name) : editingHouse.name} 
                                onChange={(e) => setEditingHouse({...editingHouse, name: { ...editingHouse.name, [language]: e.target.value } as any})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            />
                        </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button variant="secondary" onClick={() => setEditingHouse(null)} className="flex-1 rounded-2xl uppercase font-black">{t('btn_cancel')}</Button>
                        <Button variant="primary" onClick={handleUpdateHouse} className="flex-1 rounded-2xl uppercase font-black">{t('btn_save')}</Button>
                    </div>
                </div>
            </div>
        )}

        {isAddingUser && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] p-8 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl mb-[env(safe-area-inset-bottom)]">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('lbl_add_personnel')}</h2>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_name')}</label>
                            <input 
                                type="text" 
                                onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_email')}</label>
                            <input 
                                type="email" 
                                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_role')}</label>
                            <select 
                                value={newUser.role}
                                onChange={(e) => setNewUser({...newUser, role: e.target.value as any})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            >
                                {!(isLeadHand) && <option value="OWNER">{t('role_owner').toUpperCase()}</option>}
                                {!(isLeadHand) && <option value="CO_CEO">{t('role_co_ceo').toUpperCase()}</option>}
                                {!(isLeadHand) && <option value="LEAD_HAND">{t('role_lead_hand').toUpperCase()}</option>}
                                <option value="GARDENER">{t('role_gardener').toUpperCase()}</option>
                                <option value="SEASONAL">{t('role_seasonal').toUpperCase()}</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_house')}</label>
                            <select 
                                value={newUser.houseId || ''}
                                onChange={(e) => setNewUser({...newUser, houseId: e.target.value || null})}
                                disabled={isLeadHand}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20 disabled:opacity-50"
                            >
                                {!(isLeadHand) && <option value="">{t('lbl_global').toUpperCase()}</option>}
                                {houses.map(p => <option key={p.id} value={p.id}>{lv(p.name)}</option>)}
                            </select>
                        </div>
                        {newUser.role === 'SEASONAL' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('access_start')}</label>
                                    <input 
                                        type="date" 
                                        value={newUser.caretakerStart || ''}
                                        onChange={(e) => setNewUser({...newUser, caretakerStart: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('access_expiry')}</label>
                                    <input 
                                        type="date" 
                                        value={newUser.caretakerEnd || ''}
                                        onChange={(e) => setNewUser({...newUser, caretakerEnd: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button variant="secondary" onClick={() => setIsAddingUser(false)} className="flex-1 rounded-2xl uppercase font-black">{t('btn_cancel')}</Button>
                        <Button variant="primary" onClick={handleAddUser} className="flex-1 rounded-2xl uppercase font-black">{t('btn_save')}</Button>
                    </div>
                </div>
            </div>
        )}

        {editingUser && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] p-8 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl mb-[env(safe-area-inset-bottom)]">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('lbl_edit_personnel')}</h2>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_name')}</label>
                            <input 
                                type="text" 
                                value={typeof editingUser.name === 'object' ? lv(editingUser.name as any) : editingUser.name || ''} 
                                onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_email')}</label>
                            <input 
                                type="email" 
                                value={editingUser.email || ''} 
                                onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                disabled={!(isOwner || isDirector)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20 disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_role')}</label>
                            <select 
                                value={editingUser.role}
                                onChange={(e) => setEditingUser({...editingUser, role: e.target.value as any})}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            >
                                {!(isLeadHand) && <option value="OWNER">{t('role_owner').toUpperCase()}</option>}
                                {!(isLeadHand) && <option value="CO_CEO">{t('role_co_ceo').toUpperCase()}</option>}
                                {!(isLeadHand) && <option value="LEAD_HAND">{t('role_lead_hand').toUpperCase()}</option>}
                                <option value="GARDENER">{t('role_gardener').toUpperCase()}</option>
                                <option value="SEASONAL">{t('role_seasonal').toUpperCase()}</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_house')}</label>
                            <select 
                                value={editingUser.houseId || ''}
                                onChange={(e) => setEditingUser({...editingUser, houseId: e.target.value || null})}
                                disabled={isLeadHand}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20 disabled:opacity-50"
                            >
                                {!(isLeadHand) && <option value="">{t('lbl_global').toUpperCase()}</option>}
                                {houses.map(p => <option key={p.id} value={p.id}>{lv(p.name)}</option>)}
                            </select>
                        </div>
                        {editingUser.role === 'SEASONAL' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('access_start')}</label>
                                    <input 
                                        type="date" 
                                        value={editingUser.caretakerStart || ''}
                                        onChange={(e) => setEditingUser({...editingUser, caretakerStart: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('access_expiry')}</label>
                                    <input 
                                        type="date" 
                                        value={editingUser.caretakerEnd || ''}
                                        onChange={(e) => setEditingUser({...editingUser, caretakerEnd: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button variant="secondary" onClick={() => setEditingUser(null)} className="flex-1 rounded-2xl uppercase font-black">{t('btn_cancel')}</Button>
                        <Button variant="primary" onClick={handleUpdateUser} className="flex-1 rounded-2xl uppercase font-black">{t('btn_save')}</Button>
                    </div>
                    {!(isLeadHand) && editingUser.id !== user?.id && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            <Button 
                                variant="danger" 
                                onClick={() => {
                                    const id = editingUser.id;
                                    setEditingUser(null);
                                    handleDeleteUser(id);
                                }} 
                                className="w-full rounded-2xl uppercase font-black"
                            >
                                {t('btn_delete')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        )}

        {movingPlantId && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[40px] p-8 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl mb-[env(safe-area-inset-bottom)]">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('btn_move_plant')}</h2>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_select_house')}</label>
                            <select 
                                value={targetHouseId}
                                onChange={(e) => setTargetHouseId(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                            >
                                <option value="">{t('lbl_unassigned').toUpperCase()}</option>
                                {houses.map(p => <option key={p.id} value={p.id}>{lv(p.name)}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Button variant="secondary" onClick={() => setMovingPlantId(null)} className="flex-1 rounded-2xl uppercase font-black">{t('btn_cancel')}</Button>
                        <Button variant="primary" onClick={handleMovePlant} isLoading={isMoving} className="flex-1 rounded-2xl uppercase font-black">{t('btn_move_plant')}</Button>
                    </div>
                </div>
            </div>
        )}

        <h1 className="text-5xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('menu_admin')}</h1>
        
        <SystemTelemetry />

        <div {...tabsScroll.props} className={`flex gap-x-10 border-b border-slate-200 dark:border-slate-800 pb-0.5 whitespace-nowrap scroll-smooth ${tabsScroll.props.className}`}>
            {availableTabs.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-4 px-4 text-[10px] font-black uppercase tracking-[0.4em] transition-all relative border-b-2 shrink-0 ${activeTab === tab ? 'text-slate-900 dark:text-white border-verdant' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 border-transparent'}`}>
                    {t(`tab_${tab.toLowerCase()}` as any)}
                </button>
            ))}
        </div>
        {activeTab === 'HOUSES' && (
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleHouses.map(house => (
                        <div key={house.id} className="bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
                            <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white mb-2">{lv(house.name)}</h3>
                            <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">{t('lbl_id')}: {house.id}</p>
                            <div className="flex gap-2">
                                <Button variant="secondary" size="sm" className="flex-1 rounded-xl" onClick={() => setEditingHouse(house)}>{t('btn_edit')}</Button>
                                {!(isLeadHand) && <Button variant="danger" size="sm" className="flex-1 rounded-xl" onClick={() => handleDeleteHouse(house.id)}>{t('btn_delete')}</Button>}
                            </div>
                        </div>
                    ))}
                    {!(isLeadHand) && (
                        <button 
                            onClick={() => setIsAddingHouse(true)}
                            className="border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-[32px] p-8 flex flex-col items-center justify-center text-slate-400 hover:text-verdant hover:border-verdant transition-all group min-h-[160px]"
                        >
                            <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">+</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">{t('lbl_add_house')}</span>
                        </button>
                    )}
                </div>
            </div>
        )}
        {activeTab === 'PERSONNEL' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('tab_personnel')}</h2>
                    <Button variant="primary" size="sm" className="rounded-xl uppercase font-black" onClick={openAddUserModal}>
                        + {t('btn_add_personnel')}
                    </Button>
                </div>
                <div {...personnelScroll.props} className={`bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm ${personnelScroll.props.className}`}>
                    <table className="w-full text-left min-w-[600px]">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_name')}</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_role')}</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_house')}</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t('lbl_actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {visiblePersonnel.map(p => (
                                <tr key={p.id} className="text-slate-900 dark:text-white">
                                    <td className="px-6 py-4 font-bold">{typeof p.name === 'object' ? lv(p.name as any) : p.name || t('lbl_unknown')}</td>
                                    <td className="px-6 py-4"><span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">{t(`role_${p.role.toLowerCase()}` as any)}</span></td>
                                    <td className="px-6 py-4 text-slate-500">{houses.find(prop => prop.id === p.houseId) ? lv(houses.find(prop => prop.id === p.houseId)!.name) : t('lbl_global')}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => setEditingUser(p)}
                                                className="text-verdant font-black text-[10px] uppercase tracking-widest hover:underline border border-verdant/20 px-3 py-1 rounded-lg"
                                            >
                                                {t('manage')}
                                            </button>
                                            {!(isLeadHand) && p.id !== user?.id && (
                                                <button 
                                                    onClick={() => handleDeleteUser(p.id)}
                                                    className="text-red-500 font-black text-[10px] uppercase tracking-widest hover:underline border border-red-500/20 px-3 py-1 rounded-lg"
                                                >
                                                    {t('btn_delete')}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
        {activeTab === 'PLANTS' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{t('tab_plants')}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visiblePlants.map(plant => {
                        const house = houses.find(p => p.id === plant.houseId);
                        return (
                            <div key={plant.id} className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-4 shadow-sm flex items-center gap-4 hover:border-verdant/40 transition-all group">
                                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 flex-shrink-0 overflow-hidden ring-2 ring-white dark:ring-slate-800">
                                    {plant.images?.[0] ? (
                                        <img src={plant.images[0]} alt={lv(plant.nickname)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-700 font-black text-xs">?</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white truncate uppercase tracking-tight leading-none mb-1">{lv(plant.nickname)}</h3>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-sans font-normal normal-case leading-none mb-2">{plant.species}</p>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${house ? 'text-verdant' : 'text-amber-500'}`}>
                                            {house ? t('lbl_assigned_to', { house: lv(house.name) }) : t('lbl_unassigned')}
                                        </span>
                                        <button 
                                            onClick={() => setMovingPlantId(plant.id)}
                                            className="text-verdant font-black text-[10px] uppercase tracking-widest hover:underline border border-verdant/20 px-3 py-1 rounded-lg"
                                        >
                                            {t('btn_move_plant')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
        {activeTab === 'DATABASE' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
                    <h3 className="text-xl font-black uppercase">{t('db_restore_title')}</h3>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json,.enc" onChange={handleImportDatabase} />
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()} isLoading={isRestoring} className="w-full h-14 rounded-2xl font-black uppercase">
                        {isRestoring ? t('status_restoring') : t('btn_upload_backup')}
                    </Button>
                </div>
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
                    <h3 className="text-xl font-black uppercase">{t('lbl_system_backup')}</h3>
                    <p className="text-sm text-slate-500">{t('lbl_download_backup_desc')}</p>
                    <Button variant="primary" onClick={handleDownloadBackup} isLoading={isBackingUp} className="w-full h-14 rounded-2xl font-black uppercase">
                        {t('btn_download_backup')}
                    </Button>
                </div>
            </div>
        )}
        {activeTab === 'SECURITY' && (
            <div className="space-y-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
                    <h3 className="text-xl font-black uppercase">{t('lbl_vault_security')}</h3>
                    <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_master_encryption_key')}</span>
                            <span className={`px-2 py-1 text-[8px] font-black rounded-full uppercase ${hasMasterKey ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                {hasMasterKey ? t('active') : t('status_not_configured')}
                            </span>
                        </div>
                        <p className="font-mono text-xs break-all opacity-50">
                            {hasMasterKey ? '••••••••••••••••••••••••••••••••••••••••' : t('lbl_no_key_deployed')}
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <Button variant="secondary" className="flex-1 rounded-xl" onClick={handleRotateKey}>
                            {hasMasterKey ? t('btn_rotate_key') : t('btn_generate_key')}
                        </Button>
                        <Button variant="secondary" className="flex-1 rounded-xl" onClick={handleExportPublicKey} disabled={!hasMasterKey}>
                            {t('btn_export_public_key')}
                        </Button>
                    </div>
                </div>
                {/* ACCESS CONTROL - HIDDEN AS REQUESTED */}
                {/*
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 text-slate-900 dark:text-white">
                    <h3 className="text-xl font-black uppercase">{t('lbl_access_control')}</h3>
                    <p className="text-sm text-slate-500">{t('lbl_access_control_desc')}</p>
                    <div className="flex items-center justify-between p-4 border border-slate-100 dark:border-slate-800 rounded-2xl">
                        <span className="font-bold">{t('lbl_strict_handshake_mode')}</span>
                        <div className="w-12 h-6 bg-verdant rounded-full relative">
                            <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                    </div>
                </div>
                */}
            </div>
        )}
        {activeTab === 'LOGS' && (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-[32px] border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('lbl_select_day')}</label>
                        <input
                            type="date"
                            value={selectedLogDate}
                            onChange={(e) => setSelectedLogDate(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 ring-verdant/20"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={loadLogs} isLoading={isLoadingLogs} className="rounded-xl uppercase font-black">
                            {t('btn_refresh')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleExportCareLogs} isLoading={isExportingLogs} className="rounded-xl uppercase font-black">
                            {t('btn_export_excel')}
                        </Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteDayCareLogs} isLoading={isDeletingLogs} className="rounded-xl uppercase font-black">
                            {t('btn_delete_day_logs')}
                        </Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteAllCareLogs} isLoading={isDeletingLogs} className="rounded-xl uppercase font-black">
                            {t('btn_delete_all_logs')}
                        </Button>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">{t('lbl_system_events')}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_timestamp')}</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_type')}</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_event')}</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_details')}</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('lbl_level')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {combinedLogs.length > 0 ? (
                                    combinedLogs.map(log => (
                                        <tr key={log.id} className="text-slate-900 dark:text-white text-xs">
                                            <td className="px-6 py-4 font-mono opacity-50">{new Date(log.timestamp).toLocaleString()}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                    log.category === 'SYSTEM' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : 'bg-verdant/10 text-verdant'
                                                }`}>
                                                    {log.category}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-bold">{log.event}</td>
                                            <td className="px-6 py-4 text-slate-500">{log.details}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                                    log.level === 'ERROR' ? 'bg-red-500/10 text-red-500' : 
                                                    log.level === 'WARN' ? 'bg-amber-500/10 text-amber-500' : 
                                                    'bg-blue-500/10 text-blue-500'
                                                }`}>
                                                    {t(`lbl_${log.level.toLowerCase()}` as any)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 uppercase font-black tracking-widest">
                                            {t('msg_no_events_recorded')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        <ConfirmationDialog
          isOpen={confirmation.isOpen}
          onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmation.onConfirm}
          title={confirmation.title}
          message={confirmation.message}
        />

        <Modal
            isOpen={isBackupKeyModalOpen}
            onClose={() => {
                setIsBackupKeyModalOpen(false);
                setPendingBackupFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            title={t('db_restore_title')}
        >
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('msg_enter_backup_key')}</label>
                    <input
                        type="password"
                        value={backupKeyInput}
                        onChange={(e) => setBackupKeyInput(e.target.value)}
                        placeholder="••••••••••••••••••••••••••••••••"
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 font-mono text-sm outline-none focus:ring-2 ring-verdant/20"
                        autoFocus
                    />
                </div>
                <div className="flex gap-3">
                    <Button 
                        variant="ghost" 
                        onClick={() => {
                            setIsBackupKeyModalOpen(false);
                            setPendingBackupFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }} 
                        className="flex-1 rounded-xl uppercase font-black"
                    >
                        {t('btn_cancel')}
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleBackupKeySubmit} 
                        className="flex-1 rounded-xl uppercase font-black"
                    >
                        {t('btn_confirm')}
                    </Button>
                </div>
            </div>
        </Modal>
    </div>
  );
};