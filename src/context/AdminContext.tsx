import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AdminSession, AdminProfile } from '../types/admin';
import { AdminClient } from '../services/adminClient';

interface AdminContextType {
  session: AdminSession | null;
  profile: AdminProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  error: string | null;
  loginWithToken: (token: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchSession();
      if (res.success && res.session) {
        setSession(res.session);
        // Also load profile
        const profRes = await AdminClient.fetchProfile();
        if (profRes.success && profRes.profile) {
          setProfile(profRes.profile);
        }
      } else {
        setSession(null);
        setProfile(null);
        if (res.status === 403) {
          setError('Admin access is not authorized for this account.');
        } else if (res.status === 401 && AdminClient.getToken()) {
          setError('Authentication token expired. Please sign in again.');
        }
      }
    } catch {
      setSession(null);
      setProfile(null);
      setError('Failed to connect to authentication server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loginWithToken = async (token: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    setError(null);
    try {
      AdminClient.setToken(token);
      const res = await AdminClient.fetchSession();
      if (res.success && res.session) {
        setSession(res.session);
        const profRes = await AdminClient.fetchProfile();
        if (profRes.success && profRes.profile) {
          setProfile(profRes.profile);
        }
        setIsLoading(false);
        return { success: true };
      } else {
        AdminClient.clearToken();
        setSession(null);
        setProfile(null);
        const msg = res.status === 403
          ? 'Admin access is not authorized for this account.'
          : (res.message || 'Authentication failed. Please verify credentials.');
        setError(msg);
        setIsLoading(false);
        return { success: false, message: msg };
      }
    } catch (err: any) {
      AdminClient.clearToken();
      setSession(null);
      setProfile(null);
      const msg = err.message || 'Sign in request failed.';
      setError(msg);
      setIsLoading(false);
      return { success: false, message: msg };
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await AdminClient.logout();
    } finally {
      setSession(null);
      setProfile(null);
      setError(null);
      setIsLoading(false);
    }
  };

  const isAuthenticated = !!AdminClient.getToken() && !!session;
  const isAuthorized = isAuthenticated && session?.role === 'SUPER_ADMIN' && session?.status === 'ACTIVE';

  return (
    <AdminContext.Provider
      value={{
        session,
        profile,
        isLoading,
        isAuthenticated,
        isAuthorized,
        error,
        loginWithToken,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export function useAdmin(): AdminContextType {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
