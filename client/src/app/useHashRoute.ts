import { useMemo, useSyncExternalStore } from "react";

// Hash routes stay exactly as in the vanilla app (#/book/12, #/series/Name?x=y), so bookmarks
// keep working and the server needs no rewrite rules.
export type HashRoute = { name: string; id: string | undefined; params: URLSearchParams };

const subscribe = (onChange: () => void) => {
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
};
const getHash = () => location.hash;

export function parseHash(hash: string): HashRoute {
    const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
    const [name = "", id] = path.split("/");
    return { name, id: id === undefined ? undefined : decodeURIComponent(id), params: new URLSearchParams(query) };
}

export function useHashRoute(): HashRoute {
    const hash = useSyncExternalStore(subscribe, getHash);
    // Same object until the hash changes, so effects that depend on the route don't re-run.
    return useMemo(() => parseHash(hash), [hash]);
}
