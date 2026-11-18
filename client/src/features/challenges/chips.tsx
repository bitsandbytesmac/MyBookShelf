// Small challenge pieces shared by the book page, the challenge pages and the challenge dialogs.
// Same markup as the helpers in public/js/challengeDialogs.js and public/js/challenges.js.
import { useState, type ReactNode } from "react";
import type { Challenge } from "../../api/types";
import { describeCriteria, type Match, type ChallengeState } from "../../domain/challengeMatch";
import type { Criteria } from "../../api/types";
import { fmt } from "../../components/format";
import { Icon } from "../../components/Icon";

export const challengeHref = (id: string) => `#/challenges/${encodeURIComponent(id)}`;

// Chips explaining why a book matches. Confirmed reasons are solid, "possible" ones dashed.
export function ReasonChips({ match }: { match: Match }) {
    return (
        <span className="reason-chips">
            {match.reasons.map((r, i) => <span key={i} className={`reason-chip${r.confirmed ? "" : " is-possible"}`}>{r.text}</span>)}
        </span>
    );
}

export function MatchBadge({ status }: { status: Match["status"] }) {
    return status === "confirmed"
        ? <span className="match-badge is-confirmed"><Icon name="check" />Confirmed match</span>
        : <span className="match-badge is-possible">Possible match</span>;
}

export function RuleChips({ criteria }: { criteria: Criteria | null | undefined }) {
    const rules = describeCriteria(criteria);
    return (
        <span className="rule-chips">
            {rules.length
                ? rules.map((r) => <span key={r} className="rule-chip">{r}</span>)
                : <span className="rule-chip is-manual">Chosen by hand</span>}
        </span>
    );
}

// Plain toggle pills for fixed choices (age, format): no "add your own".
export function PillToggles({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
    const chosen = new Set(value);
    return (
        <div className="pills" role="group" aria-label={label}>
            {options.map((opt) => (
                <button key={opt} type="button" className="pill" aria-pressed={chosen.has(opt)}
                    onClick={() => {
                        const next = new Set(chosen);
                        if (next.has(opt)) next.delete(opt);
                        else next.add(opt);
                        onChange(options.filter((o) => next.has(o)));
                    }}>{opt}</button>
            ))}
        </div>
    );
}

// A folding section of the spot editor; the summary counts how many values are set.
export function Fold({ label, count, children }: { label: string; count: number; children: ReactNode }) {
    // Open at first when something is already set (the vanilla editor did the same).
    const [open] = useState(count > 0);
    return (
        <details className="foldout" open={open}>
            <summary>{label}<span className="fold-count">{count ? `${count} set` : ""}</span></summary>
            <div className="foldout-body">{children}</div>
        </details>
    );
}

// ---------- Board helpers ----------

// A prompt that names a colour ("Red", "Dark Blue", "Grey") gets that colour, like a rainbow challenge sheet.
// These are the prompt's own colours (content, not theme), so they're the same in every theme.
const PROMPT_COLOURS: [string, string][] = [
    ["dark blue", "#a3b1ee"], ["navy", "#7f8fd6"], ["light blue", "#bfe6e6"], ["sky blue", "#bfe6e6"],
    ["light green", "#d6f2c4"], ["dark green", "#8fbf87"], ["red", "#f59b9b"], ["orange", "#f0c592"],
    ["yellow", "#f3e59e"], ["green", "#c4ecb4"], ["blue", "#a9c8f0"], ["teal", "#9fd8d0"],
    ["purple", "#d9c3ea"], ["lilac", "#d9c3ea"], ["violet", "#cbb5ea"], ["pink", "#fbd0ec"],
    ["white", "#ffffff"], ["black", "#141414"], ["brown", "#a87f69"], ["grey", "#d6d6d8"], ["gray", "#d6d6d8"],
    ["gold", "#e8cc7a"], ["silver", "#cfd3d8"], ["beige", "#eadcc2"], ["cream", "#f6efd9"]
];
export const DARK_COLOURS = new Set(["#141414", "#7f8fd6"]);

export function promptColour(label: string): string | null {
    const text = label.trim().toLowerCase();
    return PROMPT_COLOURS.find(([name]) => text === name || text.startsWith(`${name} `))?.[1] || null;
}

// "Jan 1 – Dec 31, 2026"
export function dateRange(c: Pick<Challenge, "startsOn" | "endsOn">): string {
    if (!c.startsOn && !c.endsOn) return "No end date";
    if (!c.startsOn) return `Until ${fmt.date(c.endsOn)}`;
    if (!c.endsOn) return `From ${fmt.date(c.startsOn)}`;
    return `${fmt.date(c.startsOn)} – ${fmt.date(c.endsOn)}`;
}

export const STATE_LABEL: Record<ChallengeState, string> = { active: "Active", upcoming: "Upcoming", completed: "Completed", ended: "Ended" };
