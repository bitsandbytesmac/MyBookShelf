import { useState, type ReactNode } from "react";
import type { Book } from "../api/types";
import { Icon } from "./Icon";
import { fmt, initials } from "./format";

// Dark enough for white titles to pass WCAG AA (4.5:1).
const FALLBACK_COLORS = ["#ae5e5e", "#687c4b", "#a06657", "#657b53", "#a7644d", "#8f6f4e", "#8e6a7f", "#617c63"];

function hashString(text: string): number {
    let hash = 0;
    for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return Math.abs(hash);
}
const colourFor = (text: string) => FALLBACK_COLORS[hashString(text) % FALLBACK_COLORS.length];

export type CoverSize = "xs" | "sm" | "md" | "lg";
type CoverBook = { title?: string; author?: string; coverUrl?: string | null };

// The cover image, or a coloured card with the title when there's none (or it fails to load).
export function Cover({ book, size = "md", children }: { book: CoverBook; size?: CoverSize; children?: ReactNode }) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const showImage = book.coverUrl && failedUrl !== book.coverUrl;
    return (
        <div className={`cover cover-${size}`}>
            {showImage
                ? <img src={book.coverUrl!} alt="" loading="lazy" onError={() => setFailedUrl(book.coverUrl!)} />
                : (
                    <div className="cover-fallback" style={{ background: colourFor(book.title || "") }}>
                        <span className="cf-title">{book.title || "Untitled"}</span>
                        <span className="cf-author">{book.author || ""}</span>
                    </div>
                )}
            {children}
        </div>
    );
}

export function ProgressBar({ value, thin = false }: { value: number; thin?: boolean }) {
    return (
        <div className={`progress${thin ? " progress-thin" : ""}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${value}%` }} />
        </div>
    );
}

const STATUS_CLASS: Record<string, string> = { "To Be Read": "st-tbr", Reading: "st-reading", Read: "st-read", Paused: "st-paused", DNF: "st-dnf" };
export function StatusBadge({ status }: { status: string }) {
    return <span className={`badge ${STATUS_CLASS[status] || ""}`}>{status}</span>;
}

const SERIES_STATUS_CLASS: Record<string, string> = { Completed: "st-read", "In progress": "st-reading", "Not started": "st-tbr" };
export function SeriesBadge({ status }: { status: string }) {
    return <span className={`badge ${SERIES_STATUS_CLASS[status] || ""}`}>{status}</span>;
}

export function AuthorAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
    return (
        <span className={`author-avatar author-avatar-${size}`} aria-hidden="true" style={{ background: colourFor(name.toLowerCase()) }}>
            {initials(name)}
        </span>
    );
}

// Overlapping covers, e.g. on author and series cards.
export function CoverStack({ books, max = 4 }: { books: Book[]; max?: number }) {
    return (
        <div className="cover-stack" aria-hidden="true">
            {books.slice(0, max).map((b) => <Cover key={b.id} book={b} size="xs" />)}
            {books.length > max ? <span className="cover-more">+{books.length - max}</span> : null}
        </div>
    );
}

export function Stars({ rating }: { rating: number }) {
    return (
        <span className="stars" role="img" aria-label={`${rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => <Icon key={i} name="star" filled className={i > rating ? "off" : undefined} />)}
        </span>
    );
}

export function Chilis({ spice }: { spice: number }) {
    return (
        <span className="chilis" role="img" aria-label={`Spice ${spice} out of 5`}>
            {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i > spice ? "off" : ""} aria-hidden="true">🌶️</span>)}
        </span>
    );
}

// ---------- Book Shelf (Library shelf view, Physical Books) ----------

// One book standing on the shelf: its cover, a heart if it's a favourite, and a progress strip while reading.
export function ShelfBook({ book }: { book: Book }) {
    const reading = (book.status === "Reading" || book.status === "Paused") && book.totalPages > 0;
    const pct = reading ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0;
    const label = [
        book.title, book.author, book.status,
        reading ? `${pct}%` : null,
        book.status === "Read" && book.dateFinished ? `finished ${fmt.date(book.dateFinished)}` : null
    ].filter(Boolean).join(" · ");

    return (
        <a className="shelf-book" href={`#/book/${book.id}`} aria-label={label} title={label}>
            <Cover book={book} size="sm" />
            {book.isFavorite ? <span className="shelf-fav" aria-hidden="true"><Icon name="heart" filled /></span> : null}
            {reading ? <span className="shelf-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span> : null}
        </a>
    );
}

// Leafy vine with fairy lights across the top of the bookcase (decoration only, hidden from screen readers).
function ShelfVine() {
    return (
        <div className="shelf-vine" aria-hidden="true">
            <span className="vine-leaves" />
            <span className="vine-glow"><span className="vine-lights vine-lights-a" /></span>
            <span className="vine-glow"><span className="vine-lights vine-lights-b" /></span>
        </div>
    );
}

// Wooden bookcase: a plank under every row of books.
export function Bookcase({ books, emptyText = "Nothing on this shelf yet." }: { books: Book[]; emptyText?: string }) {
    return (
        <div className={`bookcase${books.length ? "" : " is-empty"}`}>
            <ShelfVine />
            {books.length
                ? (
                    <div className="shelf" role="list" aria-label="Book Shelf">
                        {books.map((b) => <div key={b.id} role="listitem" className="shelf-slot"><ShelfBook book={b} /></div>)}
                    </div>
                )
                : <div className="shelf shelf-empty"><p>{emptyText}</p></div>}
        </div>
    );
}

export function LoadingSkeleton() {
    return (
        <div>
            <div className="skeleton" style={{ height: "40px", width: "280px", marginBottom: "28px" }} />
            <div className="skeleton" style={{ height: "120px", marginBottom: "16px" }} />
            <div className="skeleton" style={{ height: "240px" }} />
        </div>
    );
}
