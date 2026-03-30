import { createContext, useContext, useState, ReactNode } from "react";
import { authService } from "../api/auth";

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

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authService.login({ login_id: email, password });
      setUser(res.user);
      setToken(res.access_token);
      localStorage.setItem("ksor_user", JSON.stringify(res.user));
      localStorage.setItem("ksor_token", res.access_token);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "이메일 또는 비밀번호가 올바르지 않습니다.",
      };
    }
  };

  const logout = () => {
    // Fire-and-forget server-side session invalidation
    if (token) {
      authService.logout(token).catch(() => {});
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem("ksor_user");
    localStorage.removeItem("ksor_token");
  };

  const updateUser = async (
    updates: Partial<User>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "로그인이 필요합니다." };

    // Call API (backend only accepts email and phone)
    if (!token) return { success: false, error: "인증 토큰이 없습니다." };
    try {
      await authService.updateProfile(
        { email: updates.email, phone: updates.phone },
        token
      );
      // updateProfile returns void; fetch fresh profile from server
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

    // Call API
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
