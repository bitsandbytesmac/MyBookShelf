import { useSyncExternalStore } from "react";
import { getState, subscribe, type AppState } from "./store";

// Read a slice of the app state; the component re-renders only when that slice changes.
// The selector must return something already in the state (or a primitive), never a new
// array/object: derive those with useMemo in the component, e.g.
//   const books = useStore((s) => s.books);
//   const series = useMemo(() => seriesList(books), [books]);
export function useStore<T>(selector: (state: AppState) => T): T {
    return useSyncExternalStore(subscribe, () => selector(getState()));
}
