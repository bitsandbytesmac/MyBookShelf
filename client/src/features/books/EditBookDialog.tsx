// "Edit details": every field of a book, its cover and its tag lists.
import { useMemo, useRef, useState } from "react";
import type { Book } from "../../api/types";
import { ProgressBar } from "../../components/BookBits";
import { CheckCard } from "../../components/inputs";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { AGE_DEMOS, FORMATS, OWNERSHIP, STATUSES, type TagKind } from "../../domain/constants";
import { percent, tagOptions } from "../../domain/readingRules";
import { getState, setTagDeleted, updateBook } from "../../store/store";
import { useStore } from "../../store/useStore";
import { PillToggles } from "../challenges/chips";
import { CoverPicker, type CoverChoice } from "./CoverPicker";
import { SelectField, TagFoldout, TextField } from "./formBits";
import { SeriesFields, readSeries, seriesValueOf } from "./SeriesFields";

export function openEditBook(book: Book) {
    openDialog((done) => <EditBookDialog book={book} onClose={done} />);
}

// The tag lists, in the order they appear. The reader can delete choices from each list ("Edit list").
const TAGS: { kind: TagKind; label: string; groupLabel?: string; placeholder: string; listName: string }[] = [
    { kind: "genres", label: "Genres", placeholder: "Other genre", listName: "genres" },
    { kind: "subgenres", label: "Sub-genres", placeholder: "Other sub-genre", listName: "sub-genres" },
    { kind: "tropes", label: "Tropes", placeholder: "Other trope", listName: "tropes" },
    { kind: "contentWarnings", label: "Trigger / content warnings", groupLabel: "Content warnings", placeholder: "Other warning", listName: "content warnings" }
];

// A Goodreads page, e.g. https://www.goodreads.com/review/show/123 ("goodreads.com/..." gets https:// added).
// Same rule as the server, so the reader sees the problem before saving.
export function checkGoodreadsUrl(text: string): { value: string } | { error: string } {
    const t = text.trim();
    if (!t) return { value: "" };
    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    } catch {
        return { error: "The Goodreads link must be a web address, like https://www.goodreads.com/review/show/…" };
    }
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol) || !(host === "goodreads.com" || host.endsWith(".goodreads.com"))) {
        return { error: "That isn't a Goodreads link. It should start with https://www.goodreads.com/" };
    }
    return { value: url.href };
}

function EditBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
    const [f, setF] = useState({
        title: book.title, author: book.author, summary: book.summary, setting: book.setting,
        status: book.status as string, format: book.format, ownership: book.ownership,
        isPhysical: book.isPhysical, isReread: book.isReread, goodreadsUrl: book.goodreadsUrl,
        total: book.totalPages ? String(book.totalPages) : "", current: book.currentPage ? String(book.currentPage) : "",
        chapters: book.chapterCount != null ? String(book.chapterCount) : "",
        year: book.publishedYear != null ? String(book.publishedYear) : ""
    });
    const set = <K extends keyof typeof f>(key: K) => (value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
    const [ageDemos, setAgeDemos] = useState(book.ageDemos);
    const [series, setSeries] = useState(() => seriesValueOf(book));
    const [tags, setTags] = useState<Record<TagKind, string[]>>({
        genres: book.genres, subgenres: book.subgenres, tropes: book.tropes, contentWarnings: book.contentWarnings
    });
    // Choices follow the reader's list live, so a deleted one disappears at once.
    const books = useStore((s) => s.books);
    const hidden = useStore((s) => s.hiddenTags);
    const options = useMemo(() => Object.fromEntries(TAGS.map((t) => [t.kind, tagOptions(books, t.kind, hidden)])) as Record<TagKind, string[]>, [books, hidden]);
    const cover = useRef<CoverChoice | null>(null);

    // Age Demo choices, plus any older value this book already has (e.g. Middle Grade), so it can be unticked.
    const ageOptions = [...new Set([...AGE_DEMOS, ...book.ageDemos])];
    const pct = percent({ totalPages: Number(f.total) || 0, currentPage: Number(f.current) || 0, status: "To Be Read" });

    const deleteChoice = (kind: TagKind, listName: string) => async (name: string) => {
        try {
            await setTagDeleted(kind, name, true);
            toast(`“${name}” deleted from your ${listName}`);
        } catch (error) {
            toast((error as Error).message, { error: true });
        }
    };
    // Typing a deleted choice again brings it back to the list, in its own spelling ("poetry" -> "Poetry").
    const restoreChoice = (kind: TagKind) => (name: string) => {
        const deleted = getState().hiddenTags[kind].find((v) => v.toLowerCase() === name.toLowerCase());
        if (!deleted) return;
        setTagDeleted(kind, deleted, false).catch((error) => toast((error as Error).message, { error: true }));
        return deleted;
    };

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
                const chapterCount = f.chapters.trim() === "" ? null : Number(f.chapters);
                if (chapterCount !== null && (!Number.isInteger(chapterCount) || chapterCount < 1 || chapterCount > 999)) {
                    return setError("Chapters must be a whole number from 1 to 999."), false;
                }
                const goodreads = checkGoodreadsUrl(f.goodreadsUrl);
                if ("error" in goodreads) return setError(goodreads.error), false;

                await updateBook(book.id, {
                    title, author,
                    series: s.series, seriesNumber: s.seriesNumber, seriesTotal: s.seriesTotal,
                    summary: f.summary.trim(),
                    setting: f.setting.trim(),
                    status: f.status as Book["status"],
                    format: f.format,
                    ownership: f.ownership,
                    isPhysical: f.isPhysical,
                    isReread: f.isReread,
                    goodreadsUrl: goodreads.value,
                    ageDemos,
                    totalPages, currentPage, chapterCount,
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
                <div className="field">
                    <label htmlFor="eSetting">Setting</label>
                    <textarea className="textarea" id="eSetting" rows={2} maxLength={1000} placeholder="Where and when is it set? e.g. A small island in 1920s Scotland"
                        value={f.setting} onChange={(e) => set("setting")(e.target.value)} />
                </div>
                <div className="field-row-3">
                    <SelectField id="eStatus" label="Book status" options={STATUSES} value={f.status} onChange={set("status")} />
                    <SelectField id="eFormat" label="Format" options={FORMATS} value={f.format} onChange={set("format")} blank="—" />
                    <SelectField id="eOwnership" label="Status" options={OWNERSHIP} value={f.ownership} onChange={set("ownership")} blank="—" />
                </div>
                <div className="check-row">
                    <CheckCard id="ePhysical" label="Physical book" hint="Shows it in Physical Books" checked={f.isPhysical} onChange={set("isPhysical")} />
                    <CheckCard id="eReread" label="Re-read" hint="I've read this one before" checked={f.isReread} onChange={set("isReread")} />
                </div>
                <div className="field-row-3">
                    <div className="field">
                        <label htmlFor="eTotal">Total pages</label>
                        <input className="input" id="eTotal" type="number" min={0} inputMode="numeric" value={f.total} onChange={(e) => set("total")(e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="eCurrent">Page I'm on</label>
                        <input className="input" id="eCurrent" type="number" min={0} inputMode="numeric" value={f.current} onChange={(e) => set("current")(e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="eChapters">Chapters</label>
                        <input className="input" id="eChapters" type="number" min={1} max={999} inputMode="numeric" placeholder="e.g. 24"
                            value={f.chapters} onChange={(e) => set("chapters")(e.target.value)} />
                    </div>
                </div>
                <div className="field">
                    <span className="label">Progress</span>
                    <div className="progress-preview"><ProgressBar value={pct} />{`${pct}%`}</div>
                </div>
                <div className="field-row">
                    <div className="field">
                        <span className="label" id="eAgeLabel">Age Demo</span>
                        <PillToggles options={ageOptions} value={ageDemos} onChange={setAgeDemos} label="Age Demo" />
                    </div>
                    <div className="field">
                        <label htmlFor="eYear">Published year</label>
                        <input className="input" id="eYear" type="number" min={0} max={2200} inputMode="numeric" placeholder="e.g. 2015"
                            value={f.year} onChange={(e) => set("year")(e.target.value)} />
                    </div>
                </div>
                <div className="field">
                    <label htmlFor="eGoodreads">Goodreads review</label>
                    <input className="input" id="eGoodreads" type="url" inputMode="url" autoComplete="off" maxLength={500}
                        placeholder="https://www.goodreads.com/review/show/…" value={f.goodreadsUrl} onChange={(e) => set("goodreadsUrl")(e.target.value)} />
                    <span className="hint">Paste the link to your review on Goodreads.</span>
                </div>
                {TAGS.map((t) => (
                    <TagFoldout key={t.kind} label={t.label} groupLabel={t.groupLabel} placeholder={t.placeholder}
                        options={options[t.kind]} value={tags[t.kind]} onChange={(value) => setTags((prev) => ({ ...prev, [t.kind]: value }))}
                        onDelete={deleteChoice(t.kind, t.listName)} onAdd={restoreChoice(t.kind)} />
                ))}
                <p className="hint">Genres, sub-genres, tropes, setting and Age Demo are what your challenges match books on.</p>
            </div>
        </Modal>
    );
}
