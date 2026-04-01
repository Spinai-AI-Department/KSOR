import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { authService } from "../api/auth";
import { setTokenRefresher } from "../api/client";

export interface User {
  id: string;
  name: string;
  role: string;
  hospital: string;
  email: string;
  phone?: string;
  specialty?: string;
  licenseNumber?: string;
  department?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPw: string, newPw: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** How many ms before expiry to proactively refresh (5 minutes) */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("ksor_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("ksor_token")
  );

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRefreshingRef = useRef(false);

  // ── helpers to persist tokens ──
  const persistTokens = useCallback((accessToken: string, refreshToken: string, expiresIn: number) => {
    setToken(accessToken);
    localStorage.setItem("ksor_token", accessToken);
    localStorage.setItem("ksor_refresh_token", refreshToken);
    localStorage.setItem("ksor_token_expires_at", String(Date.now() + expiresIn * 1000));
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("ksor_user");
    localStorage.removeItem("ksor_token");
    localStorage.removeItem("ksor_refresh_token");
    localStorage.removeItem("ksor_token_expires_at");
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  // ── core refresh logic ──
  const doRefresh = useCallback(async (): Promise<string | null> => {
    const rt = localStorage.getItem("ksor_refresh_token");
    if (!rt || isRefreshingRef.current) return null;
    isRefreshingRef.current = true;
    try {
      const res = await authService.refresh(rt);
      persistTokens(res.access_token, res.refresh_token, res.expires_in);
      return res.access_token;
    } catch {
      clearAuth();
      return null;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [persistTokens, clearAuth]);

  // ── schedule proactive refresh ──
  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max((expiresIn * 1000) - REFRESH_MARGIN_MS, 10_000);
    refreshTimerRef.current = setTimeout(() => { doRefresh(); }, delay);
  }, [doRefresh]);

  // Wire up the client-level 401 interceptor so any API call can auto-retry
  useEffect(() => {
    setTokenRefresher(doRefresh);
    return () => setTokenRefresher(null);
  }, [doRefresh]);

  // On mount, schedule a refresh if we have a stored expiry
  useEffect(() => {
    const expiresAt = Number(localStorage.getItem("ksor_token_expires_at") || 0);
    if (expiresAt > 0) {
      const remaining = Math.max((expiresAt - Date.now()) / 1000, 0);
      if (remaining > 0) {
        scheduleRefresh(remaining);
      } else {
        // Token already expired — try refresh immediately
        doRefresh();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── login ──
  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authService.login({ login_id: email, password });
      setUser(res.user);
      persistTokens(res.access_token, res.refresh_token, res.expires_in);
      localStorage.setItem("ksor_user", JSON.stringify(res.user));
      scheduleRefresh(res.expires_in);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "이메일 또는 비밀번호가 올바르지 않습니다.",
      };
    }
  };

  // ── logout ──
  const logout = () => {
    if (token) {
      authService.logout(token).catch(() => {});
    }
    clearAuth();
  };

  const updateUser = async (
    updates: Partial<User>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "로그인이 필요합니다." };
    if (!token) return { success: false, error: "인증 토큰이 없습니다." };
    try {
      await authService.updateProfile(
        { email: updates.email, phone: updates.phone },
        token
      );
      const freshUser = await authService.getMe(token);
      setUser(freshUser);
      localStorage.setItem("ksor_user", JSON.stringify(freshUser));
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "프로필 업데이트에 실패했습니다.",
      };
    }
  };

  const changePassword = async (
    currentPw: string,
    newPw: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "로그인이 필요합니다." };
    if (newPw.length < 6)
      return { success: false, error: "새 비밀번호는 6자 이상이어야 합니다." };
    if (!token) return { success: false, error: "인증 토큰이 없습니다." };
    try {
      await authService.changePassword(
        { current_password: currentPw, new_password: newPw, new_password_confirm: newPw },
        token
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.",
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!user && !!token, login, logout, updateUser, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
