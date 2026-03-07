import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Columns3,
  FolderOpen,
  Activity,
  BarChart3,
  Settings,
  Wifi,
  WifiOff,
  Github,
  Globe,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/kanban", icon: Columns3, label: "Agent Board" },
  { to: "/sessions", icon: FolderOpen, label: "Sessions" },
  { to: "/activity", icon: Activity, label: "Activity Feed" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

interface SidebarProps {
  wsConnected: boolean;
}

export function Sidebar({ wsConnected }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-surface-1 border-r border-border flex flex-col z-30 overflow-y-auto overflow-x-hidden">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-100">Agent Dashboard</h1>
            <p className="text-[11px] text-gray-500">Claude Code Monitor</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-transparent"
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-border space-y-3">
        <div className="flex items-center gap-2 text-xs">
          {wsConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-gray-500">Disconnected</span>
            </>
          )}
          <span className="ml-auto text-gray-600">v1.0.0</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/hoangsonww"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="GitHub"
          >
            <Github className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://sonnguyenhoang.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 text-[11px]"
            title="sonnguyenhoang.com"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>sonnguyenhoang.com</span>
          </a>
        </div>
      </div>
    </aside>
  );
}
