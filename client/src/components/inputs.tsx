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
export function MultiSelect({ options, value, onChange, label, placeholder = "Add your own" }: {
    options: string[]; value: string[]; onChange: (value: string[]) => void; label: string; placeholder?: string;
}) {
    const [added, setAdded] = useState<string[]>([]);
    const [draft, setDraft] = useState("");
    const all = [...new Set([...options, ...value, ...added])];
    const chosen = new Set(value);

    const toggle = (opt: string) => {
        const next = new Set(chosen);
        if (next.has(opt)) next.delete(opt);
        else next.add(opt);
        onChange(all.filter((o) => next.has(o)));
    };

    const add = () => {
        const text = draft.trim();
        if (!text) return;
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
            <div className="pills" role="group" aria-label={label}>
                {all.map((opt) => (
                    <button key={opt} type="button" className="pill" aria-pressed={chosen.has(opt)} onClick={() => toggle(opt)}>{opt}</button>
                ))}
            </div>
            <div className="pill-add">
                <input className="input" placeholder={placeholder} aria-label={`${label}: add your own`} maxLength={60}
                    value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
                <button type="button" className="btn btn-sm" onClick={add}>Add</button>
            </div>
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
