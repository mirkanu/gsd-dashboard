import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, SIDEBAR_STORAGE_KEY, loadCollapsed } from "./Sidebar";

interface LayoutProps {
  wsConnected: boolean;
}

export function Layout({ wsConnected }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar wsConnected={wsConnected} collapsed={collapsed} onToggle={toggle} />
      <main
        className="min-h-screen min-w-0 transition-[margin-left,width] duration-200"
        style={{
          marginLeft: collapsed ? "4.25rem" : "15rem",
          width: collapsed ? "calc(100% - 4.25rem)" : "calc(100% - 15rem)",
        }}
      >
        <div className="p-8 max-w-full overflow-x-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
