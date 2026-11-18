import { useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

// Clickable 1–5 scale (stars or chillies), same markup as rateInput() in public/js/ui.js.
export function RateInput({ kind = "star", value, onChange, label }: {
    kind?: "star" | "chili"; value: number | null; onChange: (value: number | null) => void; label: string;
}) {
    return (
        <div className={`rate-input${kind === "chili" ? " chili" : ""}`} role="radiogroup" aria-label={label}>
            {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" role="radio" className={value && i <= value ? "on" : ""}
                    aria-checked={value === i} aria-label={`${i} of 5`} onClick={() => onChange(i)}>
                    {kind === "star" ? <Icon name="star" filled /> : "🌶️"}
                </button>
            ))}
            {value
                ? <button type="button" className="link-btn clear" style={{ width: "auto", height: "auto" }} onClick={() => onChange(null)}>Clear</button>
                : null}
        </div>
    );
}

// Toggle-pill multi-select with a free-text "add your own" box.
// The chosen values keep the list's order: suggestions first, then the reader's own additions.
// With onDelete, an "Edit list" switch turns the pills into deletable chips: deleting takes a choice off
// the reader's list (and off this selection). onAdd is told about every value typed in, so a deleted
// choice typed again can be brought back; it may return the spelling to use (the deleted choice's own).
export function MultiSelect({ options, value, onChange, label, placeholder = "Add your own", onDelete, onAdd }: {
    options: string[]; value: string[]; onChange: (value: string[]) => void; label: string; placeholder?: string;
    onDelete?: (option: string) => void; onAdd?: (option: string) => string | void;
}) {
    const [added, setAdded] = useState<string[]>([]);
    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState(false);
    const all = [...new Set([...options, ...value, ...added])];
    const chosen = new Set(value);

    const remove = (opt: string) => {
        setAdded((list) => list.filter((o) => o !== opt));
        if (chosen.has(opt)) onChange(value.filter((o) => o !== opt));
        onDelete?.(opt);
    };

    const toggle = (opt: string) => {
        const next = new Set(chosen);
        if (next.has(opt)) next.delete(opt);
        else next.add(opt);
        onChange(all.filter((o) => next.has(o)));
    };

    const add = () => {
        const typed = draft.trim();
        if (!typed) return;
        const text = onAdd?.(typed) || typed;
        const existing = all.find((o) => o.toLowerCase() === text.toLowerCase());
        const pick = existing || text;
        if (!existing) setAdded((list) => [...list, text]);
        onChange([...all, ...(existing ? [] : [text])].filter((o) => o === pick || chosen.has(o)));
        setDraft("");
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            add();
        }
    };

    return (
        <div>
            <div className={`pills${editing ? " is-editing" : ""}`} role="group" aria-label={label}>
                {all.map((opt) => editing
                    ? (
                        <span key={opt} className={`pill pill-deletable${chosen.has(opt) ? " is-selected" : ""}`}>
                            {opt}
                            <button type="button" className="pill-delete" aria-label={`Delete “${opt}” from your list`} title="Delete from your list"
                                onClick={() => remove(opt)}>×</button>
                        </span>
                    )
                    : <button key={opt} type="button" className="pill" aria-pressed={chosen.has(opt)} onClick={() => toggle(opt)}>{opt}</button>)}
            </div>
            <div className="pill-add">
                <input className="input" placeholder={placeholder} aria-label={`${label}: add your own`} maxLength={60}
                    value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
                <button type="button" className="btn btn-sm" onClick={add}>Add</button>
                {onDelete
                    ? <button type="button" className="btn btn-sm btn-ghost" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit list"}</button>
                    : null}
            </div>
            {editing ? <p className="hint">Deleting a choice only takes it off your list. Books that already have it keep it.</p> : null}
        </div>
    );
}

// A labelled checkbox card, e.g. "Physical book" (class "check" in style.css).
export function CheckCard({ id, label, hint, checked, onChange }: {
    id?: string; label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void;
}) {
    return (
        <label className="check" htmlFor={id}>
            <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span>{label}{hint ? <small>{hint}</small> : null}</span>
        </label>
    );
}
