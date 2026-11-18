// Challenge templates offered by "New challenge" (same as TEMPLATES in public/js/challengeDialogs.js).
import type { Criteria } from "../../api/types";

type Template = { label: string; name: string; description: string; spots: { label: string; criteria?: Criteria }[] };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const TEMPLATES: Record<string, Template> = {
    genres: {
        label: "Genre explorer",
        name: "Genre Explorer",
        description: "Read one book from each genre.",
        spots: ["Fantasy", "Romance", "Mystery", "Thriller", "Science Fiction", "Horror", "Historical Fiction",
            "Literary Fiction", "Contemporary", "Non-fiction", "Classics", "Poetry"].map((g) => ({ label: g, criteria: { genres: [g] } }))
    },
    az: {
        label: "A to Z titles",
        name: "A to Z Challenge",
        description: "Read a book whose title starts with every letter of the alphabet.",
        spots: ALPHABET.map((l) => ({ label: l, criteria: { title: { mode: "startsWith", value: l, ignoreArticles: true } } }))
    },
    tropes: {
        label: "Trope bingo",
        name: "Trope Bingo",
        description: "Fill the card with your favourite tropes.",
        spots: ["Enemies to Lovers", "Found Family", "Slow Burn", "Forced Proximity", "Fake Dating", "Chosen One",
            "Second Chance", "Grumpy x Sunshine", "Morally Grey"].map((t) => ({ label: t, criteria: { tropes: [t] } }))
    },
    world: {
        label: "Around the world (settings)",
        name: "Around the World",
        description: "Travel through books set in different places and times.",
        spots: ["Japan", "Paris", "London", "New York", "Island", "Desert", "Space", "Small town", "Royal court"]
            .map((s) => ({ label: s, criteria: { settings: [s] } }))
    },
    rainbow: {
        label: "Rainbow covers (you pick each book)",
        name: "Rainbow Reading Challenge",
        description: "Read a book with a cover of every colour. Cover colours can't be checked automatically, so you pick each book.",
        spots: ["Red", "Orange", "Yellow", "Green", "Dark Blue", "Light Blue", "Purple", "Pink", "White", "Black", "Brown", "Grey"]
            .map((c) => ({ label: c }))
    },
    custom: { label: "My own spots", name: "", description: "", spots: [] }
};
