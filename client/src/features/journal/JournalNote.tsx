// A journal entry's note on the book page (Reading progress). Shortened to three lines until clicked;
// opened, it shows the whole note with Edit and Delete.
import { useRef, useState } from "react";
import type { Activity } from "../../api/types";
import { fmt } from "../../components/format";
import { Modal, confirmDialog, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { deleteEntryNote, editEntryNote } from "../../store/store";

const NOTE_MAX = 20000;

// "Nov 18, 2026 · +15 pages" (or just the date for a note-only entry).
const entryLabel = (a: Activity) => [fmt.date(a.session_date || a.created_at), a.pages_read > 0 ? `+${fmt.plural(a.pages_read, "page")}` : null].filter(Boolean).join(" · ");

export function JournalNote({ entry }: { entry: Activity }) {
    const [open, setOpen] = useState(false);
    const note = entry.note || "";

    const remove = async () => {
        const keepsPages = entry.pages_read > 0;
        const ok = await confirmDialog({
            title: "Delete this note?",
            text: keepsPages
                ? `The note from ${fmt.date(entry.session_date || entry.created_at)} will be deleted. The ${fmt.plural(entry.pages_read, "page")} you logged that day stay in your journal.`
                : `The note from ${fmt.date(entry.session_date || entry.created_at)} will be deleted from your journal.`
        });
        if (!ok) return;
        try {
            await deleteEntryNote(String(entry.id));
            toast("Note deleted");
        } catch (error) {
            toast((error as Error).message, { error: true });
        }
    };

    return (
        <>
            <button type="button" className="session-note-btn" aria-expanded={open}
                title={open ? "Show less" : "Show the whole note"} onClick={() => setOpen((o) => !o)}>
                <span className={`session-note${open ? " is-open" : ""}`}>{note}</span>
            </button>
            {open
                ? (
                    <span className="session-actions">
                        <button type="button" className="link-btn" onClick={() => openEditNote(entry)}>Edit</button>
                        <button type="button" className="link-btn danger-link" onClick={remove}>Delete</button>
                    </span>
                )
                : null}
        </>
    );
}

export function openEditNote(entry: Activity) {
    openDialog((done) => <EditNoteDialog entry={entry} onClose={done} />);
}

function EditNoteDialog({ entry, onClose }: { entry: Activity; onClose: () => void }) {
    const [text, setText] = useState(entry.note || "");
    const field = useRef<HTMLTextAreaElement>(null);
    return (
        <Modal title="Edit note" submitLabel="Save note" initialFocus={field} onClose={onClose}
            onSubmit={async ({ setError }) => {
                const note = text.trim();
                if (!note) return setError("Write a note, or use Delete to remove it."), false;
                if (note === (entry.note || "").trim()) return; // nothing changed
                await editEntryNote(String(entry.id), note);
                toast("Note updated");
            }}>
            <div className="stack">
                <p className="hint">{entry.book_title} · {entryLabel(entry)}</p>
                <div className="field">
                    <label htmlFor="noteText">Note</label>
                    <textarea ref={field} className="textarea" id="noteText" rows={7} maxLength={NOTE_MAX} value={text} onChange={(e) => setText(e.target.value)} />
                </div>
            </div>
        </Modal>
    );
}
