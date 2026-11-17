import { useRef, useState } from "react";
import { api } from "../../api";
import type { Theme } from "../../api/types";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { BACKGROUNDS, DEFAULT_THEME, PRESETS, applyTheme, cleanTheme, contrast, currentTheme, rememberTheme, toHex } from "./theme";

export function openCustomize() {
    openDialog((done) => <CustomizeDialog onClose={done} />);
}

// What depends on the colours actually on screen (read after the preview is applied).
function onScreen(draft: Theme) {
    const style = getComputedStyle(document.documentElement);
    const pickerValue = draft.background || toHex(style.getPropertyValue("--bg")) || "#fff9d6";
    let warning = "";
    if (draft.background) {
        // Check the page's main and secondary text colours (headings and subtitles sit on the background).
        const texts = ["--text", "--text-2"].map((name) => toHex(style.getPropertyValue(name))).filter((t): t is string => Boolean(t));
        if (texts.some((text) => contrast(draft.background!, text) < 4.5)) {
            warning = "Headings may be hard to read on this colour. Try a lighter one, or the Night theme for dark backgrounds.";
        }
    }
    return { pickerValue, warning };
}

function CustomizeDialog({ onClose }: { onClose: () => void }) {
    const [original] = useState(currentTheme);
    const [draft, setDraft] = useState(original);
    const [screen, setScreen] = useState(() => onScreen(original));
    const saved = useRef(false);
    const checkedPreset = useRef<HTMLButtonElement>(null);

    function update(change: Partial<Theme>) {
        const next = cleanTheme({ ...draft, ...change });
        applyTheme(next); // live preview behind the dialog
        setDraft(next);
        setScreen(onScreen(next));
    }

    const known = draft.background === null || BACKGROUNDS.some((b) => b.value === draft.background);

    const swatch = (label: string, value: string | null) => (
        <button key={label} type="button" className={`swatch${value ? "" : " swatch-default"}`} role="radio"
            title={label} aria-label={`${label} background`} data-value={value || ""}
            aria-checked={draft.background === value} style={value ? { background: value } : undefined}
            onClick={() => update({ background: value })}>
            {value ? null : "Aa"}
        </button>
    );

    return (
        <Modal title="Customize your shelf" submitLabel="Save look" initialFocus={checkedPreset}
            onSubmit={async () => {
                const result = await api.updateTheme(draft);
                saved.current = true;
                rememberTheme(result);
                toast("Your new look is saved");
            }}
            onClose={() => {
                // Closed without saving: put the previous look back.
                if (!saved.current) applyTheme(original);
                onClose();
            }}>
            <div className="stack customize">
                <p className="sub">Changes preview right away. Your choice is saved to your account, so it follows you to any device.</p>
                <div className="field">
                    <span className="label" id="themeLabel">Theme</span>
                    <div className="theme-options" role="radiogroup" aria-labelledby="themeLabel">
                        {PRESETS.map(({ id, name, preview: p }) => (
                            <button key={id} ref={id === original.preset ? checkedPreset : undefined} type="button" className="theme-option"
                                role="radio" data-preset={id} aria-checked={draft.preset === id} onClick={() => update({ preset: id })}>
                                <span className="theme-sample" style={{ background: p.bg }} aria-hidden="true">
                                    <span className="theme-sample-card" style={{ background: p.surface }}>
                                        <span className="theme-sample-line" style={{ background: p.text }} />
                                        <span className="theme-sample-line short" style={{ background: p.text }} />
                                        <span className="theme-sample-row">
                                            <span className="theme-sample-pill" style={{ background: p.accent }} />
                                            <span className="theme-sample-dot" style={{ background: p.soft }} />
                                        </span>
                                    </span>
                                </span>
                                <span className="theme-name">{name}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="field">
                    <div className="label-row">
                        <span className="label" id="bgLabel">Background colour</span>
                        <span className="bg-value">{draft.background ? draft.background.toUpperCase() : "Matches the theme"}</span>
                    </div>
                    <div className="swatches" role="radiogroup" aria-labelledby="bgLabel">
                        {swatch("Theme default", null)}
                        {BACKGROUNDS.map((b) => swatch(b.name, b.value))}
                        <label className="swatch-custom" title="Pick any colour">
                            <input type="color" className={`color-input${known ? "" : " active"}`} id="customBg" aria-label="Custom background colour"
                                value={screen.pickerValue} onChange={(e) => update({ background: e.target.value.toLowerCase() })} />
                            <span>Custom</span>
                        </label>
                    </div>
                    <p className="contrast-warning" role="status">{screen.warning}</p>
                </div>
                <button type="button" className="link-btn reset-look" onClick={() => update({ ...DEFAULT_THEME })}>Reset to default</button>
            </div>
        </Modal>
    );
}
