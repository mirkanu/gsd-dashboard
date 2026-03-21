import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Columns3,
  FolderOpen,
  Activity,
  BarChart3,
  Settings,
  MapPin,
  Wifi,
  WifiOff,
  Github,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Primary nav (always visible at top) ─────────────────────────────────────
const PRIMARY_ITEMS = [
  { to: "/gsd", icon: MapPin, label: "GSD Projects" },
] as const;

// ─── Agent Dashboard submenu ──────────────────────────────────────────────────
const AGENT_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/kanban", icon: Columns3, label: "Agent Board", end: false },
  { to: "/sessions", icon: FolderOpen, label: "Sessions", end: false },
  { to: "/activity", icon: Activity, label: "Activity Feed", end: false },
  { to: "/analytics", icon: BarChart3, label: "Analytics", end: false },
] as const;

const STORAGE_KEY = "sidebar-collapsed";
const AGENTS_OPEN_KEY = "sidebar-agents-open";

function loadCollapsed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
}

function loadAgentsOpen(): boolean {
  try { return localStorage.getItem(AGENTS_OPEN_KEY) !== "false"; } catch { return false; }
}

function NavItem({
  to,
  icon: Icon,
  label,
  end = false,
  indent = false,
  collapsed = false,
  isMobile = false,
  onClick,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  indent?: boolean;
  collapsed?: boolean;
  isMobile?: boolean;
  onClick?: () => void;
}) {
  const slim = collapsed && !isMobile;
  return (
    <NavLink
      to={to}
      end={end}
      title={slim ? label : undefined}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 ${
          slim ? "justify-center px-2 py-2.5" : `px-3 py-2.5 ${indent ? "pl-7" : ""}`
        } ${
          isActive
            ? "bg-accent/10 text-accent border border-accent/20"
            : "text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-transparent"
        }`
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!slim && <span>{label}</span>}
    </NavLink>
  );
}

interface SidebarProps {
  wsConnected: boolean;
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onNavClick?: () => void;
}

export function Sidebar({ wsConnected, collapsed, onToggle, isMobile, mobileOpen, onNavClick }: SidebarProps) {
  const [agentsOpen, setAgentsOpen] = useState(loadAgentsOpen);
  const slim = collapsed && !isMobile;

  const toggleAgents = () => {
    // On collapsed desktop, expand sidebar first then open submenu
    if (slim) { onToggle(); setAgentsOpen(true); return; }
    setAgentsOpen((v) => {
      const next = !v;
      try { localStorage.setItem(AGENTS_OPEN_KEY, String(next)); } catch {}
      return next;
    });
  };

  const mobileTransform = isMobile
    ? mobileOpen ? "translate-x-0" : "-translate-x-full"
    : "";

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 bg-surface-1 border-r border-border flex flex-col z-30 overflow-y-auto overflow-x-hidden transition-[width,transform] duration-200 ${
        isMobile ? `w-60 ${mobileTransform}` : collapsed ? "w-[4.25rem]" : "w-60"
      }`}
    >
      {/* Brand */}
      <div className="px-3 py-4 border-b border-border">
        <div className={`flex items-center ${slim ? "justify-center" : "gap-3 px-2"}`}>
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-accent" />
          </div>
          {!slim && (
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-100 truncate">GSD Dashboard</h1>
              <p className="text-[11px] text-gray-500">Claude Code Monitor</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-1">
        {/* Primary items */}
        {PRIMARY_ITEMS.map(({ to, icon, label }) => (
          <NavItem
            key={to}
            to={to}
            icon={icon}
            label={label}
            collapsed={collapsed}
            isMobile={isMobile}
            onClick={onNavClick}
          />
        ))}

        {/* Divider */}
        {!slim && <div className="border-t border-border/50 my-2" />}
        {slim && <div className="my-1" />}

        {/* Agents Dashboard submenu toggle */}
        <button
          onClick={toggleAgents}
          title={slim ? "Agents Dashboard" : undefined}
          className={`flex items-center gap-3 w-full rounded-lg text-sm font-medium transition-colors duration-150 border border-transparent text-gray-400 hover:text-gray-200 hover:bg-surface-3 ${
            slim ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
          }`}
        >
          <Bot className="w-4 h-4 flex-shrink-0" />
          {!slim && (
            <>
              <span className="flex-1 text-left">Agents Dashboard</span>
              {agentsOpen
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
            </>
          )}
        </button>

        {/* Submenu items */}
        {agentsOpen && !slim && (
          <div className="space-y-0.5">
            {AGENT_ITEMS.map(({ to, icon, label, end }) => (
              <NavItem
                key={to}
                to={to}
                icon={icon}
                label={label}
                end={end}
                indent
                collapsed={collapsed}
                isMobile={isMobile}
                onClick={onNavClick}
              />
            ))}
          </div>
        )}

        {/* Divider */}
        {!slim && <div className="border-t border-border/50 my-2" />}
        {slim && <div className="my-1" />}

        {/* Settings */}
        <NavItem
          to="/settings"
          icon={Settings}
          label="Settings"
          collapsed={collapsed}
          isMobile={isMobile}
          onClick={onNavClick}
        />
      </nav>

      {/* Collapse toggle — desktop only */}
      {!isMobile && (
        <div className="px-2 py-2">
          <button
            onClick={onToggle}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-surface-3 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4 flex-shrink-0 mx-auto" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className={`px-3 py-3 border-t border-border space-y-2 ${slim ? "items-center" : ""}`}>
        <div className={`flex items-center text-xs ${slim ? "justify-center" : "gap-2"}`}>
          {wsConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              {!slim && <span className="text-emerald-400">Live</span>}
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              {!slim && <span className="text-gray-500">Disconnected</span>}
            </>
          )}
          {!slim && <span className="ml-auto text-gray-600">v1.1.0</span>}
        </div>
        {!slim && (
          <div className="flex items-center gap-3">
            <a href="https://github.com/manuelkuhs" target="_blank" rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors" title="GitHub">
              <Github className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        {slim && (
          <div className="flex justify-center">
            <a href="https://github.com/manuelkuhs" target="_blank" rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors" title="GitHub">
              <Github className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}

export { STORAGE_KEY as SIDEBAR_STORAGE_KEY, loadCollapsed };
