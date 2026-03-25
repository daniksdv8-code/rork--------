import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { User } from '@/types';

const AUTH_KEY = 'park_auth_user';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as User;
          const { password: _pw, ...safeUser } = parsed;
          const userToSet = parsed.password ? safeUser : parsed;
          setCurrentUser(userToSet as User);
          console.log('[Auth] Restored session:', (userToSet as any).login);
        }
      } catch (e) {
        console.log('Failed to load auth:', e);
      } finally {
        setIsLoading(false);
      }
    };
    void loadAuth();
  }, []);

  const setSession = useCallback(async (user: User) => {
    const { password: _pw, ...safeUser } = user;
    const userToStore = user.password && user.password !== '***' ? safeUser : user;
    setCurrentUser(userToStore as User);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(userToStore));
    console.log('[Auth] Session set:', (userToStore as any).login);
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<User>) => {
    setCurrentUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      void AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await AsyncStorage.removeItem(AUTH_KEY);
    console.log('[Auth] Logged out');
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  return useMemo(() => ({
    currentUser,
    isLoading,
    isAdmin,
    setSession,
    updateCurrentUser,
    logout,
  }), [currentUser, isLoading, isAdmin, setSession, updateCurrentUser, logout]);
});
