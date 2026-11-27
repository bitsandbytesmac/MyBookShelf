// "Log your reading": pick a book you're reading, then save a journal entry (note + date + the page
// you're on). Saving moves the book's progress on and feeds the streak and recent entries.
// Same behaviour and markup as public/js/logReading.js.
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { Book } from "../../api/types";
import { Cover, ProgressBar, StatusBadge } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { Icon } from "../../components/Icon";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { today } from "../../domain/dates";
import { percent } from "../../domain/readingRules";
import { getBook, getState, nextUpBooks, updateBook } from "../../store/store";

// chapter: open with that chapter already picked (the book page's "Add a note" on a chapter).
export function openLogReading(bookId?: string, { chapter = null }: { chapter?: number | null } = {}) {
    if (!getState().loaded) return toast("Your shelf is still loading…");
    if (bookId) return openLogForm(getBook(bookId), chapter);
    openDialog((done) => <PickDialog onClose={done} />);
}

function openLogForm(book: Book | undefined, chapter: number | null = null) {
    if (!book) return toast("That book isn't on your shelf anymore.", { error: true });
    openDialog((done) => <LogForm book={book} initialChapter={chapter} onClose={done} />);
}

// Books on the go first; if there are none, offer the Next Up / To Be Read pile to start one.
function pickableBooks(): { title: string; books: Book[] } {
    const state = getState();
    const reading = state.books.filter((b) => b.status === "Reading" || b.status === "Paused");
    if (reading.length) return { title: "Currently reading", books: reading };
    const next = nextUpBooks(state);
    const rest = state.books.filter((b) => b.status === "To Be Read" && !next.includes(b));
    return { title: "Start something new", books: [...next, ...rest] };
}

