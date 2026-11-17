import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Until the cutover there is one stylesheet, shared with the vanilla app.
import "../../public/css/style.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
