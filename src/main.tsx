import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Fonts are bundled (fully offline — never the Google Fonts CDN at runtime).
import "@fontsource/jost/200.css";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/400-italic.css";
import "@fontsource/lora/500-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

import "katex/dist/katex.min.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/reader.css";
import "./styles/editor.css";
import "./styles/mobile.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
