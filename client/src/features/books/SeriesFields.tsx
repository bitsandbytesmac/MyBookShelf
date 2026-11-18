// Series name as a searchable dropdown (ARIA combobox), plus Book # and "Books in series".
// Same rules and markup as seriesFields() in public/js/dialogs.js:
//  - the list shows series that can still take a book (seriesChoicesFor), plus the book's own series;
//  - focusing or clicking shows every choice, typing filters and offers "Create series “X”";
//  - picking or typing a series you track fills in its total, unless you typed a total yourself;
//  - any name is saved in the existing spelling (canonicalSeriesName), so no near-duplicates.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Book } from "../../api/types";
import { canonicalSeriesName, findSeries, seriesChoicesFor, seriesHasRoom, type SeriesSummary } from "../../domain/shelf";
import { fmt } from "../../components/format";
import { useStore } from "../../store/useStore";

export type SeriesValue = { series: string; number: string; total: string };

export const seriesValueOf = (book: Partial<Book>): SeriesValue => ({
    series: book.series || "",
    number: book.seriesNumber != null ? String(book.seriesNumber) : "",
    total: book.seriesTotal != null ? String(book.seriesTotal) : ""
});

const seriesCount = (s: SeriesSummary) => (s.total ? `${s.onShelf}/${s.total} books` : fmt.plural(s.onShelf, "book"));

type Option = { id: string; name: string; label: string; count?: string; create?: boolean };

