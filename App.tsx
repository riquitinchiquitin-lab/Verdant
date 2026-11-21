
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlantProvider, usePlants } from './context/PlantContext';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { LanguageProvider } from './context/LanguageContext';
import { PersonnelProvider, usePersonnel } from './context/PersonnelContext';
import { SystemProvider } from './context/SystemContext';
import { Layout } from './components/Layout';
import { SecureAuth } from './pages/SecureAuth';
import { Dashboard } from './pages/Dashboard';

const AdminView = lazy(() => import('./pages/AdminView').then(m => ({ default: m.AdminView })));
const CareSchedule = lazy(() => import('./pages/CareSchedule').then(m => ({ default: m.CareSchedule })));
const LocationsView = lazy(() => import('./pages/LocationsView').then(m => ({ default: m.LocationsView })));
const TasksView = lazy(() => import('./pages/TasksView').then(m => ({ default: m.TasksView })));
const InventoryView = lazy(() => import('./pages/InventoryView').then(m => ({ default: m.InventoryView })));
const LabelsView = lazy(() => import('./pages/LabelsView').then(m => ({ default: m.LabelsView })));
const ManualView = lazy(() => import('./pages/ManualView').then(m => ({ default: m.ManualView })));
const InviteOnboarding = lazy(() => import('./pages/InviteOnboarding').then(m => ({ default: m.InviteOnboarding })));

const RouteFallback: React.FC = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <div className="w-10 h-10 border-4 border-md-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

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
      <div className="flex h-screen flex-col items-center justify-center bg-md-surface">
        <div className="w-14 h-14 border-4 border-md-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-xs font-semibold tracking-widest text-md-on-surface-variant animate-pulse">
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
      <div className="flex h-screen flex-col items-center justify-center bg-md-surface">
        <div className="w-14 h-14 border-4 border-md-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-xs font-semibold tracking-widest text-md-on-surface-variant animate-pulse">
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
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                        <Route path="/login" element={<SecureAuth />} />
                        <Route path="/invite/:token" element={<InviteOnboarding />} />
                        <Route path="/" element={
                          <ProtectedRoute>
                            <Layout>
                              <Dashboard initialSpecimenFilter="ALL" />
                            </Layout>
                          </ProtectedRoute>
                        } />
                        <Route path="/trees" element={
                          <ProtectedRoute>
                            <Layout>
                              <Dashboard initialSpecimenFilter="TREE" />
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
                  </Suspense>
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
