import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const location = useLocation();



  if (!token) {

    return <Navigate to="/login" state={{ from: location }} replace />;
  }


  return children;
} 