export function SeriesFields({ book, prefix, value, onChange }: {
    book: Partial<Book>; prefix: string; value: SeriesValue; onChange: (value: SeriesValue) => void;
}) {
    const books = useStore((s) => s.books);
    // The choices are fixed when the dialog opens (as in the vanilla app).
    const [choices] = useState(() => seriesChoicesFor(books, book));
    const [listOpen, setListOpen] = useState(false);
    const [filter, setFilter] = useState(false);
    const [active, setActive] = useState(-1);
    const typedTotal = useRef(false);
    const listRef = useRef<HTMLUListElement>(null);

    const inputId = `${prefix}Series`;
    const listId = `${prefix}SeriesOptions`;
    const hintId = `${prefix}SeriesHint`;

    const options = useMemo<Option[]>(() => {
        const typed = value.series.trim().replace(/\s+/g, " ");
        const needle = filter ? typed.toLowerCase() : "";
        const list: Option[] = choices
            .filter((c) => !needle || c.name.toLowerCase().includes(needle))
            .map((c, i) => ({ id: `${listId}-${i}`, name: c.name, label: c.name, count: seriesCount(c) }));
        // A name that isn't a series yet (in any spelling) can be created right here.
        if (filter && typed && !findSeries(books, typed)) list.push({ id: `${listId}-new`, name: typed, label: `Create series “${typed}”`, create: true });
        return list;
    }, [value.series, filter, choices, books, listId]);

    const hint = (() => {
        const typed = value.series.trim();
        const existing = typed ? findSeries(books, typed) : null;
        const isCurrent = existing && book.series && existing.key === findSeries(books, book.series)?.key;
        if (!typed) return "Leave blank if it's a standalone.";
        if (!existing) return `New series: “${canonicalSeriesName(books, typed)}” is created when you save.`;
        if (!isCurrent && !seriesHasRoom(existing)) {
            return existing.status === "Completed"
                ? `“${existing.name}” is completed. This book will still be added to it.`
                : `“${existing.name}” already has all ${existing.total} books. This book will still be added to it.`;
        }
        return `${existing.name} · ${seriesCount(existing)}`;
    })();

    // A tracked series' total fills in by itself, unless the reader typed one.
    const withName = (series: string): SeriesValue => ({
        ...value, series,
        total: typedTotal.current ? value.total : String(findSeries(books, series)?.total ?? "")
    });

    const open = (withFilter: boolean) => {
        setFilter(withFilter);
        setListOpen(true);
        setActive(-1);
    };
    const close = () => {
        setListOpen(false);
        setActive(-1);
    };
    const choose = (option: Option) => {
        onChange(withName(option.create ? canonicalSeriesName(books, option.name) : option.name));
        close();
    };

    const moveTo = (i: number) => {
        setActive(i);
        listRef.current?.children[i]?.scrollIntoView({ block: "nearest" });
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!listOpen) open(false);
            const count = listOpen ? options.length : choices.length;
            if (!count) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            moveTo(active < 0 ? (step > 0 ? 0 : count - 1) : (active + step + count) % count);
        } else if (event.key === "Enter" && listOpen && active >= 0 && options[active]) {
            event.preventDefault(); // pick the option instead of submitting the form
            choose(options[active]);
        } else if (event.key === "Escape" && listOpen) {
            event.preventDefault(); // close the list, not the dialog
            event.stopPropagation();
            close();
        } else if (event.key === "Tab") {
            close();
        }
    };

    return (
        <div className="field-row series-fields">
            <div className="field combo">
                <label htmlFor={inputId}>Series</label>
                <input className="input" id={inputId} autoComplete="off" maxLength={200} placeholder="Pick a series or type a new one"
                    role="combobox" aria-autocomplete="list" aria-expanded={listOpen} aria-controls={listId} aria-describedby={hintId}
                    aria-activedescendant={listOpen && active >= 0 ? options[active]?.id : undefined}
                    value={value.series}
                    onFocus={() => open(false)}
                    onClick={() => { if (!listOpen) open(false); }}
                    onChange={(e) => {
                        onChange(withName(e.target.value));
                        open(true);
                    }}
                    onBlur={close}
                    onKeyDown={onKeyDown} />
                <ul ref={listRef} className="combo-list" id={listId} role="listbox" aria-label="Series suggestions" hidden={!listOpen}>
                    {options.map((o, i) => (
                        <li key={o.id} id={o.id} role="option" aria-selected={i === active} className={`combo-option${o.create ? " is-create" : ""}`}
                            // mousedown, not click: keep focus in the input so the list doesn't close first
                            onMouseDown={(event) => { event.preventDefault(); choose(o); }}>
                            <span className="combo-name">{o.label}</span>
                            {o.count ? <span className="combo-count">{o.count}</span> : null}
                        </li>
                    ))}
                    {!options.length
                        ? <li className="combo-empty" role="presentation">{choices.length ? "No open series match. Type a name to create one." : "No open series yet. Type a name to create one."}</li>
                        : null}
                </ul>
                <p className="hint combo-hint" id={hintId} aria-live="polite">{hint}</p>
            </div>
            <div className="field">
                <label htmlFor={`${prefix}SeriesNo`}>Book #</label>
                <input className="input" id={`${prefix}SeriesNo`} type="number" min={0} step="any" inputMode="decimal"
                    value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} />
            </div>
            <div className="field">
                <label htmlFor={`${prefix}SeriesTotal`}>Books in series</label>
                <input className="input" id={`${prefix}SeriesTotal`} type="number" min={1} max={999} step={1} inputMode="numeric"
                    value={value.total} onChange={(e) => {
                        typedTotal.current = true;
                        onChange({ ...value, total: e.target.value });
                    }} />
            </div>
        </div>
    );
}

// Validates the series fields. Returns the values to save, or { error }.
export function readSeries(books: Book[], value: SeriesValue):
    { series: string; seriesNumber: number | null; seriesTotal: number | null; error?: undefined } | { error: string } {
    const series = canonicalSeriesName(books, value.series);
    const raw = value.number.trim();
    const rawTotal = value.total.trim();
    const seriesNumber = raw === "" ? null : Number(raw);
    const seriesTotal = rawTotal === "" ? null : Number(rawTotal);
    if (seriesNumber !== null && (!Number.isFinite(seriesNumber) || seriesNumber <= 0)) return { error: "Book # must be a positive number, like 1, 2 or 1.5." };
    if (seriesNumber !== null && !series) return { error: "Add the series name, or clear the book number." };
    if (seriesTotal !== null && (!Number.isInteger(seriesTotal) || seriesTotal < 1 || seriesTotal > 999)) return { error: "Books in series must be a whole number from 1 to 999." };
    if (seriesTotal !== null && !series) return { error: "Add the series name, or clear the number of books in it." };
    return { series, seriesNumber: series ? seriesNumber : null, seriesTotal: series ? seriesTotal : null };
}
