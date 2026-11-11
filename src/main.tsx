import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SplashScreen from "./components/SplashScreen";
// Fonts are bundled locally: the app CSP blocks remote stylesheets and players may be offline.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const isSplash = params.get("window") === "splash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isSplash ? <SplashScreen /> : <App />}</React.StrictMode>,
);
