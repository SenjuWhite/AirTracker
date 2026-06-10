import { Navigate } from 'react-router-dom';
import { authService } from '../../api/authService';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const userRole = authService.getUserRole() || 'viewer';

  if (!token) return <Navigate to="/login" replace />;
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/unauthorized" replace />; // Or somewhere else
  }

  return children;
};
export default ProtectedRoute;