import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@hiermark/editor/styles.css";
import "@hiermark/canvas/styles.css";
import "./styles.css";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
