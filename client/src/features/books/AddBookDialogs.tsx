// "Add a book": Google Books search, or "Add manually" (same behaviour as public/js/dialogs.js).
import { useRef, useState, type KeyboardEvent } from "react";
import { api } from "../../api";
import type { NewBook } from "../../api/types";
import { Cover } from "../../components/BookBits";
import { CheckCard } from "../../components/inputs";
import { Icon } from "../../components/Icon";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { createBook, getState } from "../../store/store";
import { useStore } from "../../store/useStore";
import { CoverPicker, type CoverChoice } from "./CoverPicker";
import { TextField, sameBook } from "./formBits";
import { fromGoogle, type GoogleBook } from "./googleBooks";
import { SeriesFields, readSeries, type SeriesValue } from "./SeriesFields";

async function addAndOpen(data: NewBook) {
    const book = await createBook({ ...data, status: "To Be Read" });
    toast(`"${book.title}" added to your To Be Read`);
    location.hash = `#/book/${book.id}`;
    return book;
}

export function openAddBook() {
    openDialog((done) => <SearchDialog onClose={done} />);
}

function openManualAdd(prefillTitle = "") {
    openDialog((done) => <ManualAddDialog prefillTitle={prefillTitle} onClose={done} />);
}

// ---------- Search ----------

function SearchDialog({ onClose }: { onClose: () => void }) {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("Search Google Books — the cover, author and summary fill in automatically.");
    const [results, setResults] = useState<GoogleBook[]>([]);
    const [searching, setSearching] = useState(false);
    const token = useRef(0);
    const queryRef = useRef<HTMLInputElement>(null);
    const closeRef = useRef<(() => void) | null>(null);
    // "Add manually" closes this dialog, then opens the manual one with what was typed.
    const thenManual = useRef<string | null>(null);

    // Only ever called when the reader asks: each search spends the Google Books quota.
    async function search() {
        const q = query.trim();
        if (!q) return queryRef.current?.focus();
        const mine = ++token.current;
        setSearching(true);
        setStatus("Searching…");
        setResults([]);
        try {
            const items = await api.searchGoogleBooks(q);
            if (mine !== token.current) return;
            if (!items.length) {
                setStatus("No matches. Try different words, or add it manually.");
                return;
            }
            setStatus("");
            setResults(items.map((item) => fromGoogle(item, getState().books)));
        } catch (error) {
            if (mine === token.current) setStatus((error as Error).message);
        } finally {
            if (mine === token.current) setSearching(false);
        }
    }

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            search();
        }
    };

    return (
        <Modal title="Add a book" initialFocus={queryRef} closeRef={closeRef}
            onClose={() => {
                onClose();
                if (thenManual.current !== null) openManualAdd(thenManual.current);
            }}
            footer={<button type="button" className="link-btn left" onClick={() => {
                thenManual.current = query.trim();
                closeRef.current?.();
            }}>Can't find it? Add manually</button>}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="search-row">
                    <input ref={queryRef} className="input" type="search" placeholder="Title, author or ISBN" aria-label="Search Google Books" autoComplete="off"
                        value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
                    <button type="button" className="btn btn-primary" disabled={searching} onClick={search}><Icon name="search" />Search</button>
                </div>
                <p className="search-status" aria-live="polite">{status}</p>
                <div className="search-results">
                    {results.map((data, i) => <SearchResult key={i} data={data} onAdded={() => closeRef.current?.()} />)}
                </div>
            </div>
        </Modal>
    );
}

function SearchResult({ data, onAdded }: { data: GoogleBook; onAdded: () => void }) {
    const [adding, setAdding] = useState(false);
    // Live: a search made before the shelf has finished loading still notices the books already on it.
    const owned = useStore((state) => state.books.some((b) => sameBook(b, data)));

    async function add() {
        setAdding(true);
        try {
            const { year: _year, ...book } = data;
            void _year;
            await addAndOpen(book);
            onAdded();
        } catch (error) {
            toast((error as Error).message, { error: true });
            setAdding(false);
        }
    }

    return (
        <div className="search-result">
            <Cover book={data} size="xs" />
            <div>
                <strong>{data.title}</strong>
                <span className="meta">{[data.author, data.year, data.totalPages ? `${data.totalPages} pages` : null].filter(Boolean).join(" · ")}</span>
                {data.series ? <span className="meta">{data.series}{data.seriesNumber ? ` #${data.seriesNumber}` : ""}</span> : null}
                {data.summary ? <p className="blurb">{data.summary}</p> : null}
            </div>
            <button type="button" className="btn btn-sm btn-primary" disabled={owned || adding} onClick={add}>
                {owned ? "On your shelf" : adding ? "Adding…" : "Add"}
            </button>
        </div>
    );
}

// ---------- Manual add ----------

function ManualAddDialog({ prefillTitle, onClose }: { prefillTitle: string; onClose: () => void }) {
    const [title, setTitle] = useState(prefillTitle);
    const [author, setAuthor] = useState("");
    const [series, setSeries] = useState<SeriesValue>({ series: "", number: "", total: "" });
    const [summary, setSummary] = useState("");
    const [pages, setPages] = useState("");
    const [isPhysical, setPhysical] = useState(false);
    const cover = useRef<CoverChoice | null>(null);

    return (
        <Modal title="Add a book manually" submitLabel="Add to To Be Read" onClose={onClose}
            onSubmit={async ({ setError }) => {
                const t = title.trim();
                const a = author.trim();
                const totalPages = Number(pages || 0);
                const books = getState().books;
                if (!t) return setError("Add a title."), false;
                if (!a) return setError("Add an author."), false;
                if (!Number.isInteger(totalPages) || totalPages < 0) return setError("Total pages must be a whole number."), false;
                if (books.some((b) => sameBook(b, { title: t, author: a }))) return setError("That book is already on your shelf."), false;
                const s = readSeries(books, series);
                if (s.error !== undefined) return setError(s.error), false;

                await addAndOpen({
                    title: t, author: a,
                    series: s.series, seriesNumber: s.seriesNumber, seriesTotal: s.seriesTotal,
                    summary: summary.trim(),
                    totalPages,
                    isPhysical,
                    coverUrl: await cover.current!.resolve()
                });
            }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <CoverPicker book={{ title, author, coverUrl: null }} choice={cover} />
                <TextField id="mTitle" label="Title" value={title} onChange={setTitle} required />
                <TextField id="mAuthor" label="Author" value={author} onChange={setAuthor} required />
                <SeriesFields book={{}} prefix="m" value={series} onChange={setSeries} />
                <div className="field">
                    <label htmlFor="mSummary">Summary</label>
                    <textarea className="textarea" id="mSummary" rows={4} placeholder="What's it about?" value={summary} onChange={(e) => setSummary(e.target.value)} />
                </div>
                <TextField id="mPages" label="Total pages" value={pages} onChange={setPages} type="number" min={0} inputMode="numeric" />
                <CheckCard id="mPhysical" label="Physical book" hint="Shows it in Physical Books" checked={isPhysical} onChange={setPhysical} />
            </div>
        </Modal>
    );
}
