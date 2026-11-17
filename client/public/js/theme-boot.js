// Applies the user's saved look before the page paints, so it never flashes the default colours.
// Loaded as a plain (non-module) script in the <head> of every page. theme.js reuses window.mbsApplyTheme.
(function () {
    var PRESETS = ["cream", "blush", "sage", "lavender", "night"];
    var HEX = /^#[0-9a-f]{6}$/i;
    var root = document.documentElement;

    function updateBrowserColour() {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", getComputedStyle(root).getPropertyValue("--bg").trim() || "#FFF9D6");
    }

    function apply(theme) {
        var preset = theme && PRESETS.indexOf(theme.preset) > 0 ? theme.preset : null; // "cream" is the default
        if (preset) root.setAttribute("data-theme", preset);
        else root.removeAttribute("data-theme");

        if (theme && typeof theme.background === "string" && HEX.test(theme.background)) root.style.setProperty("--bg", theme.background);
        else root.style.removeProperty("--bg");

        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateBrowserColour, { once: true });
        else updateBrowserColour();
    }

    window.mbsApplyTheme = apply;

    try {
        apply(JSON.parse(localStorage.getItem("theme")));
    } catch (e) {
        /* no saved theme, or storage blocked: keep the default */
    }
})();
