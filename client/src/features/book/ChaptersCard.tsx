// Chapters card on the book page (below Challenge spots and Notes): every chapter of the book, 1..chapterCount,
// with the notes written about it in "Log your reading" (newest first). Chapters without notes stay blank.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { Activity, Book } from "../../api/types";
import { fmt } from "../../components/format";
import { useStore } from "../../store/useStore";
import { openLogReading } from "../../app/actions";
import { JournalNote, type NoteChange } from "../journal/JournalNote";

export function ChaptersCard({ book }: { book: Book }) {
    // All of this book's chapter notes (the journal in the store only holds the latest entries).
    // Fetched again whenever the journal changes (a note saved, edited or deleted bumps activityVersion).
    const version = useStore((s) => s.activityVersion);
    const [notes, setNotes] = useState<Activity[] | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let live = true;
        api.getChapterNotes(book.id)
            .then((list) => { if (live) { setNotes(list); setFailed(false); } })
            .catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, [book.id, version]);

    const byChapter = useMemo(() => {
        const map = new Map<number, Activity[]>();
        for (const a of notes || []) {
            const n = Number(a.chapter);
            if (!map.has(n)) map.set(n, []);
            map.get(n)!.push(a);
        }
        return map;
    }, [notes]);

    // Apply an edit or delete at once (the refetch that follows confirms it).
    const applyChange = (entryId: Activity["id"]) => (change: NoteChange) => setNotes((list) => (list || []).flatMap((a) =>
        a.id !== entryId ? [a] : "deleted" in change ? [] : [{ ...a, note: change.note }]));

    if (!book.chapterCount) return null;
    const chapters = Array.from({ length: book.chapterCount }, (_, i) => i + 1);
    const withNotes = chapters.filter((n) => byChapter.has(n)).length;

    return (
        <section className="card card-pad chapters-card" aria-labelledby="chaptersTitle">
            <div className="review-head">
                <h3 id="chaptersTitle">Chapters</h3>
                <span className="hint">{notes ? `${withNotes} of ${fmt.plural(chapters.length, "chapter")} with notes` : ""}</span>
            </div>
            {failed ? <p className="hint">Couldn't load the chapter notes. Reload the page to try again.</p> : null}
            <ol className="chapter-list">
                {chapters.map((n) => {
                    const list = byChapter.get(n) || [];
                    return (
                        <li key={n} className={`chapter-row${list.length ? " has-notes" : ""}`}>
                            <div className="chapter-row-head">
                                <strong>Chapter {n}</strong>
                                <button type="button" className="link-btn" aria-label={`Add a note on Chapter ${n}`}
                                    onClick={() => openLogReading(book.id, { chapter: n })}>Add a note</button>
                            </div>
                            {list.length
                                ? (
                                    <ul className="chapter-notes">
                                        {list.map((a) => (
                                            <li key={a.id}>
                                                <span className="chapter-note-date">{fmt.date(a.session_date || a.created_at)}</span>
                                                <JournalNote entry={a} onChange={applyChange(a.id)} />
                                            </li>
                                        ))}
                                    </ul>
                                )
                                : null}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
