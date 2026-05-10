import React from "react";
import { createRoot } from "react-dom/client";
import YarnPullApp from "./yarn-pull.jsx";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root mount node.");
}

createRoot(container).render(
  <React.StrictMode>
    <YarnPullApp />
  </React.StrictMode>
);
