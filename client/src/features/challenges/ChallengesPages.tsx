// Challenges (#/challenges): the challenge dashboard (active / upcoming / completed, open spots, books
// from your shelf that fit them, recently unlocked spots), and one challenge (#/challenges/:id): a board
// of book-shaped spots. Same markup and behaviour as public/js/challenges.js.
import { useMemo, useState } from "react";
import type { Book, Challenge, ChallengeItem } from "../../api/types";
import { Cover, CoverStack, ProgressBar } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { Icon } from "../../components/Icon";
import { confirmDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import {
    challengeProgress, challengeState, hasCriteria, matchSpot, proposeFills, spotDone, spotOpen, suggestionsForSpot,
    type ChallengeState, type Match
} from "../../domain/challengeMatch";
import { today } from "../../domain/dates";
import { deleteChallenge } from "../../store/store";
import { useStore } from "../../store/useStore";
import { openCreateChallenge, openEditChallenge, openFillReview, openSpot, openSpotEditor } from "./ChallengeDialogs";
import { DARK_COLOURS, STATE_LABEL, challengeHref, dateRange, promptColour } from "./chips";

// The tab shown is kept while you visit a challenge and come back.
let rememberedTab: ChallengeState = "active";

type Row = { c: Challenge; st: ChallengeState; p: ReturnType<typeof challengeProgress> };

// ---------- The challenge dashboard ----------

export function ChallengesIndexPage() {
    const challenges = useStore((s) => s.challenges);
    const books = useStore((s) => s.books);
    const [tab, setTab] = useState<ChallengeState>(rememberedTab);

    const all = useMemo<Row[]>(() => {
        const day = today();
        return challenges.map((c) => ({ c, st: challengeState(c, books, day), p: challengeProgress(c, books) }));
    }, [challenges, books]);
    const by = (st: ChallengeState) => all.filter((x) => x.st === st);
    const active = by("active");
    const totals = active.reduce((t, x) => ({ done: t.done + x.p.done, total: t.total + x.p.total }), { done: 0, total: 0 });

    const head = (
        <div className="page-head">
            <div>
                <h1>Challenges</h1>
                <p>{all.length ? "Your challenges fill themselves as you finish books that fit." : "Set reading challenges and let your finished books fill them"}</p>
            </div>
            <button className="btn btn-primary" type="button" onClick={openCreateChallenge}><Icon name="plus" />New challenge</button>
        </div>
    );

    if (!all.length) {
        return (
            <div>
                {head}
                <div className="card empty">
                    <h3>No challenges yet</h3>
                    <p>Pick a template like Genre Explorer, A to Z or Trope Bingo, or write your own spots. Each spot has rules, and books that fit are matched for you.</p>
                    <button className="btn btn-primary" type="button" onClick={openCreateChallenge}>Create a challenge</button>
                </div>
            </div>
        );
    }

    const tabs: ChallengeState[] = ["active", "upcoming", "completed", ...(by("ended").length ? ["ended" as const] : [])];
    const shownTab = tabs.includes(tab) ? tab : "active";
    const shown = by(shownTab);
    const activeChallenges = active.map((x) => x.c);

    const tile = (label: string, value: number | string, sub: string) => (
        <div className="card dash-card dash-stat stat-tile">
            <span className="dash-stat-label">{label}</span>
            <span className="dash-stat-value">{typeof value === "number" ? fmt.num(value) : value}</span>
            <span className="dash-stat-sub">{sub}</span>
        </div>
    );

    return (
        <div>
            {head}
            <div className="stat-summary">
                {tile("Active", active.length, "challenges running")}
                {tile("Completed", by("completed").length, "challenges finished")}
                {tile("Spots filled", `${totals.done}/${totals.total}`, "in active challenges")}
                {tile("Open spots", totals.total - totals.done, "waiting for a book")}
            </div>
            <section className="section">
                <div className="status-tabs" role="tablist" aria-label="Challenge status">
                    {tabs.map((t) => (
                        <button key={t} type="button" role="tab" className={shownTab === t ? "active" : ""} aria-selected={shownTab === t}
                            onClick={() => setTab((rememberedTab = t))}>
                            {STATE_LABEL[t]}<span className="count">{by(t).length}</span>
                        </button>
                    ))}
                </div>
                {shown.length
                    ? <div className="challenge-grid">{shown.map((x) => <ChallengeCard key={x.c.id} row={x} books={books} />)}</div>
                    : <div className="card empty-sm">{`No ${STATE_LABEL[shownTab].toLowerCase()} challenges.`}</div>}
            </section>
            {active.length
                ? (
                    <div className="dash-grid section challenge-discovery">
                        <OpenSpotsCard challenges={activeChallenges} books={books} />
                        <RecommendedCard challenges={activeChallenges} books={books} />
                    </div>
                )
                : null}
            <RecentlyUnlocked challenges={challenges} books={books} />
        </div>
    );
}

function ChallengeCard({ row: { c, st, p }, books }: { row: Row; books: Book[] }) {
    const byId = new Map(books.map((b) => [b.id, b]));
    const finishedBooks = c.items.filter((it) => spotDone(it, books) && it.bookId).map((it) => byId.get(it.bookId!)).filter((b): b is Book => Boolean(b));
    return (
        <a className={`card challenge-card is-${st}`} href={challengeHref(c.id)}>
            <div className="challenge-card-title">
                <h3>{c.name}</h3>
                {st === "completed" ? <span className="badge st-read"><Icon name="check" />Completed</span>
                    : st === "upcoming" ? <span className="badge st-tbr">Upcoming</span>
                        : st === "ended" ? <span className="badge st-dnf">Ended</span> : null}
            </div>
            <p className="challenge-dates">{dateRange(c)}</p>
            {c.description ? <p className="sub">{c.description}</p> : null}
            {finishedBooks.length ? <CoverStack books={finishedBooks} max={6} /> : null}
            <div className="series-progress">
                <ProgressBar value={p.percent} thin />
                <small>{`${p.done}/${p.total} spots · ${p.percent}%`}</small>
            </div>
        </a>
    );
}

// Open spots across active challenges, with how many books on the shelf fit each.
function OpenSpotsCard({ challenges, books }: { challenges: Challenge[]; books: Book[] }) {
    const rows = useMemo(() => {
        const list: { c: Challenge; item: ChallengeItem; index: number; ready: number; planned: number; possible: number }[] = [];
        for (const c of challenges) {
            c.items.forEach((item, index) => {
                if (!spotOpen(item, books)) return;
                const g = suggestionsForSpot(c, index, books);
                list.push({ c, item, index, ready: g.ready.length, planned: g.planned.length + (item.bookId ? 1 : 0), possible: g.possible.length });
            });
        }
        return list.sort((a, b) => b.ready - a.ready || b.planned - a.planned || b.possible - a.possible);
    }, [challenges, books]);

    return (
        <section className="card dash-card" aria-labelledby="openSpotsTitle">
            <div className="dash-card-head"><h2 id="openSpotsTitle">Unfilled spots</h2><span className="hint">{fmt.plural(rows.length, "spot")}</span></div>
            {rows.length
                ? (
                    <ul className="open-spots">
                        {rows.slice(0, 8).map((r) => (
                            <li key={`${r.c.id}-${r.index}`}>
                                <button type="button" className="open-spot" onClick={() => openSpot(r.c.id, r.index)}>
                                    <span className="open-spot-text"><strong>{r.item.label}</strong><small>{r.c.name}</small></span>
                                    <span className="open-spot-counts">
                                        {r.ready ? <span className="count-chip is-ready">{`${r.ready} ready`}</span> : null}
                                        {r.planned ? <span className="count-chip">{`${r.planned} on TBR`}</span> : null}
                                        {r.possible ? <span className="count-chip is-possible">{`${r.possible} possible`}</span> : null}
                                        {!r.ready && !r.planned && !r.possible ? <span className="count-chip is-none">{hasCriteria(r.item.criteria) ? "find books" : "pick a book"}</span> : null}
                                    </span>
                                    <Icon name="arrow" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )
                : <p className="dash-empty">Every spot is filled. 🎉</p>}
        </section>
    );
}

// Books on the TBR / reading now that would fill the most open spots.
function RecommendedCard({ challenges, books }: { challenges: Challenge[]; books: Book[] }) {
    const list = useMemo(() => {
        const fits = new Map<string, { book: Book; spots: { c: Challenge; item: ChallengeItem; index: number; match: Match }[] }>();
        for (const c of challenges) {
            const used = new Set(c.items.map((it) => it.bookId).filter(Boolean));
            c.items.forEach((item, index) => {
                if (!spotOpen(item, books) || item.bookId || !hasCriteria(item.criteria)) return;
                for (const book of books) {
                    if (book.status === "Read" || book.status === "DNF" || used.has(book.id)) continue;
                    const match = matchSpot(book, item.criteria);
                    if (match.status !== "confirmed") continue;
                    if (!fits.has(book.id)) fits.set(book.id, { book, spots: [] });
                    fits.get(book.id)!.spots.push({ c, item, index, match });
                }
            });
        }
        return [...fits.values()].sort((a, b) => b.spots.length - a.spots.length || a.book.title.localeCompare(b.book.title)).slice(0, 5);
    }, [challenges, books]);

    return (
        <section className="card dash-card" aria-labelledby="recoTitle">
            <div className="dash-card-head"><h2 id="recoTitle">Recommended from your shelf</h2></div>
            {list.length
                ? (
                    <ul className="reco-list">
                        {list.map(({ book, spots }) => (
                            <li key={book.id}>
                                <a className="reco" href={`#/book/${book.id}`}>
                                    <Cover book={book} size="sm" />
                                    <span className="reco-text">
                                        <strong>{book.title}</strong>
                                        <small>{`${book.status} · fits ${fmt.plural(spots.length, "spot")}`}</small>
                                        <span className="reason-chips">{spots.slice(0, 3).map((s) => <span key={`${s.c.id}-${s.index}`} className="reason-chip">{`${s.c.name}: ${s.item.label}`}</span>)}</span>
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                )
                : <p className="dash-empty">None of your TBR books fits an open spot yet. Open a spot to find new ideas.</p>}
        </section>
    );
}

// Spots filled most recently with a finished book.
function RecentlyUnlocked({ challenges, books }: { challenges: Challenge[]; books: Book[] }) {
    const unlocked = useMemo(() => {
        const byId = new Map(books.map((b) => [b.id, b]));
        const list: { c: Challenge; item: ChallengeItem; book: Book; when: string; key: string }[] = [];
        for (const c of challenges) {
            c.items.forEach((item, i) => {
                const book = item.bookId ? byId.get(item.bookId) : null;
                if (!book || book.status !== "Read") return;
                const when = [item.assignedAt?.slice(0, 10), book.dateFinished].filter((v): v is string => Boolean(v)).sort().pop() || "";
                list.push({ c, item, book, when, key: `${c.id}-${i}` });
            });
        }
        return list.sort((a, b) => b.when.localeCompare(a.when));
    }, [challenges, books]);
    if (!unlocked.length) return null;

    return (
        <section className="section">
            <div className="section-head"><h2>Recently unlocked</h2></div>
            <ul className="unlocked-list">
                {unlocked.slice(0, 6).map((u) => (
                    <li key={u.key}>
                        <a className="unlocked" href={challengeHref(u.c.id)}>
                            <Cover book={u.book} size="sm" />
                            <span className="unlocked-check" aria-hidden="true"><Icon name="check" /></span>
                            <span className="unlocked-text">
                                <strong>{u.item.label}</strong>
                                <small>{u.c.name}</small>
                                <small>{u.book.title}{u.when ? ` · ${fmt.date(u.when)}` : ""}</small>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// ---------- One challenge: the board ----------

export function ChallengeBoardPage({ id }: { id: string }) {
    const challenge = useStore((s) => s.challenges.find((c) => c.id === String(id)));
    const books = useStore((s) => s.books);
    const back = <a className="back-link" href="#/challenges"><Icon name="back" />Challenges</a>;

    if (!challenge) {
        return (
            <div>
                {back}
                <div className="card empty">
                    <h3>Challenge not found</h3>
                    <p>It may have been deleted.</p>
                    <a className="btn" href="#/challenges">All challenges</a>
                </div>
            </div>
        );
    }

    const p = challengeProgress(challenge, books);
    const st = challengeState(challenge, books, today());
    const fills = proposeFills(challenge, books).length;

    const remove = async () => {
        const ok = await confirmDialog({ title: "Delete this challenge?", text: `"${challenge.name}" and its spots will be removed. Your books aren't affected.` });
        if (!ok) return;
        try {
            await deleteChallenge(challenge.id);
            location.hash = "#/challenges";
            toast("Challenge deleted");
        } catch (error) {
            toast((error as Error).message, { error: true });
        }
    };

    return (
        <div>
            {back}
            <section className="card challenge-board">
                <div className="board-tools">
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => openEditChallenge(challenge)}><Icon name="edit" />Edit</button>
                    <button className="icon-btn" type="button" aria-label="Delete challenge" title="Delete" onClick={remove}><Icon name="trash" /></button>
                </div>
                <h1 className="board-title">{challenge.name}</h1>
                {challenge.description ? <p className="board-kind">{challenge.description}</p> : null}
                <p className="board-dates">{dateRange(challenge)} · {STATE_LABEL[st]}{challenge.autoMatch === false ? " · automatic matching off" : ""}</p>
                <div className="board-progress">
                    <ProgressBar value={p.percent} />
                    <span className="board-count">{`${p.done}/${p.total} · ${p.percent}%`}</span>
                </div>
                {st === "completed" ? <p className="board-done">Challenge complete! 🎉</p> : null}
                {fills
                    ? <button type="button" className="btn btn-sage board-fill" onClick={() => openFillReview(challenge.id)}><Icon name="check" />{`${fmt.plural(fills, "spot")} can be filled from books you've read`}</button>
                    : null}
                <ol className="board-slots">
                    {challenge.items.map((item, i) => <Slot key={i} challenge={challenge} item={item} index={i} books={books} />)}
                    <li className="board-slot">
                        <span className="slot-label" aria-hidden="true">New spot</span>
                        <button type="button" className="slot-btn" aria-label="Add a spot" onClick={() => openSpotEditor(challenge.id, null)}>
                            <span className="slot-box slot-add"><span className="slot-plus is-on"><Icon name="plus" /></span></span>
                        </button>
                    </li>
                </ol>
            </section>
        </div>
    );
}

function Slot({ challenge, item, index, books }: { challenge: Challenge; item: ChallengeItem; index: number; books: Book[] }) {
    const book = item.bookId ? books.find((b) => b.id === item.bookId) || null : null;
    const done = spotDone(item, books);
    const colour = promptColour(item.label);
    const g = done ? null : suggestionsForSpot(challenge, index, books);
    const hint = !done && !book && g
        ? g.ready.length ? { cls: "is-ready", text: `${g.ready.length} ready` }
            : g.planned.length ? { cls: "", text: `${g.planned.length} on TBR` }
                : g.possible.length ? { cls: "is-possible", text: `${g.possible.length} possible` } : null
        : null;

    const boxClass = ["slot-box",
        !book && !colour ? `slot-tint-${index % 3}` : "",
        !book && colour && DARK_COLOURS.has(colour) ? "is-dark" : ""].filter(Boolean).join(" ");
    const name = [item.label, book ? book.title : "no book yet", done ? "done" : book ? "planned" : null, hint?.text].filter(Boolean).join(", ");

    return (
        <li className={`board-slot${done ? " is-done" : ""}`}>
            <span className="slot-label" aria-hidden="true">{item.label}</span>
            <button type="button" className="slot-btn" aria-label={name} onClick={() => openSpot(challenge.id, index)}>
                <span className={boxClass} style={!book && colour ? { background: colour } : undefined}>
                    {book ? <Cover book={book} size="md" /> : <span className="slot-empty"><span className="slot-plus"><Icon name="plus" /></span></span>}
                    {done ? <span className="slot-check" aria-hidden="true"><Icon name="check" /></span> : null}
                    {book && !done ? <span className="slot-status">{`Planned · ${book.status}`}</span> : null}
                    {hint ? <span className={`slot-hint ${hint.cls}`.trim()}>{hint.text}</span> : null}
                </span>
            </button>
            {book ? <span className="slot-title">{book.title}</span> : <span className="slot-rules">{hasCriteria(item.criteria) ? "Matched for you" : "You pick"}</span>}
        </li>
    );
}
