import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getFrontendRouter } from "./frontend-router";
import { applyInitialTheme } from "./lib/use-theme";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

applyInitialTheme();

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={getFrontendRouter()} />
  </StrictMode>,
);
