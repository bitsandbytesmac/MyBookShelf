import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/style.css";
import { AuthPage, type AuthPageName } from "./features/auth/AuthPages";

// One entry for the four sign-in pages (login, register, forgot-password, reset-password).
// Each page's HTML says which one it is: <div id="root" data-page="login">.
const root = document.getElementById("root")!;

createRoot(root).render(
    <StrictMode>
        <AuthPage page={root.dataset.page as AuthPageName} />
    </StrictMode>
);
