import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./ui/App";
import { isNative } from "./native";
import { startI18n } from "./i18n";
import "./styles.css";

if (!isNative) registerSW({ immediate: true });
startI18n();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
