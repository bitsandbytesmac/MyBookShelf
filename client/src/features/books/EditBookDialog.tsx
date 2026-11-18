// "Edit details" (same fields, checks and markup as openEditBook in public/js/dialogs.js).
import { useRef, useState } from "react";
import type { Book } from "../../api/types";
import { ProgressBar } from "../../components/BookBits";
import { CheckCard } from "../../components/inputs";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { AGE_CATEGORIES, FORMATS, OWNERSHIP, STATUSES, type TagKind } from "../../domain/constants";
import { percent, tagOptions } from "../../domain/readingRules";
import { getState, updateBook } from "../../store/store";
import { CoverPicker, type CoverChoice } from "./CoverPicker";
import { SelectField, TagFoldout, TextField } from "./formBits";
import { SeriesFields, readSeries, seriesValueOf } from "./SeriesFields";

export function openEditBook(book: Book) {
    openDialog((done) => <EditBookDialog book={book} onClose={done} />);
}

// Tag lists in the order they appear; themes, setting and characters are what smart challenges match on.
const TAGS: { kind: TagKind; label: string; groupLabel?: string; placeholder: string }[] = [
    { kind: "genres", label: "Genres", placeholder: "Other genre" },
    { kind: "subgenres", label: "Sub-genres", placeholder: "Other sub-genre" },
    { kind: "tropes", label: "Tropes", placeholder: "Other trope" },
    { kind: "themes", label: "Themes & keywords", placeholder: "Other theme or keyword" },
    { kind: "settings", label: "Setting", placeholder: "Other place or time" },
    { kind: "characters", label: "Characters", placeholder: "Other character type" },
    { kind: "contentWarnings", label: "Trigger / content warnings", groupLabel: "Content warnings", placeholder: "Other warning" }
];

function EditBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
    const [f, setF] = useState({
        title: book.title, author: book.author, summary: book.summary,
        status: book.status as string, format: book.format, ownership: book.ownership, ageCategory: book.ageCategory,
        isPhysical: book.isPhysical,
        total: book.totalPages ? String(book.totalPages) : "", current: book.currentPage ? String(book.currentPage) : "",
        year: book.publishedYear != null ? String(book.publishedYear) : ""
    });
    const set = <K extends keyof typeof f>(key: K) => (value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
    const [series, setSeries] = useState(() => seriesValueOf(book));
    const [tags, setTags] = useState<Record<TagKind, string[]>>({
        genres: book.genres, subgenres: book.subgenres, tropes: book.tropes, contentWarnings: book.contentWarnings,
        themes: book.themes, settings: book.settings, characters: book.characters
    });
    // Suggestions are fixed when the dialog opens.
    const [options] = useState(() => Object.fromEntries(TAGS.map((t) => [t.kind, tagOptions(getState().books, t.kind)])) as Record<TagKind, string[]>);
    const cover = useRef<CoverChoice | null>(null);

    const pct = percent({ totalPages: Number(f.total) || 0, currentPage: Number(f.current) || 0, status: "To Be Read" });

    return (
        <Modal title="Edit details" submitLabel="Save changes" onClose={onClose}
            onSubmit={async ({ setError }) => {
                const title = f.title.trim();
                const author = f.author.trim();
                const totalPages = Number(f.total || 0);
                const currentPage = Number(f.current || 0);

                if (!title) return setError("Add a title."), false;
                if (!author) return setError("Add an author."), false;
                if (!Number.isInteger(totalPages) || totalPages < 0) return setError("Total pages must be a whole number."), false;
                if (!Number.isInteger(currentPage) || currentPage < 0) return setError("Current page must be a whole number."), false;
                if (totalPages > 0 && currentPage > totalPages) return setError("The page you're on can't be past the last page."), false;
                if (!totalPages && currentPage) return setError("Add total pages to track progress."), false;
                const s = readSeries(getState().books, series);
                if (s.error !== undefined) return setError(s.error), false;
                const publishedYear = f.year.trim() === "" ? null : Number(f.year);
                if (publishedYear !== null && (!Number.isInteger(publishedYear) || publishedYear < 0 || publishedYear > 2200)) {
                    return setError("Published year must be a year like 1999."), false;
                }

                await updateBook(book.id, {
                    title, author,
                    series: s.series, seriesNumber: s.seriesNumber, seriesTotal: s.seriesTotal,
                    summary: f.summary.trim(),
                    status: f.status as Book["status"],
                    format: f.format,
                    ownership: f.ownership,
                    isPhysical: f.isPhysical,
                    ageCategory: f.ageCategory,
                    totalPages, currentPage,
                    ...tags,
                    publishedYear,
                    coverUrl: await cover.current!.resolve()
                });
                toast("Details saved");
            }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <CoverPicker book={book} choice={cover} />
                <TextField id="eTitle" label="Title" value={f.title} onChange={set("title")} />
                <TextField id="eAuthor" label="Author" value={f.author} onChange={set("author")} />
                <SeriesFields book={book} prefix="e" value={series} onChange={setSeries} />
                <div className="field">
                    <label htmlFor="eSummary">Summary</label>
                    <textarea className="textarea" id="eSummary" rows={5} value={f.summary} onChange={(e) => set("summary")(e.target.value)} />
                </div>
                <div className="field-row-3">
                    <SelectField id="eStatus" label="Book status" options={STATUSES} value={f.status} onChange={set("status")} />
                    <SelectField id="eFormat" label="Format" options={FORMATS} value={f.format} onChange={set("format")} blank="—" />
                    <SelectField id="eOwnership" label="Status" options={OWNERSHIP} value={f.ownership} onChange={set("ownership")} blank="—" />
                </div>
                <CheckCard id="ePhysical" label="Physical book" hint="Shows it in Physical Books" checked={f.isPhysical} onChange={set("isPhysical")} />
                <div className="field-row">
                    <div className="field">
                        <label htmlFor="eTotal">Total pages</label>
                        <input className="input" id="eTotal" type="number" min={0} inputMode="numeric" value={f.total} onChange={(e) => set("total")(e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="eCurrent">Page I'm on</label>
                        <input className="input" id="eCurrent" type="number" min={0} inputMode="numeric" value={f.current} onChange={(e) => set("current")(e.target.value)} />
                    </div>
                </div>
                <div className="field">
                    <span className="label">Progress</span>
                    <div className="progress-preview"><ProgressBar value={pct} />{`${pct}%`}</div>
                </div>
                <div className="field-row">
                    <SelectField id="eAge" label="Age category" options={AGE_CATEGORIES} value={f.ageCategory} onChange={set("ageCategory")} blank="—" />
                    <div className="field">
                        <label htmlFor="eYear">Published year</label>
                        <input className="input" id="eYear" type="number" min={0} max={2200} inputMode="numeric" placeholder="e.g. 2015"
                            value={f.year} onChange={(e) => set("year")(e.target.value)} />
                    </div>
                </div>
                {TAGS.map((t) => (
                    <TagFoldout key={t.kind} label={t.label} groupLabel={t.groupLabel} placeholder={t.placeholder}
                        options={options[t.kind]} value={tags[t.kind]} onChange={(value) => setTags((prev) => ({ ...prev, [t.kind]: value }))} />
                ))}
                <p className="hint">Genres, tropes, themes, setting and characters are what your challenges match books on.</p>
            </div>
        </Modal>
    );
}
