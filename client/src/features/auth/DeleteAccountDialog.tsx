import { useRef, useState } from "react";
import { api } from "../../api";
import { Modal, openDialog } from "../../components/Modal";

export function openDeleteAccount() {
    openDialog((done) => <DeleteAccountDialog onClose={done} />);
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
    const [password, setPassword] = useState("");
    const input = useRef<HTMLInputElement>(null);
    return (
        <Modal title="Delete your account?" size="sm" danger submitLabel="Delete forever" busyLabel="Deleting…" onClose={onClose}
            onSubmit={async ({ setError }) => {
                if (!password) {
                    setError("Enter your password to confirm.");
                    input.current?.focus();
                    return false;
                }
                // A wrong password is a 400 (not 401), so it shows here instead of logging out.
                await api.deleteAccount(password);
                localStorage.removeItem("user");
                localStorage.removeItem("theme");
                sessionStorage.setItem("authNotice", "Your account and all your books have been deleted.");
                location.replace("/login.html");
                return false; // keep the dialog up while the page changes
            }}>
            <div className="stack">
                <p>This permanently deletes your account and everything in it: every book, note, review, quote, reading goal and uploaded cover. It can't be undone.</p>
                <div className="field">
                    <label htmlFor="deletePassword">Enter your password to confirm</label>
                    <input ref={input} className="input" type="password" id="deletePassword" autoComplete="current-password" required
                        value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
            </div>
        </Modal>
    );
}
