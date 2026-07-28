import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getFrontendRouter } from "../../src/frontend-router";
import "../../src/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={getFrontendRouter()} />
  </StrictMode>,
);
