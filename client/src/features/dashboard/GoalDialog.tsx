// Add or edit a custom reading goal (same fields and checks as openGoalDialog in public/js/dashboard.js).
import { useRef, useState, type ReactNode } from "react";
import type { CustomGoal } from "../../api/types";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { AGE_CATEGORIES, FORMATS } from "../../domain/constants";
import { GOAL_FILTER_LABELS } from "../../domain/goals";
import { tagOptions } from "../../domain/readingRules";
import { getState, saveCustomGoal } from "../../store/store";

export function openGoalDialog(goal: CustomGoal | null = null) {
    openDialog((done) => <GoalDialog goal={goal} onClose={done} />);
}

type FilterType = keyof typeof GOAL_FILTER_LABELS;

const CHOICES: Record<FilterType, () => string[]> = {
    genre: () => [...new Set([...tagOptions(getState().books, "genres"), ...tagOptions(getState().books, "subgenres")])],
    format: () => FORMATS,
    age: () => AGE_CATEGORIES
};

// The value list for a filter type, keeping the goal's own value first if it's not a suggestion.
function valuesFor(type: FilterType, goal: CustomGoal | null) {
    const options = CHOICES[type]();
    const current = goal?.filterType === type && goal.filterValue ? goal.filterValue : options[0];
    return { options: [...new Set([current, ...options])], current };
}

const Field = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
    <div className="field"><label htmlFor={id}>{label}</label>{children}</div>
);

function GoalDialog({ goal, onClose }: { goal: CustomGoal | null; onClose: () => void }) {
    const [name, setName] = useState(goal?.title || "");
    const [target, setTarget] = useState(goal?.target != null ? String(goal.target) : "");
    const [metric, setMetric] = useState<CustomGoal["metric"]>(goal?.metric || "books");
    const [period, setPeriod] = useState<CustomGoal["period"]>(goal?.period || "year");
    const [filterType, setFilterType] = useState<FilterType | "">(goal?.filterType || "");
    const [values, setValues] = useState(() => (goal?.filterType ? valuesFor(goal.filterType, goal) : null));
    const [filterValue, setFilterValue] = useState(values?.current || "");
    const targetRef = useRef<HTMLInputElement>(null);

    const changeType = (type: FilterType | "") => {
        setFilterType(type);
        if (!type) return setValues(null);
        const next = valuesFor(type, goal);
        setValues(next);
        setFilterValue(next.current);
    };

    return (
        <Modal title={goal ? "Edit goal" : "Add a reading goal"} size="sm" submitLabel={goal ? "Save goal" : "Add goal"} initialFocus={targetRef} onClose={onClose}
            onSubmit={async ({ setError }) => {
                const n = Number(target);
                const max = metric === "pages" ? 1000000 : 1000;
                if (!Number.isInteger(n) || n < 1 || n > max) return setError(`Target must be a whole number from 1 to ${max.toLocaleString()}.`), false;
                await saveCustomGoal({
                    title: name.trim(),
                    metric, period,
                    target: n,
                    filterType: filterType || null,
                    filterValue: filterType ? filterValue : null
                }, goal?.id);
                toast(goal ? "Goal saved" : "Goal added");
            }}>
            <div className="stack">
                <div className="field-row">
                    <Field id="cgTarget" label="Target">
                        <input ref={targetRef} className="input" id="cgTarget" type="number" min={1} inputMode="numeric" placeholder="10" value={target} onChange={(e) => setTarget(e.target.value)} />
                    </Field>
                    <Field id="cgMetric" label="Count">
                        <select className="select" id="cgMetric" value={metric} onChange={(e) => setMetric(e.target.value as CustomGoal["metric"])}>
                            <option value="books">Books</option>
                            <option value="pages">Pages</option>
                        </select>
                    </Field>
                </div>
                <div className="field-row">
                    <Field id="cgPeriod" label="When">
                        <select className="select" id="cgPeriod" value={period} onChange={(e) => setPeriod(e.target.value as CustomGoal["period"])}>
                            <option value="year">This year</option>
                            <option value="month">This month</option>
                        </select>
                    </Field>
                    <Field id="cgFilter" label="Only count">
                        <select className="select" id="cgFilter" value={filterType} onChange={(e) => changeType(e.target.value as FilterType | "")}>
                            <option value="">Any book</option>
                            {Object.entries(GOAL_FILTER_LABELS).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                        </select>
                    </Field>
                </div>
                <div className={`field${filterType ? "" : " hidden"}`}>
                    <label htmlFor="cgFilterValue">Which one</label>
                    <select className="select" id="cgFilterValue" value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                        {(values?.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <Field id="cgName" label="Name">
                    <input className="input" id="cgName" maxLength={100} placeholder="Optional, e.g. Classics catch-up" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <p className="hint">Books count once they're marked Read with a finish date in that month or year. Pages add up the page counts of those books.</p>
            </div>
        </Modal>
    );
}
