// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeConsoleSuppressor } from "./utils/consoleSuppressor";

// Initialize console suppression in production
if (import.meta.env.PROD) {
  initializeConsoleSuppressor();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);