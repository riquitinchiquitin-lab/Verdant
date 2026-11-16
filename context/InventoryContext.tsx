import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { InventoryItem, Plant } from '../types';
import { fetchWithAuth } from '../services/api';
import { useAuth } from './AuthContext';

interface InventoryContextType {
  inventory: InventoryItem[];
  addItem: (item: InventoryItem, existingPlants?: Plant[]) => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  consumeItem: (id: string, amount: number) => void;
  assignToPlant: (itemId: string, plantId: string) => void;
  releaseFromPlant: (itemId: string) => void;
  isLoading: boolean;
  isSynced: boolean;
  refreshInventoryData: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSynced, setIsSynced] = useState(false);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);

  const refreshInventoryData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchWithAuth('/api/inventory', token);
      if (res.ok) {
        const remoteData = await res.json();
        if (Array.isArray(remoteData)) {
          setInventory(remoteData);
          setIsSynced(true);
        }
      }
    } catch (e) {
      console.warn("Inventory Sync: Proxmox Node unreachable.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const hydrate = async () => {
      setIsPersistenceReady(true);
      if (token) {
        await refreshInventoryData();
      } else {
        setInventory([]);
        setIsSynced(false);
        setIsLoading(false);
        localStorage.removeItem('verdant_inventory_v8');
      }
    };
    hydrate();
  }, [token, refreshInventoryData]);

  // Heartbeat Polling: 30s
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      refreshInventoryData();
    }, 30000);
    return () => clearInterval(interval);
  }, [token, refreshInventoryData]);

  useEffect(() => {
    if (!isPersistenceReady || !token) return;
    try {
      localStorage.setItem('verdant_inventory_v8', JSON.stringify(inventory));
    } catch {
      // Ignore storage quota errors
    }
  }, [inventory, isPersistenceReady, token]);

  const addItem = (item: InventoryItem) => {
    setInventory(prev => [item, ...prev]);
    if (token) {
        fetchWithAuth('/api/inventory', token, { method: 'POST', body: JSON.stringify(item) })
            .then(() => refreshInventoryData())
            .catch(() => refreshInventoryData());
    }
  };

  const updateItem = (id: string, updates: Partial<InventoryItem>) => {
    let updatedItem: InventoryItem | null = null;
    setInventory(prev => prev.map(i => {
      if (i.id === id) {
        updatedItem = { ...i, ...updates };
        return updatedItem;
      }
      return i;
    }));
    if (!updatedItem) return;
    
    if (token) {
        fetchWithAuth('/api/inventory', token, { method: 'POST', body: JSON.stringify(updatedItem) })
          .then(() => refreshInventoryData())
          .catch(() => refreshInventoryData());
    }
  };

  const deleteItem = (id: string) => {
    setInventory(prev => prev.filter(i => i.id !== id));
    if (token) {
        fetchWithAuth(`/api/inventory?id=${id}`, token, { method: 'DELETE' })
            .then(() => refreshInventoryData())
            .catch(() => refreshInventoryData());
    }
  };

  const consumeItem = (id: string, amount: number) => {
    let updatedItem: InventoryItem | null = null;
    setInventory(prev => prev.map(i => {
      if (i.id === id) {
        updatedItem = { ...i, quantity: Math.max(0, i.quantity - amount) };
        return updatedItem;
      }
      return i;
    }));
    if (!updatedItem) return;
    
    if (token) {
        fetchWithAuth('/api/inventory', token, { method: 'POST', body: JSON.stringify(updatedItem) })
          .catch(() => refreshInventoryData());
    }
  };

  const assignToPlant = (itemId: string, plantId: string) => {
    updateItem(itemId, { associatedPlantId: plantId });
  };

  const releaseFromPlant = (itemId: string) => {
    updateItem(itemId, { associatedPlantId: undefined });
  };

  return (
    <InventoryContext.Provider value={{ 
      inventory, addItem, updateItem, deleteItem, consumeItem, assignToPlant, releaseFromPlant, 
      isLoading, isSynced, refreshInventoryData 
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) throw new Error('useInventory must be used within a InventoryProvider');
  return context;
};