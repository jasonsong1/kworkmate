import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';
import { kwActive, kwClearSession, kwLogout, kwVerify, kwHandleOAuthCallback } from '@/lib/kwAuthClient';
import useIdleLogout from '@/hooks/useIdleLogout';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isKwSession, setIsKwSession] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState({ id: 'kworkmate', public_settings: {} });

  useEffect(() => {
    checkAppState();
  }, []);

  // [세션 검증 및 수립]:
  // 1) KWorkMate 자체 세션 토큰 확인
  // 2) Supabase Google OAuth 세션 확인
  const acceptKwSession = async () => {
    try {
      if (kwActive()) {
        const kwUser = await kwVerify();
        if (kwUser) {
          setUser(kwUser);
          setIsAuthenticated(true);
          setIsKwSession(true);
          setIsLoadingAuth(false);
          setIsLoadingPublicSettings(false);
          setAuthChecked(true);
          return true;
        }
      }

      // Supabase OAuth (Google 등) 세션 확인
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
        if (session && session.user) {
          const oauthUser = await kwHandleOAuthCallback();
          if (oauthUser) {
            setUser(oauthUser);
            setIsAuthenticated(true);
            setIsKwSession(true);
            setIsLoadingAuth(false);
            setIsLoadingPublicSettings(false);
            setAuthChecked(true);
            return true;
          }
        }
      }
    } catch (err) {
      console.warn('[AuthContext] Session check warning:', err);
    }
    return false;
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // 세션이 유효하면 즉시 로그인 완료 처리
      if (await acceptKwSession()) return;

      // 비로그인 상태 확정
      setUser(null);
      setIsAuthenticated(false);
      setIsKwSession(false);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('Unexpected auth state check error:', error);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      if (await acceptKwSession()) return;

      setUser(null);
      setIsAuthenticated(false);
      setIsKwSession(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setUser(null);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setIsKwSession(false);

    try {
      await kwLogout();
    } catch (_) {}

    if (shouldRedirect) {
      window.location.href = '/login';
    }
  };

  const navigateToLogin = () => {
    if (kwActive()) kwClearSession();
    const here = window.location.pathname + window.location.search;
    const onAuthPage = here.startsWith('/login') || here.startsWith('/register');
    window.location.href =
      onAuthPage || here === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(here)}`;
  };

  // 30분간 활동이 없으면 자동 로그아웃
  useIdleLogout(isAuthenticated, () => {
    logout(true);
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        isKwSession,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      isAuthenticated: false,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: { id: 'kworkmate', public_settings: {} },
      authChecked: true,
      isKwSession: false,
      logout: () => {},
      navigateToLogin: () => { window.location.href = '/login'; },
      checkUserAuth: () => {},
      checkAppState: () => {}
    };
  }
  return context;
};