function PickDialog({ onClose }: { onClose: () => void }) {
    const [{ title, books }] = useState(pickableBooks);
    const closeRef = useRef<(() => void) | null>(null);
    const picked = useRef<Book | null>(null);

    return (
        <Modal title="Log your reading" closeRef={closeRef}
            onClose={() => {
                onClose();
                if (picked.current) openLogForm(picked.current);
            }}>
            {books.length
                ? (
                    <div className="stack">
                        <p className="hint">{title === "Currently reading" ? "Which book did you read?" : "You're not reading anything right now. Pick a book to start."}</p>
                        <ul className="log-pick" aria-label={title}>
                            {books.map((book) => {
                                const showPct = book.totalPages && book.status !== "To Be Read";
                                return (
                                    <li key={book.id}>
                                        <button type="button" className="log-pick-book"
                                            aria-label={`${book.title} by ${book.author}${showPct ? `, ${percent(book)}%` : ""}`}
                                            onClick={() => {
                                                picked.current = book;
                                                closeRef.current?.();
                                            }}>
                                            <Cover book={book} size="md" />
                                            <strong>{book.title}</strong>
                                            <small>{book.author}</small>
                                            {showPct ? <span className="log-pick-progress"><ProgressBar value={percent(book)} thin />{`${percent(book)}%`}</span> : null}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )
                : <div className="empty-sm">Your shelf is empty. Add a book first, then log your reading here.</div>}
        </Modal>
    );
}

function LogForm({ book, initialChapter, onClose }: { book: Book; initialChapter: number | null; onClose: () => void }) {
    const total = book.totalPages || 0;
    const [page, setPage] = useState(String(book.currentPage || 0));
    const [note, setNote] = useState("");
    const [date, setDate] = useState(today);
    const [chapter, setChapter] = useState<number | null>(initialChapter && book.chapterCount && initialChapter <= book.chapterCount ? initialChapter : null);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    // Chapters that already have notes get a dot in the picker.
    const [noted, setNoted] = useState<Set<number>>(new Set());
    useEffect(() => {
        if (!book.chapterCount) return;
        let live = true;
        api.getChapterNotes(book.id).then((list) => { if (live) setNoted(new Set(list.map((a) => Number(a.chapter)))); }).catch(() => {});
        return () => { live = false; };
    }, [book.id, book.chapterCount]);

    const n = Number(page) || 0;
    const read = n - book.currentPage;
    const pct = total ? Math.min(100, Math.round((n / total) * 100)) : null;
    const previewText = [pct !== null ? `${pct}%` : null, read > 0 ? `+${fmt.plural(read, "page")} today` : null].filter(Boolean).join(" · ") || "Same page as last time";

    const step = (delta: number) => {
        const next = Math.max(0, (Number(page) || 0) + delta);
        setPage(String(total ? Math.min(total, next) : next));
    };

    return (
        <Modal title="Log your reading" submitLabel="Save to journal" busyLabel="Saving…" initialFocus={noteRef} onClose={onClose}
            onSubmit={async ({ setError }) => {
                const value = Number(page);
                const text = note.trim();
                if (!Number.isInteger(value) || value < 0) return setError("The page must be a whole number."), false;
                if (total && value > total) return setError(`This book has ${fmt.num(total)} pages.`), false;
                if (!date) return setError("Pick the date you read."), false;
                if (date > today()) return setError("The date can't be in the future."), false;
                if (chapter && !text) return setError(`Write your note on Chapter ${chapter}, or tap the chapter again to unpick it.`), false;
                if (value === book.currentPage && !text) return setError("Move your page on or write a note to save an entry."), false;

                const saved = await updateBook(book.id, { currentPage: value }, { session: { date, note: text, chapter } });
                toast(saved.status === "Read" && book.status !== "Read" ? "Finished! Time to write your review 🎉"
                    : chapter ? `Saved to Chapter ${chapter}` : "Saved to your journal");
            }}>
            <div className="stack">
                <div className="log-book">
                    <Cover book={book} size="sm" />
                    <div><strong>{book.title}</strong><small>{book.author}</small><StatusBadge status={book.status} /></div>
                </div>
                {book.chapterCount
                    ? (
                        <div className="field">
                            <span className="label" id="logChapterLabel">Chapter <span className="label-hint">(optional: tap one to file your note under it)</span></span>
                            <div className="chapter-picks" role="group" aria-labelledby="logChapterLabel">
                                {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((n) => (
                                    <button key={n} type="button" className={`chapter-pick${noted.has(n) ? " has-notes" : ""}`} aria-pressed={chapter === n}
                                        aria-label={`Chapter ${n}${noted.has(n) ? " (has notes)" : ""}`} onClick={() => setChapter((c) => (c === n ? null : n))}>{n}</button>
                                ))}
                            </div>
                        </div>
                    )
                    : null}
                <div className="log-cols">
                    <div className="field">
                        <label htmlFor="logNote">{chapter ? `Notes on Chapter ${chapter}` : "Notes"}</label>
                        <textarea ref={noteRef} className="textarea" id="logNote" rows={5} maxLength={20000} placeholder="Thoughts, feelings, favourite moments, theories…"
                            value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <div className="field log-progress">
                        <span className="label">Current progress</span>
                        <div className="field">
                            <label htmlFor="logDate">Date</label>
                            <input className="input" id="logDate" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        <div className="field">
                            <label htmlFor="logPage">{total ? `Page (of ${fmt.num(total)})` : "Page"}</label>
                            <div className="stepper">
                                <button type="button" className="stepper-btn" aria-label="One page back" onClick={() => step(-1)}>−</button>
                                <input className="input log-page" id="logPage" type="number" min={0} inputMode="numeric" aria-label="Page I'm on"
                                    max={total || undefined} value={page} onChange={(e) => setPage(e.target.value)} />
                                <button type="button" className="stepper-btn" aria-label="One page forward" onClick={() => step(1)}><Icon name="plus" /></button>
                            </div>
                        </div>
                        <div className="log-preview">
                            {pct !== null ? <ProgressBar value={pct} thin /> : null}
                            <span>{previewText}</span>
                        </div>
                        {total ? null : <p className="hint">Add the book's total pages in Edit details to see your percentage.</p>}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
