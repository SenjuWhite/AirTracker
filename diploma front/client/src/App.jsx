import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RobotController from './components/RobotController';
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/Layout'; // Твоя навігація (Topbar)
import RobotDashboard from './components/RobotDashboard';
import SessionHistory from './components/SessionHistory';
import SessionDetails from './components/SessionDetails';
import RobotAdmin from './components/RobotAdmin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* Всі сторінки всередині цього Route будуть мати спільний Layout */}
        <Route element={<Layout />}>
             <Route path="/" element={
            <ProtectedRoute allowedRoles={['admin', 'operator']}>
               <RobotDashboard />
            </ProtectedRoute>
          } />
          {/* Публічна сторінка або для всіх юзерів */}
          <Route path="/controller/:robotId" element={
            <ProtectedRoute allowedRoles={['admin', 'operator']}>
               <RobotController />
            </ProtectedRoute>
          } />

          {/* Сторінка тільки для Адмінів */}
          <Route path="/history" element={
            <ProtectedRoute allowedRoles={['admin', 'operator', 'viewer']}>
               <SessionHistory />
            </ProtectedRoute>
          } />

          <Route path="/session/:id" element={
            <ProtectedRoute allowedRoles={['admin', 'operator', 'viewer']}>
               <SessionDetails />
            </ProtectedRoute>
          } />

          <Route path="/admin/robots" element={
            <ProtectedRoute allowedRoles={['admin']}>
               <RobotAdmin />
            </ProtectedRoute>
          } />
        
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}