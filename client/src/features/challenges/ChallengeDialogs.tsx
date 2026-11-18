// Challenge dialogs: create/edit a challenge, edit a spot's matching rules, the spot panel (book in the
// spot + matching books from the library + new book ideas), the "fill from finished books" review, and
// the "you unlocked spots" prompt shown when a book is finished. Same behaviour and markup as
// public/js/challengeDialogs.js. Every matching rule comes from domain/challengeMatch.ts.
import { useRef, useState, type ReactNode } from "react";
import { api } from "../../api";
import type { Book, Challenge, ChallengeItem, Criteria } from "../../api/types";
import { Cover, StatusBadge } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { Icon } from "../../components/Icon";
import { MultiSelect } from "../../components/inputs";
import { Modal, confirmDialog, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import {
    challengeProgress, hasCriteria, inWindow, matchSpot, proposeFills, searchQueryForSpot, suggestionsForSpot,
    unlocksForFinishedBook, type Match, type UnlockGroup
} from "../../domain/challengeMatch";
import { AGE_CATEGORIES, FORMATS } from "../../domain/constants";
import { today } from "../../domain/dates";
import { tagOptions } from "../../domain/readingRules";
import { assignSpots, createBook, createChallenge, getBook, getChallenge, getState, updateChallenge } from "../../store/store";
import { bookFromGoogle } from "../books/googleBooks";
import { Fold, MatchBadge, PillToggles, ReasonChips, RuleChips, challengeHref } from "./chips";
import { TEMPLATES } from "./templates";

async function run(action: () => Promise<unknown>, message?: string) {
    try {
        await action();
        if (message) toast(message);
    } catch (error) {
        toast((error as Error).message, { error: true });
    }
}

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) => (
    <div className="field">
        <label htmlFor={id}>{label}</label>
        {children}
        {hint ? <span className="hint">{hint}</span> : null}
    </div>
);

const AutoMatchBox = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
    <label className="check" htmlFor="chAuto">
        <input type="checkbox" id="chAuto" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>Match books automatically<small>When you finish a book, show the spots it unlocks</small></span>
    </label>
);

// Lets a dialog close itself, then do something once it's gone (open another dialog, save, …).
function useCloseThen() {
    const closeRef = useRef<(() => void) | null>(null);
    const then = useRef<(() => void) | null>(null);
    return {
        closeRef,
        closeThen: (action?: () => void) => {
            then.current = action || null;
            closeRef.current?.();
        },
        afterClose: () => then.current?.()
    };
}

// ---------- Create / edit a challenge ----------

export function openCreateChallenge() {
    openDialog((done) => <CreateChallengeDialog onClose={done} />);
}

const YEAR = new Date().getFullYear();

