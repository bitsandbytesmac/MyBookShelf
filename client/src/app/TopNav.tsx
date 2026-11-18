import type { ReactNode } from "react";
import type { TabName } from "./routes";
import { AccountMenu } from "./AccountMenu";
import { openAddBook, openLogReading } from "./actions";

// Same markup and classes as the vanilla index.html, so style.css applies unchanged.
const svg = (children: ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const TABS: { name: TabName; label: string; icon: ReactNode }[] = [
    { name: "dashboard", label: "Dashboard", icon: svg(<><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>) },
    { name: "library", label: "Library", icon: svg(<><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="m16.5 4.5 3.8-1 3.7 15.5-3.8 1z" /></>) },
    { name: "authors", label: "Authors", icon: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>) },
    { name: "series", label: "Series", icon: svg(<><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>) },
    { name: "statistics", label: "Statistics", icon: svg(<><path d="M3 3v18h18" /><path d="M8 17v-4M13 17V8M18 17v-7" /></>) },
    { name: "challenges", label: "Challenges", icon: svg(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>) },
    { name: "physical", label: "Physical Books", icon: svg(<><path d="M3 20h18M3 4v16M21 4v16" /><path d="M6 20V9h3v11M10 20V7h3v13M15 20l1.6-10.5 2.9.5L18 20" /></>) }
];

export function TopNav({ activeTab }: { activeTab: TabName }) {
    return (
        <header className="topnav">
            <div className="topnav-inner">
                <a href="#/dashboard" className="brand">
                    <span className="brand-mark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></svg>
                    </span>
                    MyBookShelf
                </a>

                <nav className="tabs" aria-label="Main">
                    {TABS.map((tab) => (
                        <a key={tab.name} href={`#/${tab.name}`} className={`tab${tab.name === activeTab ? " active" : ""}`}
                            data-route={tab.name} aria-current={tab.name === activeTab ? "page" : undefined}>
                            {tab.icon}
                            {tab.label}
                        </a>
                    ))}
                </nav>
                <div className="nav-actions">
                    <button type="button" className="btn nav-add" data-action="add-book" aria-label="Add a book" title="Add a book" onClick={() => openAddBook()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                    <button type="button" className="btn btn-primary" data-action="log-reading" aria-label="Log your reading" onClick={() => openLogReading()}>
                        {svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>)}
                        <span className="label">Log your reading</span>
                    </button>
                    <AccountMenu />
                </div>
            </div>
        </header>
    );
}
