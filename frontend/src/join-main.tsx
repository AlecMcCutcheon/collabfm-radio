import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { JoinRequiredPage } from "./pages/JoinRequiredPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JoinRequiredPage />
  </StrictMode>,
);
