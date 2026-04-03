import { useState } from "react";
import { Link, Outlet, useLocation, Navigate } from "react-router";
import { LayoutGrid, Users, BarChart3, FileText, LogOut, ChevronRight, Menu, ShieldCheck } from "lucide-react";
import logoImage from "@/assets/logo.png";
import { useAuth } from "@/context/AuthContext";

export function Layout() {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const isAdminRole = user?.role === "ADMIN" || user?.role === "STEERING";

  const navItems = [
    { path: "/", icon: LayoutGrid, label: "대시보드" },
    { path: "/patients", icon: Users, label: "환자 목록" },
    { path: "/analysis", icon: BarChart3, label: "성과 분석" },
    { path: "/reports", icon: FileText, label: "리포트" },
    ...(isAdminRole ? [{ path: "/admin/users", icon: ShieldCheck, label: "사용자 관리" }] : []),
  ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-600">
        <img src={logoImage} alt="KOMISS Logo" className="w-24 h-24 mx-auto" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive(item.path)
                      ? "bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Info + Logout */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-600">
        <Link
          to="/profile"
          onClick={() => setSidebarOpen(false)}
          className="block mb-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm text-gray-900 dark:text-gray-100 truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user?.role}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{user?.hospital}</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 flex-shrink-0 ml-1" />
          </div>
        </Link>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">로그아웃</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-48 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-600 flex flex-col transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img src={logoImage} alt="KOMISS Logo" className="w-8 h-8" />
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
