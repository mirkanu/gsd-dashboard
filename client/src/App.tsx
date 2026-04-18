import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useCallback } from "react";
import { Layout } from "./components/Layout";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { GSD, TerminalPage } from "./pages/GSD";
import { ServicesPage } from "./pages/ServicesPage";
import { UsagePage } from "./pages/UsagePage";
import { ConfigPage } from "./pages/ConfigPage";
import { NotFound } from "./pages/NotFound";
import { Login } from "./pages/Login";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { useAuth } from "./hooks/useAuth";
import { eventBus } from "./lib/eventBus";
import type { WSMessage } from "./lib/types";

export default function App() {
  const { authenticated, login, logout } = useAuth();

  const onMessage = useCallback((msg: WSMessage) => {
    eventBus.publish(msg);
  }, []);

  const { connected } = useWebSocket(onMessage);
  useNotifications();

  // Auth checking — show minimal spinner while probing the session
  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg
          className="animate-spin w-8 h-8 text-violet-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-label="Checking authentication"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  // Not authenticated — show login form
  if (authenticated === false) {
    return <Login onLogin={login} />;
  }

  // Authenticated — render the full dashboard
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone terminal page — no layout chrome, opens in new tab on mobile */}
        <Route path="terminal/:name" element={<TerminalPage />} />
        <Route element={<Layout wsConnected={connected} />}>
          <Route index element={<Navigate to="/gsd" replace />} />
          <Route path="kanban" element={<Navigate to="/" replace />} />
          <Route path="sessions" element={<Navigate to="/" replace />} />
          <Route path="sessions/:id" element={<Navigate to="/" replace />} />
          <Route path="activity" element={<Navigate to="/" replace />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings logout={logout} />} />
          <Route path="gsd" element={<GSD />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
