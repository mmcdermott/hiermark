import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@ham/editor/styles.css";
import "@ham/canvas/styles.css";
import "./styles.css";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
