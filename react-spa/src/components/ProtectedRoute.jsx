import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const location = useLocation();

  console.log('ProtectedRoute: token exists:', !!token);
  console.log('ProtectedRoute: current location:', location.pathname);

  if (!token) {
    console.log('ProtectedRoute: No token, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  console.log('ProtectedRoute: Token found, rendering children');
  return children;
} 