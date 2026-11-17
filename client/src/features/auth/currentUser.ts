import type { User } from "../../api/types";

// The signed-in reader's name/email, kept in localStorage at login (display only).
export function currentUser(): User {
    try {
        return JSON.parse(localStorage.getItem("user") || "null") || {};
    } catch {
        return {};
    }
}
