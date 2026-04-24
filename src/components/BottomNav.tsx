import { useLocation, useNavigate } from "react-router-dom";
import { Home, List, Grid3X3, Settings } from "lucide-react";

const tabs = [
  { path: "/", label: "Home", icon: Home },
  { path: "/transactions", label: "Transactions", icon: List },
  { path: "/categories", label: "Categories", icon: Grid3X3 },
  { path: "/settings", label: "Settings", icon: Settings },
] as const;

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 z-30"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 4px)" }}
    >
      <div className="flex items-center justify-around max-w-md mx-auto h-14">
        {tabs.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              data-tour-target={path === "/settings" ? "settings-tab" : undefined}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 transition-colors ${
                active ? "text-[#4169e1]" : "text-gray-400"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
