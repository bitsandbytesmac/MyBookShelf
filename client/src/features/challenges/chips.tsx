// Small challenge pieces shared by the book page and the challenge pages (Phase 7 adds the rest).
import type { Match } from "../../domain/challengeMatch";

export const challengeHref = (id: string) => `#/challenges/${encodeURIComponent(id)}`;

export function ReasonChips({ match }: { match: Match }) {
    return (
        <span className="reason-chips">
            {match.reasons.map((r, i) => <span key={i} className={`reason-chip${r.confirmed ? "" : " is-possible"}`}>{r.text}</span>)}
        </span>
    );
}
