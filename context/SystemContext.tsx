
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { fetchWithAuth } from '../services/api';
import { requestNotificationPermission } from '../services/notifications';
import { useAuth } from './AuthContext';

export type NotificationType = 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING';

export interface SystemLog {
  id: string;
  event: string;
  details: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  created_at: string;
}

interface Notification {
  message: string;
  type: NotificationType;
  id: string;
}

interface SystemContextType {
  rpm: number;
  limit: number;
  status: 'STABLE' | 'BUSY' | 'COOLDOWN';
  recordHit: (isError?: boolean) => void;
  notification: Notification | null;
  showNotification: (message: string, type?: NotificationType) => void;
  clearNotification: () => void;
  fetchSystemLogs: () => Promise<SystemLog[]>;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

const FREE_TIER_RPM_LIMIT = 15;
const WINDOW_MS = 60000;

export const SystemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [hits, setHits] = useState<number[]>([]);
  const [status, setStatus] = useState<'STABLE' | 'BUSY' | 'COOLDOWN'>('STABLE');
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setHits(prev => prev.filter(h => now - h < WINDOW_MS));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const recordHit = useCallback((isError: boolean = false) => {
    if (isError) {
      setStatus('COOLDOWN');
      setTimeout(() => setStatus('STABLE'), 30000);
    }
    setHits(prev => [...prev, Date.now()]);
  }, []);

  const showNotification = useCallback((message: string, type: NotificationType = 'INFO') => {
    const id = Math.random().toString(36).substring(7);
    setNotification({ message, type, id });
    
    // Auto-clear after 4 seconds
    setTimeout(() => {
      setNotification(prev => prev?.id === id ? null : prev);
    }, 4000);
  }, []);

  const clearNotification = useCallback(() => setNotification(null), []);

  const fetchSystemLogs = useCallback(async () => {
    if (!token) return [];
    try {
      const res = await fetchWithAuth('/api/system/logs', token);
      if (res.ok) return await res.json();
      return [];
    } catch (e) {
      console.error("Failed to fetch system logs:", e);
      return [];
    }
  }, [token]);

  const rpm = hits.length;
  
  useEffect(() => {
    if (status !== 'COOLDOWN') {
      if (rpm > FREE_TIER_RPM_LIMIT * 0.8) setStatus('BUSY');
      else setStatus('STABLE');
    }
  }, [rpm, status]);

  return (
    <SystemContext.Provider value={{ 
      rpm, 
      limit: FREE_TIER_RPM_LIMIT, 
      status, 
      recordHit, 
      notification, 
      showNotification, 
      clearNotification,
      fetchSystemLogs
    }}>
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => {
  const context = useContext(SystemContext);
  if (!context) throw new Error('useSystem must be used within a SystemProvider');
  return context;
};
