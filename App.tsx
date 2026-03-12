
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlantProvider } from './context/PlantContext';
import { TaskProvider } from './context/TaskContext';
import { InventoryProvider } from './context/InventoryContext';
import { LanguageProvider } from './context/LanguageContext';
import { PersonnelProvider } from './context/PersonnelContext';
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
  const { user, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Loading...</div>;
  
  if (!user) {
    return <Navigate to="/login" replace />;
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
                <TaskProvider>
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
                </TaskProvider>
              </PlantProvider>
            </InventoryProvider>
          </PersonnelProvider>
        </LanguageProvider>
      </SystemProvider>
    </AuthProvider>
  );
};

export default App;
