import type { BookStatus } from "../api/types";

// Choice lists. The server validates the first four (src/controllers/bookController.js); keep them in sync.
export const STATUSES: BookStatus[] = ["To Be Read", "Reading", "Read", "Paused", "DNF"];
export const FORMATS = ["Paperback", "Hardbound", "E-book", "Audiobook"];
export const OWNERSHIP = ["Owned", "Borrowed", "Gifted"];
export const AGE_CATEGORIES = ["Children", "Middle Grade", "Young Adult", "New Adult", "Adult"];

export const GENRES = [
    "Romance", "Fantasy", "Science Fiction", "Mystery", "Thriller", "Horror", "Historical Fiction",
    "Literary Fiction", "Contemporary", "Young Adult", "New Adult", "Classics", "Non-fiction",
    "Memoir", "Biography", "Self-help", "Poetry", "Graphic Novel"
];

export const SUBGENRES = [
    "Romantasy", "Contemporary Romance", "Romantic Comedy", "Dark Romance", "Historical Romance",
    "Paranormal Romance", "Sports Romance", "Epic Fantasy", "High Fantasy", "Urban Fantasy",
    "Dark Fantasy", "Cozy Fantasy", "Fairy Tale Retelling", "Mythology", "Dystopian", "Space Opera",
    "Cozy Mystery", "Psychological Thriller", "Crime", "Gothic", "Magical Realism", "Coming of Age",
    "Women's Fiction", "Family Saga"
];

export const TROPES = [
    "Enemies to Lovers", "Friends to Lovers", "Rivals to Lovers", "Slow Burn", "Forced Proximity",
    "Only One Bed", "Fake Dating", "Marriage of Convenience", "Second Chance", "Grumpy x Sunshine",
    "Forbidden Love", "Love Triangle", "Found Family", "Chosen One", "Morally Grey",
    "Who Did This to You", "Touch Her and Die", "Secret Identity", "Redemption Arc", "Academy / Magic School",
    "Heist", "Quest", "Small Town", "Dual POV", "Unreliable Narrator", "Time Travel"
];

export const CONTENT_WARNINGS = [
    "Death", "Death of a parent", "Grief", "Violence", "Gore", "Torture", "War", "Kidnapping",
    "Sexual content", "Sexual assault", "Abuse", "Domestic abuse", "Child abuse", "Self-harm", "Suicide",
    "Mental illness", "Addiction", "Eating disorder", "Terminal illness", "Pregnancy loss",
    "Animal death", "Cheating", "Racism", "Homophobia"
];

// Suggestions for the tags the challenge matcher reads. Readers can add their own.
export const THEMES = [
    "Friendship", "Family", "Grief", "Love", "Revenge", "Redemption", "Identity", "Coming of age",
    "Survival", "Power", "War", "Magic", "Mental health", "Found family", "Second chances", "Self-discovery",
    "Betrayal", "Justice", "Hope", "Books about books"
];
export const SETTINGS = [
    "Small town", "Big city", "Boarding school", "University", "Royal court", "Castle", "Space", "Island",
    "By the sea", "Forest", "Desert", "Mountains", "Winter", "Paris", "London", "New York", "Japan",
    "Victorian England", "Regency era", "World War II", "Future", "Fantasy world", "Bookshop"
];
export const CHARACTERS = [
    "Female lead", "Male lead", "Morally grey", "Villain lead", "Anti-hero", "Royalty", "Witch",
    "Detective", "Assassin", "Dragon rider", "Artist", "Doctor", "Twins", "Siblings", "Queer lead",
    "BIPOC lead", "Disabled lead", "Older protagonist", "Child narrator", "Multiple POV", "Unreliable narrator"
];

export const TAG_DEFAULTS = {
    genres: GENRES, subgenres: SUBGENRES, tropes: TROPES, contentWarnings: CONTENT_WARNINGS,
    themes: THEMES, settings: SETTINGS, characters: CHARACTERS
};
export type TagKind = keyof typeof TAG_DEFAULTS;

export const NEXT_UP_MAX = 3;