function CreateChallengeDialog({ onClose }: { onClose: () => void }) {
    const [key, setKey] = useState("genres");
    const [name, setName] = useState(TEMPLATES.genres.name);
    const [kind, setKind] = useState(TEMPLATES.genres.description);
    const [starts, setStarts] = useState(`${YEAR}-01-01`);
    const [ends, setEnds] = useState(`${YEAR}-12-31`);
    const [auto, setAuto] = useState(true);
    const [spots, setSpots] = useState("");
    const nameRef = useRef<HTMLInputElement>(null);
    const created = useRef<string | null>(null);

    const chooseTemplate = (next: string) => {
        const t = TEMPLATES[next];
        // Keep anything the reader typed; only swap text that came from the previous template.
        if (!name.trim() || Object.values(TEMPLATES).some((x) => x.name === name)) setName(t.name);
        if (!kind.trim() || Object.values(TEMPLATES).some((x) => x.description === kind)) setKind(t.description);
        setKey(next);
    };

    const t = TEMPLATES[key];
    const ruled = t.spots.filter((s) => hasCriteria(s.criteria)).length;
    const preview = key === "custom" ? ""
        : `${fmt.plural(t.spots.length, "spot")}: ${t.spots.slice(0, 6).map((s) => s.label).join(", ")}${t.spots.length > 6 ? "…" : ""}. `
        + (ruled ? "Each spot has matching rules, so finished books fill it automatically." : "You choose the book for each spot.");

    return (
        <Modal title="New challenge" submitLabel="Create challenge" initialFocus={nameRef}
            onClose={() => {
                onClose();
                // Books already finished may fit right away.
                const id = created.current;
                const saved = id ? getChallenge(id) : null;
                if (saved && proposeFills(saved, getState().books).length) setTimeout(() => openFillReview(saved.id), 50);
            }}
            onSubmit={async ({ setError }) => {
                if (!name.trim()) return setError("Give your challenge a title."), false;
                if (starts && ends && ends < starts) return setError("The end date can't be before the start date."), false;
                const items: ChallengeItem[] = key === "custom"
                    ? spots.split("\n").map((l) => l.trim()).filter(Boolean).map((label) => ({ label, bookId: null }))
                    : TEMPLATES[key].spots.map((s) => ({ ...s, bookId: null }));
                if (!items.length) return setError("Add at least one spot."), false;
                if (items.length > 200) return setError("That's more than 200 spots."), false;

                const saved = await createChallenge({
                    name: name.trim(), description: kind.trim(),
                    startsOn: starts || null, endsOn: ends || null, autoMatch: auto, items
                });
                created.current = saved.id;
                toast("Challenge created");
                location.hash = challengeHref(saved.id);
            }}>
            <div className="stack">
                <Field id="chTemplate" label="Start from">
                    <select className="select" id="chTemplate" value={key} onChange={(e) => chooseTemplate(e.target.value)}>
                        {Object.entries(TEMPLATES).map(([k, tpl]) => <option key={k} value={k}>{tpl.label}</option>)}
                    </select>
                </Field>
                <p className="hint template-preview">{preview}</p>
                <Field id="chName" label="Challenge title">
                    <input ref={nameRef} className="input" id="chName" maxLength={120} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field id="chKind" label="What kind of challenge is it?">
                    <textarea className="textarea" id="chKind" rows={2} maxLength={1000} placeholder="e.g. Read one book from each genre" value={kind} onChange={(e) => setKind(e.target.value)} />
                </Field>
                <div className="field-row">
                    <Field id="chStarts" label="Starts"><input className="input" id="chStarts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
                    <Field id="chEnds" label="Ends"><input className="input" id="chEnds" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
                </div>
                <span className="hint">Books finished between these dates count. Clear both for a challenge with no dates.</span>
                <div className={`field${key === "custom" ? "" : " hidden"}`}>
                    <label htmlFor="chSpots">Spots</label>
                    <textarea className="textarea" id="chSpots" rows={6} placeholder={"One spot per line, e.g.\nA book set by the sea\nA debut novel\nA book with a map"}
                        value={spots} onChange={(e) => setSpots(e.target.value)} />
                    <span className="hint">You can add matching rules to each spot afterwards.</span>
                </div>
                <AutoMatchBox checked={auto} onChange={setAuto} />
            </div>
        </Modal>
    );
}

export function openEditChallenge(challenge: Challenge) {
    openDialog((done) => <EditChallengeDialog challenge={challenge} onClose={done} />);
}

function EditChallengeDialog({ challenge, onClose }: { challenge: Challenge; onClose: () => void }) {
    const [name, setName] = useState(challenge.name);
    const [kind, setKind] = useState(challenge.description);
    const [starts, setStarts] = useState(challenge.startsOn || "");
    const [ends, setEnds] = useState(challenge.endsOn || "");
    const [auto, setAuto] = useState(challenge.autoMatch !== false);
    const nameRef = useRef<HTMLInputElement>(null);

    return (
        <Modal title="Edit challenge" size="sm" submitLabel="Save" initialFocus={nameRef} onClose={onClose}
            onSubmit={async ({ setError }) => {
                if (!name.trim()) return setError("Give your challenge a title."), false;
                if (starts && ends && ends < starts) return setError("The end date can't be before the start date."), false;
                await updateChallenge(challenge.id, { name: name.trim(), description: kind.trim(), startsOn: starts || null, endsOn: ends || null, autoMatch: auto });
                toast("Challenge saved");
            }}>
            <div className="stack">
                <Field id="chName" label="Challenge title">
                    <input ref={nameRef} className="input" id="chName" maxLength={120} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field id="chKind" label="What kind of challenge is it?">
                    <textarea className="textarea" id="chKind" rows={2} maxLength={1000} value={kind} onChange={(e) => setKind(e.target.value)} />
                </Field>
                <div className="field-row">
                    <Field id="chStarts" label="Starts"><input className="input" id="chStarts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
                    <Field id="chEnds" label="Ends"><input className="input" id="chEnds" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
                </div>
                <AutoMatchBox checked={auto} onChange={setAuto} />
            </div>
        </Modal>
    );
}

