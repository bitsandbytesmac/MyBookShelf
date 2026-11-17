import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject, type FormEvent } from "react";
import { Icon } from "./Icon";

// A <dialog> with the same markup as modal() in public/js/ui.js:
//   dialog[aria-label] > form.dialog-form > .dialog-head (h2 + Close) / .dialog-body (+ .form-error) / .dialog-foot
// onSubmit may return false to keep the dialog open; a thrown error is shown in the form.
// onClose runs once the dialog has closed (Close, Cancel, Escape, a click on the backdrop, or after saving).

export type SubmitContext = { setError: (message: string) => void; close: () => void };

type ModalProps = {
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: "sm";
    onSubmit?: (ctx: SubmitContext) => Promise<boolean | void> | boolean | void;
    submitLabel?: string;
    busyLabel?: string;
    danger?: boolean;
    initialFocus?: RefObject<HTMLElement | null>;
    onClose: () => void;
    // Lets the content close the dialog itself (e.g. footer buttons).
    closeRef?: { current: (() => void) | null };
};

export function Modal({
    title, children, footer, size, onSubmit, submitLabel = "Save", busyLabel = "Saving…", danger = false,
    initialFocus, onClose, closeRef
}: ModalProps) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const close = () => {
        if (dialog.current?.open) dialog.current.close();
    };
    if (closeRef) closeRef.current = close;

    useEffect(() => {
        const node = dialog.current!;
        // Guard: React runs effects twice in development (StrictMode).
        if (!node.open) node.showModal();
        const first = initialFocus?.current || node.querySelector<HTMLElement>(".dialog-body input, .dialog-body textarea, .dialog-body select");
        first?.focus();
        // Runs once, when the dialog opens.
    }, []);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!onSubmit || busy) return;
        setError("");
        setBusy(true);
        try {
            const keepOpen = (await onSubmit({ setError, close })) === false;
            if (!keepOpen) close();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog ref={dialog} className={size === "sm" ? "dialog-sm" : ""} aria-label={title} onClose={onClose}
            onClick={(event) => { if (event.target === dialog.current) close(); }}>
            <form className="dialog-form" noValidate onSubmit={submit}>
                <div className="dialog-head">
                    <h2>{title}</h2>
                    <button type="button" className="icon-btn" aria-label="Close" onClick={close}><Icon name="close" /></button>
                </div>
                <div className="dialog-body">
                    {children}
                    <p className="form-error" aria-live="polite">{error}</p>
                </div>
                {footer || onSubmit
                    ? (
                        <div className="dialog-foot">
                            {footer}
                            {onSubmit ? <button type="button" className="btn" onClick={close}>Cancel</button> : null}
                            {onSubmit
                                ? <button type="submit" className={danger ? "btn btn-danger-solid" : "btn btn-primary"} disabled={busy}>{busy ? busyLabel : submitLabel}</button>
                                : null}
                        </div>
                    )
                    : null}
            </form>
        </dialog>
    );
}

// ---------- Dialog host: open a dialog from anywhere (a button, a store event, a keyboard shortcut) ----------

type Entry = { id: number; render: (close: () => void) => ReactNode };
let entries: Entry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

// render gets `done`, which removes the dialog; pass it as the Modal's onClose.
export function openDialog(render: (done: () => void) => ReactNode) {
    const id = nextId++;
    entries = [...entries, { id, render }];
    emit();
}

const remove = (id: number) => {
    entries = entries.filter((e) => e.id !== id);
    emit();
};

export const anyDialogOpen = () => entries.length > 0;

export function DialogHost() {
    const list = useSyncExternalStore((fn) => {
        listeners.add(fn);
        return () => {
            listeners.delete(fn);
        };
    }, () => entries);
    return <>{list.map((e) => <DialogSlot key={e.id} entry={e} />)}</>;
}

function DialogSlot({ entry }: { entry: Entry }) {
    return <>{entry.render(() => remove(entry.id))}</>;
}

// "Are you sure?" with Cancel focused. Resolves true only when the reader confirms.
export function confirmDialog({ title, text, okLabel = "Delete" }: { title: string; text: string; okLabel?: string }): Promise<boolean> {
    return new Promise((resolve) => {
        openDialog((done) => <ConfirmDialog title={title} text={text} okLabel={okLabel} resolve={resolve} done={done} />);
    });
}

function ConfirmDialog({ title, text, okLabel, resolve, done }: { title: string; text: string; okLabel: string; resolve: (ok: boolean) => void; done: () => void }) {
    const closeRef = useRef<(() => void) | null>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    const answered = useRef(false);
    return (
        <Modal title={title} size="sm" closeRef={closeRef} initialFocus={cancel}
            onClose={() => {
                if (!answered.current) resolve(false);
                done();
            }}
            footer={<>
                <button ref={cancel} type="button" className="btn" onClick={() => closeRef.current?.()}>Cancel</button>
                <button type="button" className="btn btn-danger-solid" onClick={() => {
                    answered.current = true;
                    resolve(true);
                    closeRef.current?.();
                }}>{okLabel}</button>
            </>}>
            <p>{text}</p>
        </Modal>
    );
}
