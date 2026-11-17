import { useEffect, useRef, useState } from "react";
import { logout } from "../api";
import { Icon } from "../components/Icon";
import { currentUser } from "../features/auth/currentUser";
import { openDeleteAccount } from "../features/auth/DeleteAccountDialog";
import { openCustomize } from "../features/theme/CustomizeDialog";

// The avatar button and its menu (same markup and ids as the vanilla index.html).
export function AccountMenu() {
    const [open, setOpen] = useState(false);
    const [user] = useState(currentUser);
    const wrap = useRef<HTMLDivElement>(null);

    // Close on a click outside the menu, or Escape.
    useEffect(() => {
        if (!open) return;
        const onClick = (event: MouseEvent) => {
            if (!wrap.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const then = (action: () => void) => () => {
        setOpen(false);
        action();
    };

    return (
        <div className="menu" ref={wrap}>
            <button type="button" className="avatar-btn" id="avatarBtn" aria-haspopup="true" aria-expanded={open} aria-label="Account menu"
                onClick={() => setOpen((o) => !o)}>
                {(user.username || user.email || "?").trim().charAt(0).toUpperCase()}
            </button>
            <div className={`menu-panel${open ? "" : " hidden"}`} id="menuPanel" role="menu">
                <div className="menu-head">
                    <strong id="menuName">{user.username || "Reader"}</strong>
                    <span id="menuEmail">{user.email || ""}</span>
                </div>
                <button type="button" className="menu-item" id="customizeBtn" role="menuitem" onClick={then(openCustomize)}>
                    <Icon name="palette" />
                    Customize look
                </button>
                <div className="menu-sep" role="separator" />
                <a href="privacy.html" className="menu-item" role="menuitem"><Icon name="shield" />Privacy policy</a>
                <a href="terms.html" className="menu-item" role="menuitem"><Icon name="file" />Terms &amp; conditions</a>
                <div className="menu-sep" role="separator" />
                <button type="button" className="menu-item" id="logoutBtn" role="menuitem" onClick={() => logout()}>
                    <Icon name="logout" />
                    Log out
                </button>
                <button type="button" className="menu-item menu-item-danger" id="deleteAccountBtn" role="menuitem" onClick={then(openDeleteAccount)}>
                    <Icon name="trash" />
                    Delete account
                </button>
            </div>
        </div>
    );
}