// ---------- A spot's matching rules ----------

// index === null adds a new spot.
export function openSpotEditor(challengeId: string, index: number | null = null) {
    if (!getChallenge(challengeId)) return;
    openDialog((done) => <SpotEditor challengeId={challengeId} index={index} onClose={done} />);
}

type TagKey = "genres" | "tropes" | "themes" | "settings" | "characters";
const TAG_FOLDS: { key: TagKey; label: string }[] = [
    { key: "genres", label: "Genres" }, { key: "tropes", label: "Tropes" }, { key: "themes", label: "Themes & keywords" },
    { key: "settings", label: "Setting" }, { key: "characters", label: "Characters" }
];

function SpotEditor({ challengeId, index, onClose }: { challengeId: string; index: number | null; onClose: () => void }) {
    const [item] = useState<Pick<ChallengeItem, "label" | "criteria">>(() => index === null ? { label: "", criteria: {} } : getChallenge(challengeId)!.items[index]);
    const c: Criteria = item.criteria || {};
    const [label, setLabel] = useState(item.label);
    const [tags, setTags] = useState<Record<TagKey, string[]>>({
        genres: c.genres || [], tropes: c.tropes || [], themes: c.themes || [], settings: c.settings || [], characters: c.characters || []
    });
    const [options] = useState<Record<TagKey, string[]>>(() => {
        const books = getState().books;
        return {
            genres: [...new Set([...tagOptions(books, "genres"), ...tagOptions(books, "subgenres")])],
            tropes: tagOptions(books, "tropes"), themes: tagOptions(books, "themes"),
            settings: tagOptions(books, "settings"), characters: tagOptions(books, "characters")
        };
    });
    const [ages, setAges] = useState(c.ageCategory || []);
    const [formats, setFormats] = useState(c.format || []);
    const [titleMode, setTitleMode] = useState<string>(c.title?.mode || "");
    const [titleValue, setTitleValue] = useState(c.title?.value || "");
    const [author, setAuthor] = useState(c.author || "");
    const [nums, setNums] = useState({
        minPages: c.minPages != null ? String(c.minPages) : "", maxPages: c.maxPages != null ? String(c.maxPages) : "",
        yearFrom: c.yearFrom != null ? String(c.yearFrom) : "", yearTo: c.yearTo != null ? String(c.yearTo) : ""
    });
    const labelRef = useRef<HTMLInputElement>(null);
    const num = (key: keyof typeof nums, placeholder: string, id: string) => (
        <input className="input" id={id} type="number" min={0} inputMode="numeric" placeholder={placeholder}
            value={nums[key]} onChange={(e) => setNums((n) => ({ ...n, [key]: e.target.value }))} />
    );

    return (
        <Modal title={index === null ? "Add a spot" : "Spot rules"} submitLabel={index === null ? "Add spot" : "Save rules"} initialFocus={labelRef} onClose={onClose}
            onSubmit={async ({ setError }) => {
                const text = label.trim();
                if (!text) return setError("Write the spot's prompt."), false;
                const int = (value: string, name: string): { value?: number; error?: string } => {
                    if (value.trim() === "") return { value: undefined };
                    const n = Number(value);
                    return Number.isInteger(n) && n >= 0 ? { value: n } : { error: `${name} must be a whole number.` };
                };
                const parts = {
                    minPages: int(nums.minPages, "Minimum pages"), maxPages: int(nums.maxPages, "Maximum pages"),
                    yearFrom: int(nums.yearFrom, "Published from"), yearTo: int(nums.yearTo, "Published to")
                };
                const bad = Object.values(parts).find((p) => p.error);
                if (bad) return setError(bad.error!), false;
                if (titleMode && !titleValue.trim()) return setError("Type the title text, or set Title to “Any title”."), false;

                const criteria: Criteria = {
                    ...tags, ageCategory: ages, format: formats,
                    ...(titleMode ? { title: { mode: titleMode as "startsWith" | "contains", value: titleValue.trim(), ignoreArticles: true } } : {}),
                    ...(author.trim() ? { author: author.trim() } : {}),
                    ...Object.fromEntries(Object.entries(parts).filter(([, p]) => p.value !== undefined).map(([k, p]) => [k, p.value]))
                };
                for (const k of Object.keys(criteria) as (keyof Criteria)[]) {
                    const v = criteria[k];
                    if (Array.isArray(v) && !v.length) delete criteria[k];
                }
                if (criteria.minPages && criteria.maxPages && criteria.maxPages < criteria.minPages) return setError("Maximum pages can't be less than minimum pages."), false;

                const fresh = getChallenge(challengeId)!;
                const items = index === null
                    ? [...fresh.items, { label: text, bookId: null, criteria }]
                    : fresh.items.map((it, i) => (i === index ? { ...it, label: text, criteria } : it));
                await updateChallenge(challengeId, { items });
                toast(index === null ? "Spot added" : "Spot rules saved");
            }}>
            <div className="stack spot-editor">
                <Field id="spLabel" label="Prompt">
                    <input ref={labelRef} className="input" id="spLabel" maxLength={200} placeholder="e.g. A book set by the sea" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} />
                </Field>
                <p className="hint">A book has to meet every rule you set; inside a list, any one tag is enough. Leave every rule empty to pick books by hand (for things like cover colours).</p>
                {TAG_FOLDS.map((f) => (
                    <Fold key={f.key} label={f.label} count={tags[f.key].length}>
                        <MultiSelect options={options[f.key]} value={tags[f.key]} label={f.label} placeholder={`Other ${f.label.toLowerCase()}`}
                            onChange={(value) => setTags((t) => ({ ...t, [f.key]: value }))} />
                    </Fold>
                ))}
                <div className="field-row">
                    <Field id="spTitleMode" label="Title">
                        <select className="select" id="spTitleMode" value={titleMode} onChange={(e) => setTitleMode(e.target.value)}>
                            <option value="">Any title</option>
                            <option value="startsWith">Starts with</option>
                            <option value="contains">Contains</option>
                        </select>
                    </Field>
                    <Field id="spTitleValue" label="Title text">
                        <input className="input" id="spTitleValue" maxLength={60} placeholder="e.g. B or Night" autoComplete="off" value={titleValue} onChange={(e) => setTitleValue(e.target.value)} />
                    </Field>
                </div>
                <Field id="spAuthor" label="Author name contains">
                    <input className="input" id="spAuthor" maxLength={120} placeholder="Any author" autoComplete="off" value={author} onChange={(e) => setAuthor(e.target.value)} />
                </Field>
                <div className="field-row">
                    <div className="field"><span className="label">Pages</span><div className="range-pair">{num("minPages", "Min", "spMinPages")}<span>to</span>{num("maxPages", "Max", "spMaxPages")}</div></div>
                    <div className="field"><span className="label">Published</span><div className="range-pair">{num("yearFrom", "From", "spYearFrom")}<span>to</span>{num("yearTo", "To", "spYearTo")}</div></div>
                </div>
                <div className="field"><span className="label">Age category</span><PillToggles options={AGE_CATEGORIES} value={ages} onChange={setAges} label="Age category" /></div>
                <div className="field"><span className="label">Format</span><PillToggles options={FORMATS} value={formats} onChange={setFormats} label="Format" /></div>
            </div>
        </Modal>
    );
}

