
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, AuthState, House } from '../types';
import { API_URL } from '../constants';

interface AuthContextType extends AuthState {
  login: (token: string, user: User) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  can: (action: string, subject?: any) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  const updateCurrentUser = useCallback((updates: Partial<User>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, ...updates };
      localStorage.setItem('verdant_user', JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  useEffect(() => {
    // DEV-ONLY: Automatically sign in as a mock owner to bypass login screen.
    // This allows development on protected routes without a valid Google Client ID.
    if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_DEV_AUTH !== 'true') {
      const mockUser: User = {
        id: 'dev-user-01',
        email: 'dev@verdant.systems',
        name: 'Dev Owner',
        role: 'OWNER',
        houseId: null,
      };
      setState({ user: mockUser, token: 'dev-token', loading: false });
      
      fetch(`${API_URL}/api/system/config`, {
          headers: { 
              'Authorization': `Bearer dev-token`,
              'x-user-role': 'OWNER' 
          }
      }).then(res => res.ok ? res.json() : null)
        .then(config => {
            if (config?.masterKey && config.masterKey !== localStorage.getItem('verdant_master_key')) {
                localStorage.setItem('verdant_master_key', config.masterKey);
            }
        }).catch(() => {});
      return;
    }

    const storedToken = localStorage.getItem('verdant_token');
    const storedUser = localStorage.getItem('verdant_user');

    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setState({
          token: storedToken,
          user,
          loading: false,
        });

        // Recovery Protocol: Sync Master Key if missing or stale
        if (['OWNER', 'CO_CEO'].includes(user.role)) {
            fetch(`${API_URL}/api/system/config`, {
                headers: { 
                    'Authorization': `Bearer ${storedToken}`,
                    'x-user-role': user.role 
                }
            }).then(res => res.ok ? res.json() : null)
              .then(config => {
                  if (config?.masterKey && config.masterKey !== localStorage.getItem('verdant_master_key')) {
                      localStorage.setItem('verdant_master_key', config.masterKey);
                  }
              }).catch(() => {});
        }
      } catch (e) {
        setState(prev => ({ ...prev, loading: false }));
      }
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const login = useCallback(async (token: string, user: User) => {
    // SECURITY: Scrub AI key before storage
    const userToStore = { ...user, personalAiKey: undefined }; 
    
    localStorage.setItem('verdant_token', token);
    localStorage.setItem('verdant_user', JSON.stringify(userToStore));
    
    // Update state immediately so ProtectedRoute allows entry
    setState({ token, user, loading: false });

    // Recovery Protocol: Fetch Master Key from server if we are Owner/Director in background
    if (['OWNER', 'CO_CEO'].includes(user.role)) {
        fetch(`${API_URL}/api/system/config`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'x-user-role': user.role 
            }
        }).then(res => res.ok ? res.json() : null)
          .then(config => {
              if (config?.masterKey) {
                  localStorage.setItem('verdant_master_key', config.masterKey);
              }
          }).catch(() => {
              console.warn("System Handshake Failure: Master Key could not be re-synchronized.");
          });
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('verdant_token');
    localStorage.removeItem('verdant_user');
    localStorage.removeItem('verdant_master_key');
    setState({ token: null, user: null, loading: false });
  }, []);

  const can = useCallback((action: string, subject?: any): boolean => {
    if (!state.user) return false;
    const role = state.user.role;

    if (role === 'SEASONAL') {
        const now = new Date();
        const start = state.user.caretakerStart ? new Date(state.user.caretakerStart) : null;
        const end = state.user.caretakerEnd ? new Date(state.user.caretakerEnd) : null;
        if (start && now < start) return false;
        if (end && now > end) return false;
        return ['log_data', 'read_plants', 'consume_inventory', 'complete_tasks'].includes(action);
    }

    if (role === 'OWNER') return true;
    if (role === 'CO_CEO') return !['db_backup', 'db_restore', 'db_delete_system'].includes(action);
    if (role === 'LEAD_HAND') {
        if (subject && subject.houseId !== state.user.houseId) return false;
        return ['manage_house_users', 'create_plants', 'delete_plants', 'manage_labels', 'manage_inventory', 'consume_inventory', 'manage_tasks', 'complete_tasks', 'log_data', 'read_plants'].includes(action);
    }
    if (role === 'GARDENER') {
        if (subject && subject.houseId !== state.user.houseId) return false;
        return ['log_data', 'read_plants', 'create_plants', 'manage_inventory', 'consume_inventory', 'manage_tasks', 'complete_tasks'].includes(action);
    }
    return false;
  }, [state.user]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateCurrentUser, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
