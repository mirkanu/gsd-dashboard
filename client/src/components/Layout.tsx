import { useState, useCallback, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar, SIDEBAR_STORAGE_KEY, loadCollapsed } from "./Sidebar";

interface LayoutProps {
  wsConnected: boolean;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export function Layout({ wsConnected }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
        } catch {}
        return next;
      });
    }
  }, [isMobile]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  const mainStyle = isMobile
    ? { marginLeft: 0, width: "100%" }
    : {
        marginLeft: collapsed ? "4.25rem" : "15rem",
        width: collapsed ? "calc(100% - 4.25rem)" : "calc(100% - 15rem)",
      };

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        wsConnected={wsConnected}
        collapsed={isMobile ? false : collapsed}
        onToggle={toggle}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onNavClick={() => isMobile && setMobileOpen(false)}
      />

      <main
        className="min-h-screen min-w-0 transition-[margin-left,width] duration-200"
        style={mainStyle}
      >
        <div className="p-6 md:p-8 max-w-full overflow-x-hidden">
          <Outlet />
        </div>
      </main>

      {/* Mobile FAB — bottom-left menu toggle */}
      {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-5 left-4 z-30 w-11 h-11 rounded-full bg-surface-1 border border-border shadow-lg flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
