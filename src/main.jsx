import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { CompanionDashboard } from "./CompanionDashboard.jsx";
import "./styles.css";

const view = new URLSearchParams(window.location.search).get("window");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {view === "dashboard" ? <CompanionDashboard /> : <App />}
  </React.StrictMode>,
);
