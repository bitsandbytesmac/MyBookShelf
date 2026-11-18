// Small form pieces shared by the Add, Edit details and Review dialogs (same markup as public/js/dialogs.js).
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import type { Book } from "../../api/types";
import { MultiSelect } from "../../components/inputs";

export function SelectField({ id, label, options, value, onChange, blank }: {
    id: string; label: string; options: readonly string[]; value: string; onChange: (value: string) => void; blank?: string;
}) {
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <select className="select" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
                {blank ? <option value="">{blank}</option> : null}
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}

export function TextField({ id, label, value, onChange, ...attrs }: {
    id: string; label: string; value: string; onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <input className="input" id={id} autoComplete="off" {...attrs} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
    );
}

// Long pill lists fold away so the form stays short; the summary shows how many are picked.
export function Foldout({ label, children, count }: { label: string; children: ReactNode; count: number }) {
    return (
        <details className="foldout">
            <summary>{label}<span className="fold-count">{count ? `${count} selected` : ""}</span></summary>
            <div className="foldout-body">{children}</div>
        </details>
    );
}

// A tag list (genres, tropes, …) as a folded multi-select.
export function TagFoldout({ label, groupLabel = label, placeholder, options, value, onChange, onDelete, onAdd }: {
    label: string; groupLabel?: string; placeholder: string; options: string[]; value: string[]; onChange: (value: string[]) => void;
    onDelete?: (option: string) => void; onAdd?: (option: string) => string | void;
}) {
    return (
        <Foldout label={label} count={value.length}>
            <MultiSelect options={options} value={value} onChange={onChange} label={groupLabel} placeholder={placeholder} onDelete={onDelete} onAdd={onAdd} />
        </Foldout>
    );
}

export const sameBook = (a: Pick<Book, "title" | "author">, b: Pick<Book, "title" | "author">) =>
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
    a.author.trim().toLowerCase() === b.author.trim().toLowerCase();

// Keeps the first value a component was given (for dialogs that edit a snapshot of a book).
export function useInitial<T>(value: T): T {
    const [initial] = useState(value);
    return initial;
}