// ---------- The spot panel: its book, matches from the library, new ideas ----------

export function openSpot(challengeId: string, index: number) {
    if (!getChallenge(challengeId)?.items[index]) return;
    openDialog((done) => <SpotPanel challengeId={challengeId} index={index} onClose={done} />);
}

type Idea = ReturnType<typeof bookFromGoogle>;

function SpotPanel({ challengeId, index, onClose }: { challengeId: string; index: number; onClose: () => void }) {
    // A snapshot of the spot when the panel opens (the vanilla panel worked the same way).
    const [snapshot] = useState(() => {
        const state = getState();
        const challenge = getChallenge(challengeId)!;
        const item = challenge.items[index];
        const used = new Set(challenge.items.filter((_, i) => i !== index).map((it) => it.bookId).filter(Boolean));
        return {
            challenge, item,
            book: item.bookId ? getBook(item.bookId) || null : null,
            groups: suggestionsForSpot(challenge, index, state.books),
            pickable: state.books.filter((b) => !used.has(b.id) && b.id !== item.bookId && b.status !== "DNF")
                .sort((a, b) => Number(b.status === "Read") - Number(a.status === "Read") || a.title.localeCompare(b.title))
        };
    });
    const { challenge, item, book, groups, pickable } = snapshot;
    const manual = !hasCriteria(item.criteria);
    const [picked, setPicked] = useState("");
    const [ideas, setIdeas] = useState<{ state: "idle" | "loading" | "done"; list: Idea[]; message: string }>({ state: "idle", list: [], message: "" });
    const [adding, setAdding] = useState<string | null>(null);
    const { closeRef, closeThen, afterClose } = useCloseThen();

    const assign = (bookId: string | null, message: string) => closeThen(() => run(() => assignSpots(challengeId, { [index]: bookId }), message));

    async function loadIdeas() {
        setIdeas({ state: "loading", list: [], message: "Searching Google Books…" });
        try {
            const books = getState().books;
            const results = (await api.searchGoogleBooks(searchQueryForSpot(item))).slice(0, 6).map((r) => bookFromGoogle(r, books));
            const owned = new Set(books.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`));
            const fresh = results.filter((b) => !owned.has(`${b.title.toLowerCase()}|${b.author.toLowerCase()}`));
            setIdeas({ state: "done", list: fresh, message: fresh.length ? "" : "No new ideas found. Try adding a theme or genre to the spot's rules." });
        } catch (error) {
            setIdeas({ state: "done", list: [], message: (error as Error).message });
        }
    }

    async function addIdea(idea: Idea, key: string) {
        setAdding(key);
        try {
            const saved = await createBook({ ...idea, status: "To Be Read" });
            await assignSpots(challengeId, { [index]: saved.id });
            closeThen();
            toast(`"${saved.title}" added to your TBR and planned for this spot`);
        } catch (error) {
            setAdding(null);
            toast((error as Error).message, { error: true });
        }
    }

    const bookRow = (entry: { book: Book; match: Match | null }, action: ReactNode) => (
        <li key={entry.book.id} className="match-row">
            <a href={`#/book/${entry.book.id}`} className="match-cover" onClick={() => closeThen()} aria-label={entry.book.title}><Cover book={entry.book} size="xs" /></a>
            <div className="match-info">
                <strong>{entry.book.title}</strong>
                <span className="match-meta">{entry.book.author} · <StatusBadge status={entry.book.status} /></span>
                {entry.match ? <ReasonChips match={entry.match} /> : null}
            </div>
            {action}
        </li>
    );

    const section = (title: string, hint: string, entries: { book: Book; match: Match }[], makeAction: (e: { book: Book }) => ReactNode) => entries.length
        ? (
            <section className="match-section">
                <h3>{title}<span className="count">{entries.length}</span></h3>
                {hint ? <p className="hint">{hint}</p> : null}
                <ul className="match-list">{entries.slice(0, 8).map((e) => bookRow(e, makeAction(e)))}</ul>
            </section>
        )
        : null;

    let current: ReactNode = null;
    if (book) {
        const counts = book.status === "Read";
        const match = matchSpot(book, item.criteria);
        current = (
            <section className={`spot-current${counts ? " is-done" : ""}`}>
                <span className="label">{counts ? "In this spot · counts" : "In this spot · planned"}</span>
                <ul className="match-list">{bookRow({ book, match: match.status === "manual" ? null : match },
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => assign(null, "Book removed from the spot")}>Remove</button>)}</ul>
                {counts ? null : <p className="hint">It counts as soon as you finish it.</p>}
                {counts && !inWindow(book, challenge) ? <p className="hint">Finished outside the challenge dates. It still counts because you chose it.</p> : null}
            </section>
        );
    } else if (!item.bookId && item.done) {
        current = <section className="spot-current is-done"><span className="label">Marked done (from before smart challenges)</span></section>;
    }

    const removeSpot = async () => {
        if (getChallenge(challengeId)!.items.length === 1) return toast("A challenge needs at least one spot.", { error: true });
        closeThen(async () => {
            if (await confirmDialog({ title: "Remove this spot?", text: `"${item.label}" will be removed from the challenge.`, okLabel: "Remove" })) {
                run(() => updateChallenge(challengeId, { items: getChallenge(challengeId)!.items.filter((_, i) => i !== index) }), "Spot removed");
            }
        });
    };

    const nothing = !manual && !groups.ready.length && !groups.planned.length && !groups.possible.length;
    const finished = pickable.filter((b) => b.status === "Read");
    const unfinished = pickable.filter((b) => b.status !== "Read");

    return (
        <Modal title={item.label} closeRef={closeRef}
            onClose={() => {
                onClose();
                afterClose();
            }}
            footer={<>
                <button type="button" className="link-btn left danger-link" onClick={removeSpot}>Remove spot</button>
                <button type="button" className="btn" onClick={() => closeThen(() => openSpotEditor(challengeId, index))}><Icon name="edit" />{manual ? "Add rules" : "Edit rules"}</button>
            </>}>
            <div className="stack spot-panel">
                <div className="spot-rules"><span className="label">{challenge.name}</span><RuleChips criteria={item.criteria} /></div>
                {current}
                {section(book ? "Replace with a finished book" : "Ready to count", "Finished books that meet every rule.", groups.ready,
                    (e) => <button type="button" className="btn btn-sm btn-primary" onClick={() => assign(e.book.id, `"${e.book.title}" counts for ${item.label}`)}>Count this</button>)}
                {section("On your TBR or reading now", "These fit. Plan one and it counts when you finish it.", groups.planned,
                    (e) => <button type="button" className="btn btn-sm" onClick={() => assign(e.book.id, `"${e.book.title}" planned for ${item.label}`)}>Plan this</button>)}
                {section("Possible matches", "Something in the summary suggests these fit, but their tags don't say so. Check before using one.", groups.possible,
                    (e) => <button type="button" className="btn btn-sm btn-ghost" onClick={() => assign(e.book.id, `"${e.book.title}" added to ${item.label}`)}>Use anyway</button>)}
                {nothing ? <p className="empty-sm">No book on your shelf fits these rules yet. Find new ideas below, or add tags to your books in Edit details.</p> : null}
                <div className="field spot-manual">
                    <label htmlFor="spotPick">{manual ? "Choose the book for this spot" : "Or choose any book yourself"}</label>
                    <div className="spot-manual-row">
                        <select className="select" id="spotPick" value={picked} onChange={(e) => setPicked(e.target.value)}>
                            <option value="">Choose a book…</option>
                            {finished.length ? <optgroup label="Finished">{finished.map((b) => <option key={b.id} value={b.id}>{`${b.title} — ${b.author}`}</option>)}</optgroup> : null}
                            {unfinished.length ? <optgroup label="Not finished yet (planned)">{unfinished.map((b) => <option key={b.id} value={b.id}>{`${b.title} — ${b.author}`}</option>)}</optgroup> : null}
                        </select>
                        <button type="button" className="btn btn-sm" onClick={() => picked && assign(picked, "Book added to the spot")}>Use</button>
                    </div>
                </div>
                <div className="spot-discover">
                    <button type="button" className="btn btn-sm" disabled={ideas.state === "loading"} onClick={loadIdeas}><Icon name="search" />Find new books for this spot</button>
                    <div className="spot-ideas">
                        {ideas.message ? <p className="hint">{ideas.message}</p> : null}
                        {ideas.list.length
                            ? (
                                <ul className="match-list">
                                    {ideas.list.map((b, i) => {
                                        const key = `${i}-${b.title}`;
                                        return (
                                            <li key={key} className="match-row">
                                                <span className="match-cover"><Cover book={b} size="xs" /></span>
                                                <div className="match-info">
                                                    <strong>{b.title}</strong>
                                                    <span className="match-meta">{[b.author, b.publishedYear].filter(Boolean).join(" · ")}</span>
                                                    {b.genres.length ? <span className="reason-chips">{b.genres.map((g) => <span key={g} className="reason-chip is-possible">{g}</span>)}</span> : null}
                                                </div>
                                                <button type="button" className="btn btn-sm" disabled={adding === key} onClick={() => addIdea(b, key)}><Icon name="plus" />Add to TBR</button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )
                            : null}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

// ---------- Fill open spots from books already finished ----------

export function openFillReview(challengeId: string) {
    const challenge = getChallenge(challengeId);
    if (!challenge) return;
    const proposals = proposeFills(challenge, getState().books);
    if (!proposals.length) return toast("No finished books fit the open spots yet.");
    openDialog((done) => <FillReview challenge={challenge} proposals={proposals} onClose={done} />);
}

function FillReview({ challenge, proposals, onClose }: { challenge: Challenge; proposals: ReturnType<typeof proposeFills<Book>>; onClose: () => void }) {
    const [checked, setChecked] = useState(() => proposals.map(() => true));
    return (
        <Modal title="Books you've already read fit!" submitLabel="Count them" onClose={onClose}
            onSubmit={async () => {
                const chosen = Object.fromEntries(proposals.filter((_, i) => checked[i]).map((p) => [p.index, p.book.id]));
                if (!Object.keys(chosen).length) return;
                await assignSpots(challenge.id, chosen);
                toast(`${fmt.plural(Object.keys(chosen).length, "spot")} unlocked 🎉`);
            }}>
            <div className="stack">
                <p className="hint">{`These finished books meet every rule of an open spot in “${challenge.name}”. Untick any you don't want to count.`}</p>
                <ul className="match-list">
                    {proposals.map((p, i) => (
                        <li key={`${p.index}-${p.book.id}`} className="match-row is-pick">
                            <label className="pick-box">
                                <input type="checkbox" checked={checked[i]} aria-label={`${challenge.items[p.index].label}: ${p.book.title}`}
                                    onChange={(e) => setChecked((list) => list.map((v, n) => (n === i ? e.target.checked : v)))} />
                            </label>
                            <span className="match-cover"><Cover book={p.book} size="xs" /></span>
                            <div className="match-info">
                                <strong>{challenge.items[p.index].label}</strong>
                                <span className="match-meta">{p.book.title}</span>
                                <ReasonChips match={p.match} />
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </Modal>
    );
}

// ---------- "You unlocked spots": shown when a book is finished ----------

export function openUnlockDialog(book: Book) {
    const state = getState();
    const groups = unlocksForFinishedBook(book, state.challenges, state.books, today());
    if (!groups.length) return;

    if (groups.every((g) => !g.options.length)) {
        const n = groups.reduce((s, g) => s + g.completed.length, 0);
        toast(`"${book.title}" completed ${fmt.plural(n, "challenge spot")} 🎉`);
        return;
    }
    openDialog((done) => <UnlockDialog book={book} groups={groups} onClose={done} />);
}

function UnlockDialog({ book, groups, onClose }: { book: Book; groups: UnlockGroup[]; onClose: () => void }) {
    const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(
        groups.flatMap((g) => g.options.map((o) => [`${g.challenge.id}:${o.index}`, o.checked]))
    ));
    const books = getState().books;

    return (
        <Modal title="You unlocked challenge spots!" submitLabel="Count it" onClose={onClose}
            onSubmit={async () => {
                const byChallenge: Record<string, Record<number, string>> = {};
                for (const g of groups) {
                    for (const o of g.options) if (checked[`${g.challenge.id}:${o.index}`]) (byChallenge[g.challenge.id] ||= {})[o.index] = book.id;
                }
                const ids = Object.keys(byChallenge);
                if (!ids.length) return;
                for (const id of ids) await assignSpots(id, byChallenge[id]);
                const n = Object.values(byChallenge).reduce((s, o) => s + Object.keys(o).length, 0);
                toast(`${fmt.plural(n, "spot")} unlocked 🎉`);
            }}>
            <div className="stack unlock">
                <div className="unlock-book">
                    <Cover book={book} size="sm" />
                    <div><strong>{book.title}</strong><span className="hint">matches these challenge spots. Choose which ones it counts for.</span></div>
                </div>
                {groups.map((g) => {
                    const after = challengeProgress(g.challenge, books);
                    return (
                        <section key={g.challenge.id} className="unlock-group">
                            <h3>{g.challenge.name}<span className="count">{`${after.done}/${after.total}`}</span></h3>
                            {g.completed.map((i) => <p key={i} className="unlock-done"><Icon name="check" />{`${g.challenge.items[i].label}: completed (you'd planned this book)`}</p>)}
                            <ul className="match-list">
                                {g.options.map((o) => {
                                    const key = `${g.challenge.id}:${o.index}`;
                                    return (
                                        <li key={key} className="match-row is-pick">
                                            <label className="pick-box">
                                                <input type="checkbox" checked={Boolean(checked[key])} aria-label={`${g.challenge.name}: ${o.item.label}`}
                                                    onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))} />
                                            </label>
                                            <div className="match-info">
                                                <strong>{o.item.label}</strong>
                                                <MatchBadge status={o.match.status} />
                                                <ReasonChips match={o.match} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    );
                })}
                <p className="hint">Confirmed matches meet every rule from the book's own tags. Possible matches only come from words in the summary, so they're never ticked for you.</p>
            </div>
        </Modal>
    );
}
