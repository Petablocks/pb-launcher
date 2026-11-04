import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SplashScreen from "./components/SplashScreen";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const isSplash = params.get("window") === "splash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isSplash ? <SplashScreen /> : <App />}</React.StrictMode>,
);
