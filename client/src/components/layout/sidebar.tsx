
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { useAuth } from "@/components/auth/auth-provider";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  CheckCircle,
  Package,
  Settings,
  FlaskConical,
  Landmark,
  LogOut,
  Shield,
  Users,
  ShieldOff,
} from "lucide-react";
import { useState } from "react";

const navSections = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Daily Operations",
    items: [
      { id: "daily-entry", label: "Daily Entry", icon: FileText },
      { id: "custom-mix", label: "Custom Mix Order", icon: FlaskConical },
      { id: "reconciliation", label: "Day Reconciliation", icon: CheckCircle },
      { id: "cash-mgmt", label: "Cash Management", icon: Landmark },
    ],
  },
  {
    label: "Customers",
    items: [
      { id: "customer-khata", label: "Customer Khata", icon: BookOpen },
    ],
  },
  {
    label: "Inventory",
    items: [
      { id: "purchases-stock", label: "Purchases & Stock", icon: Package },
      { id: "manage-products", label: "Manage Products", icon: Settings },
    ],
  },
  {
    label: "User Management",
    items: [
      { id: "admin-customers", label: "Customer Accounts", icon: Users },
      { id: "admin-blocked", label: "Blocked Users", icon: ShieldOff },
    ],
  },
];

export default function AppSidebar() {
  const { activePage, setActivePage } = useAppStore();
  const { user, signOut, loading: authLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
    // signOut already redirects to /login
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-slate-900 text-white p-2 rounded-lg shadow-lg"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 transition-transform duration-200 lg:translate-x-0",
          "bg-gradient-to-b from-[#101a2e] to-[#0b1322] border-r border-white/[0.06]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 h-screen flex flex-col overflow-hidden">
          {/* Brand */}
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.08] shrink-0">
            <div className="w-10 h-10 min-w-[2.5rem] rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-lg shadow-lg shadow-blue-600/30">
              🐄
            </div>
            <div>
              <div className="text-white font-extrabold text-sm leading-tight">Danish Cattle Feed</div>
              <div className="text-slate-500 text-xs font-medium">Daily Register</div>
            </div>
          </div>

          {/* Navigation - scrollable */}
          <nav className="space-y-5 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="text-[0.68rem] font-bold tracking-wider uppercase text-slate-600 mb-1.5 ml-2">
                  {section.label}
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActivePage(item.id);
                          setMobileOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                          isActive
                            ? "bg-blue-600/20 text-white font-medium"
                            : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                        )}
                      >
                        <Icon size={18} className={isActive ? "text-blue-400" : ""} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer - User Info + Logout */}
          <div className="mt-8 pt-4 border-t border-white/[0.08] space-y-3">
            {/* Admin user card */}
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 min-w-[2rem] rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-xs font-semibold truncate">
                  {authLoading ? "Loading..." : user?.name || "Admin"}
                </div>
                <div className="text-slate-500 text-[0.65rem]">Administrator</div>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              <LogOut size={18} />
              {loggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}