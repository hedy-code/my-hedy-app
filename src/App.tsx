import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { ShoppingList } from './components/ShoppingList';
import { Expirations } from './components/Expirations';
import { HistoricalLibrary } from './components/HistoricalLibrary';
import { Settings } from './components/Settings';
import Login from './components/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoadingSpinner } from './components/LoadingSpinner';
import { WarehouseProvider } from './contexts/WarehouseContext';
import { ToastProvider } from './contexts/ToastContext';
import { UndoRedoProvider } from './contexts/UndoRedoContext';
import React from 'react';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <WarehouseProvider>
        <UndoRedoProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Dashboard />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="shopping" element={<ShoppingList />} />
                  <Route path="expirations" element={<Expirations />} />
                  <Route path="historical" element={<HistoricalLibrary />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </UndoRedoProvider>
      </WarehouseProvider>
    </AuthProvider>
  )
}

export default App
