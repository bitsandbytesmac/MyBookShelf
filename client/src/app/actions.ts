// App-wide actions started from the nav bar, keyboard shortcuts ("n" and "l") and several pages.
// Placeholders until their dialogs move to React: Log your reading (Phase 5), the challenge spot panel (Phase 7).
import { toast } from "../components/Toast";

export { openAddBook } from "../features/books/AddBookDialogs";

const notYet = (what: string) => () => toast(`${what} hasn't moved to React yet.`);

export const openLogReading: (bookId?: string) => void = notYet("Log your reading");
export const openSpot: (challengeId: string, index: number) => void = notYet("The challenge spot panel");
