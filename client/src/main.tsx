import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import "./styles/chatscope-theme.css";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
