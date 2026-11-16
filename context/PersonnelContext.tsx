
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '../types';
import { fetchWithAuth } from '../services/api';
import { useAuth } from './AuthContext';

interface PersonnelContextType {
  users: User[];
  addUser: (user: User) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  removeUserPermanently: (userId: string) => Promise<void>;
  getUsersByHouse: (houseId: string | null) => User[];
  isLoading: boolean;
  refreshPersonnelData: () => Promise<void>;
}

const PersonnelContext = createContext<PersonnelContextType | undefined>(undefined);

export const PersonnelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, user, updateCurrentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPersistenceReady, setIsPersistenceReady] = useState(false);

  const refreshPersonnelData = useCallback(async () => {
    if (!token || !user) return;
    try {
      const res = await fetchWithAuth('/api/users', token, {
        headers: {
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-house-id': user.houseId || ''
        }
      });
      if (res.ok) {
        const remoteUsers = await res.json();
        if (Array.isArray(remoteUsers)) {
          setUsers(remoteUsers);
        }
      }
    } catch (e) {
      console.warn("Personnel Sync: Proxmox Node restricted.");
    } finally {
      setIsLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    const hydrate = async () => {
      setIsPersistenceReady(true);
      if (token) {
        await refreshPersonnelData();
      } else {
        setUsers([]);
        setIsLoading(false);
        localStorage.removeItem('verdant_personnel_v8');
      }
    };
    hydrate();
  }, [token, refreshPersonnelData]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(refreshPersonnelData, 30000);
    return () => clearInterval(interval);
  }, [token, refreshPersonnelData]);

  useEffect(() => {
    if (!isPersistenceReady || !token) return;
    try {
      localStorage.setItem('verdant_personnel_v8', JSON.stringify(users));
    } catch {
      // Ignore storage quota errors
    }
  }, [users, isPersistenceReady, token]);

  const addUser = async (newUser: User) => {
    const userToSave = { ...newUser, createdById: user?.id };
    setUsers(prev => [userToSave, ...prev]);

    if (token) {
      try {
        const response = await fetchWithAuth('/api/users', token, { 
          method: 'POST', 
          body: JSON.stringify(userToSave) 
        });
        if (!response.ok) throw new Error("API rejection");
        await refreshPersonnelData();
      } catch (err) {
        console.error("User creation failed:", err);
        setUsers(prev => prev.filter(u => u.id !== newUser.id));
        throw err;
      }
    }
  };

  const updateUser = async (userId: string, updates: Partial<User>) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;

    const updatedUser = { ...target, ...updates };
    setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));

    if (token) {
      try {
        const res = await fetchWithAuth('/api/users', token, { method: 'POST', body: JSON.stringify(updatedUser) });
        if (!res.ok) throw new Error("API rejection");
        if (userId === user?.id) {
          updateCurrentUser(updates);
        }
        await refreshPersonnelData();
      } catch (err) {
        console.error("User update failed:", err);
        setUsers(prev => prev.map(u => u.id === userId ? target : u));
        throw err;
      }
    } else if (userId === user?.id) {
      updateCurrentUser(updates);
    }
  };

  const deleteUser = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    await updateUser(userId, { deletedAt: new Date().toISOString() });
  };

  const removeUserPermanently = async (userId: string) => {
    const prevUsers = users;
    setUsers(prev => prev.filter(u => u.id !== userId));
    if (token) {
      try {
        const res = await fetchWithAuth(`/api/users/${userId}`, token, { method: 'DELETE' });
        if (!res.ok) throw new Error("API rejection");
        await refreshPersonnelData();
      } catch (err) {
        console.error("Personnel deletion failed:", err);
        setUsers(prevUsers);
        throw err;
      }
    }
  };

  const getUsersByHouse = (houseId: string | null) => {
    return users.filter(u => u.houseId === houseId);
  };

  return (
    <PersonnelContext.Provider value={{ 
      users, addUser, updateUser, deleteUser, removeUserPermanently, 
      getUsersByHouse, isLoading, refreshPersonnelData 
    }}>
      {children}
    </PersonnelContext.Provider>
  );
};

export const usePersonnel = () => {
  const context = useContext(PersonnelContext);
  if (!context) throw new Error('usePersonnel must be used within a PersonnelProvider');
  return context;
};
