
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlantProvider, usePlants } from './context/PlantContext';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { LanguageProvider } from './context/LanguageContext';
import { PersonnelProvider, usePersonnel } from './context/PersonnelContext';
import { SystemProvider } from './context/SystemContext';
import { Layout } from './components/Layout';
import { SecureAuth } from './pages/SecureAuth';
import { AdminView } from './pages/AdminView';
import { Dashboard } from './pages/Dashboard';
import { CareSchedule } from './pages/CareSchedule';
import { LocationsView } from './pages/LocationsView';
import { TasksView } from './pages/TasksView';
import { InventoryView } from './pages/InventoryView';
import { LabelsView } from './pages/LabelsView';
import { ManualView } from './pages/ManualView';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireManager?: boolean }> = ({ 
  children, 
  requireManager = false 
}) => {
  const { user, loading: authLoading } = useAuth();
  const { isLoading: plantsLoading } = usePlants();
  const { isLoading: inventoryLoading } = useInventory();
  const { isLoading: personnelLoading } = usePersonnel();

  // 1. First, wait for Auth to determine if we have a session
  if (authLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white dark:bg-slate-950">
        <div className="w-16 h-16 border-4 border-verdant border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 animate-pulse">
          Authenticating...
        </div>
      </div>
    );
  }
  
  // 2. If not logged in, redirect to login immediately
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. If logged in, wait for data contexts to finish their initial server sync
  if (plantsLoading || inventoryLoading || personnelLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white dark:bg-slate-950">
        <div className="w-16 h-16 border-4 border-verdant border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 animate-pulse">
          Verifying with Server...
        </div>
      </div>
    );
  }

  const isManager = ['OWNER', 'CO_CEO', 'LEAD_HAND'].includes(user.role);

  if (requireManager && !isManager) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SystemProvider>
        <LanguageProvider>
          <PersonnelProvider>
            <InventoryProvider>
              <PlantProvider>
                <HashRouter>
                  <Routes>
                      <Route path="/login" element={<SecureAuth />} />
                      <Route path="/" element={
                        <ProtectedRoute>
                          <Layout>
                            <Dashboard />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/care" element={
                        <ProtectedRoute>
                          <Layout>
                            <CareSchedule />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/tasks" element={
                        <ProtectedRoute>
                          <Layout>
                            <TasksView />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/inventory" element={
                        <ProtectedRoute>
                          <Layout>
                            <InventoryView />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/labels" element={
                        <ProtectedRoute>
                          <Layout>
                            <LabelsView />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/locations" element={
                        <ProtectedRoute>
                          <Layout>
                            <LocationsView />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/admin" element={
                        <ProtectedRoute requireManager>
                          <Layout>
                            <AdminView />
                          </Layout>
                        </ProtectedRoute>
                      } />
                      <Route path="/manual" element={
                        <ProtectedRoute>
                          <Layout>
                            <ManualView />
                          </Layout>
                        </ProtectedRoute>
                      } />
                  </Routes>
                </HashRouter>
              </PlantProvider>
            </InventoryProvider>
          </PersonnelProvider>
        </LanguageProvider>
      </SystemProvider>
    </AuthProvider>
  );
};

export default App;
