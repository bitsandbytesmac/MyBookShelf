// App-wide actions started from the nav bar and keyboard shortcuts ("n" and "l").
// Placeholders until their dialogs move to React: Add a book (Phase 3), Log your reading (Phase 5).
import { toast } from "../components/Toast";

const notYet = (what: string) => () => toast(`${what} hasn't moved to React yet.`);

export const openAddBook: () => void = notYet("Add a book");
export const openLogReading: () => void = notYet("Log your reading");
