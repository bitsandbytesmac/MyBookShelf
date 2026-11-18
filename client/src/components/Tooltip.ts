// Tooltip for chart marks (same look and behaviour as attachTooltip in public/js/ui.js): one shared
// div.tooltip that follows the pointer. Text only (textContent), never HTML.
let tip: HTMLDivElement | null = null;

export function tooltipProps(text: string) {
    return {
        onPointerEnter: () => {
            if (!tip) {
                tip = document.createElement("div");
                tip.className = "tooltip";
                tip.setAttribute("role", "tooltip");
                document.body.appendChild(tip);
            }
            tip.textContent = text;
            tip.classList.remove("hidden");
        },
        onPointerMove: (event: { clientX: number; clientY: number }) => {
            if (!tip) return;
            const x = Math.min(event.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
            tip.style.left = `${x}px`;
            tip.style.top = `${event.clientY - tip.offsetHeight - 10}px`;
        },
        onPointerLeave: () => tip?.classList.add("hidden")
    };
}
