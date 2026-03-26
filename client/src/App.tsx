import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useCallback } from "react";
import { Layout } from "./components/Layout";
import { KanbanBoard } from "./pages/KanbanBoard";
import { Sessions } from "./pages/Sessions";
import { SessionDetail } from "./pages/SessionDetail";
import { ActivityFeed } from "./pages/ActivityFeed";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { GSD, TerminalPage } from "./pages/GSD";
import { NotFound } from "./pages/NotFound";
import { useWebSocket } from "./hooks/useWebSocket";
import { useNotifications } from "./hooks/useNotifications";
import { eventBus } from "./lib/eventBus";
import type { WSMessage } from "./lib/types";

export default function App() {
  const onMessage = useCallback((msg: WSMessage) => {
    eventBus.publish(msg);
  }, []);

  const { connected } = useWebSocket(onMessage);
  useNotifications();

  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone terminal page — no layout chrome, opens in new tab on mobile */}
        <Route path="terminal/:name" element={<TerminalPage />} />
        <Route element={<Layout wsConnected={connected} />}>
          <Route index element={<Navigate to="/gsd" replace />} />
          <Route path="kanban" element={<KanbanBoard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/:id" element={<SessionDetail />} />
          <Route path="activity" element={<ActivityFeed />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="gsd" element={<GSD />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
