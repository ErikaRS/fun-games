import React from "react";
import { createRoot } from "react-dom/client";
import { ClassicYarnPullApp, CozyYarnPullApp } from "./yarn-pull.jsx";

const UI_VERSION = __YARN_PULL_UI__;
const App = UI_VERSION === "classic" ? ClassicYarnPullApp : CozyYarnPullApp;

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root mount node.");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
