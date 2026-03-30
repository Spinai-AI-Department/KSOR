import { createContext, useContext, useState, ReactNode } from "react";

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
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPw: string, newPw: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Demo accounts (mutable for password changes)
const DEMO_ACCOUNTS: { email: string; password: string; user: User }[] = [
  {
    email: "admin@ksor.kr",
    password: "ksor2024",
    user: {
      id: "1",
      name: "김민준",
      role: "책임 연구원",
      hospital: "서울대학교병원",
      email: "admin@ksor.kr",
      phone: "010-1234-5678",
      specialty: "신경외과",
      licenseNumber: "12345",
      department: "신경외과",
    },
  },
  {
    email: "doctor@ksor.kr",
    password: "doctor123",
    user: {
      id: "2",
      name: "이수연",
      role: "신경외과 전문의",
      hospital: "세브란스병원",
      email: "doctor@ksor.kr",
      phone: "010-9876-5432",
      specialty: "신경외과",
      licenseNumber: "67890",
      department: "신경외과",
    },
  },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem("ksor_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    await new Promise((res) => setTimeout(res, 800));
    const account = DEMO_ACCOUNTS.find(
      (a) => a.email === email && a.password === password
    );
    if (account) {
      setUser(account.user);
      localStorage.setItem("ksor_user", JSON.stringify(account.user));
      return { success: true };
    }
    return { success: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("ksor_user");
  };

  const updateUser = async (
    updates: Partial<User>
  ): Promise<{ success: boolean; error?: string }> => {
    await new Promise((res) => setTimeout(res, 600));
    if (!user) return { success: false, error: "로그인이 필요합니다." };

    const updated = { ...user, ...updates };
    // Sync back to demo accounts
    const account = DEMO_ACCOUNTS.find((a) => a.user.id === user.id);
    if (account) account.user = updated;

    setUser(updated);
    localStorage.setItem("ksor_user", JSON.stringify(updated));
    return { success: true };
  };

  const changePassword = async (
    currentPw: string,
    newPw: string
  ): Promise<{ success: boolean; error?: string }> => {
    await new Promise((res) => setTimeout(res, 600));
    if (!user) return { success: false, error: "로그인이 필요합니다." };

    const account = DEMO_ACCOUNTS.find((a) => a.user.id === user.id);
    if (!account) return { success: false, error: "계정 정보를 찾을 수 없습니다." };
    if (account.password !== currentPw)
      return { success: false, error: "현재 비밀번호가 올바르지 않습니다." };
    if (newPw.length < 6)
      return { success: false, error: "새 비밀번호는 6자 이상이어야 합니다." };

    account.password = newPw;
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, login, logout, updateUser, changePassword }}
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
