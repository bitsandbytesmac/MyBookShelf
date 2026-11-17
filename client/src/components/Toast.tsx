import { useSyncExternalStore } from "react";

// Short messages in the corner ("Details saved"). Same markup as toast() in public/js/ui.js.
type ToastItem = { id: number; message: string; error: boolean };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function toast(message: string, { error = false }: { error?: boolean } = {}) {
    const item = { id: nextId++, message, error };
    toasts = [...toasts, item];
    emit();
    setTimeout(() => {
        toasts = toasts.filter((t) => t !== item);
        emit();
    }, error ? 5000 : 2800);
}

export function ToastHost() {
    const list = useSyncExternalStore((fn) => {
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    }, () => toasts);
    return (
        <div className="toasts" id="toasts" aria-live="polite">
            {list.map((t) => <div key={t.id} className={`toast${t.error ? " error" : ""}`} role={t.error ? "alert" : "status"}>{t.message}</div>)}
        </div>
    );
}
