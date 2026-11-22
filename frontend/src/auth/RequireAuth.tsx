import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signInPath, useAuth } from './AuthProvider';

/** Renders its children only for a signed-in user; otherwise redirects to sign-in and back. */
export const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <span className="label">Checking your session…</span>
      </div>
    );
  }
  if (user === null) return <Navigate to={signInPath(location.pathname + location.search)} replace />;
  return children;
};
