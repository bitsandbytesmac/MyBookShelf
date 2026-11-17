// Number/date formatting shared by every page (same output as fmt in public/js/ui.js).
export const fmt = {
    num: (n: number | string | null | undefined) => Number(n || 0).toLocaleString(),
    date(value: string | null | undefined) {
        if (!value) return "";
        const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    },
    relative(value: string) {
        const diff = (Date.now() - new Date(value).getTime()) / 1000;
        if (diff < 60) return "just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    },
    plural: (n: number, word: string) => `${fmt.num(n)} ${word}${n === 1 ? "" : "s"}`
};

// Google Books descriptions sometimes contain HTML; keep only the text (parsed, never inserted).
export function stripHtml(html: string | null | undefined): string {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n"), "text/html");
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

export const authorHref = (name: string) => `#/author/${encodeURIComponent(name)}`;
export const seriesHref = (name: string) => `#/series/${encodeURIComponent(name)}`;

// "A Court of Thorns and Roses · Book 2 of 5"
export function seriesLabel(book: { series: string; seriesNumber: number | null; seriesTotal: number | null }): string {
    if (!book.series) return "";
    const of = book.seriesTotal ? ` of ${book.seriesTotal}` : "";
    return book.seriesNumber ? `${book.series} · Book ${book.seriesNumber}${of}` : book.series;
}

export function initials(name: string): string {
    const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
