// The Review dialog: rating, spice, dates, favourite quotes, review text and the checklist.
import { useRef, useState } from "react";
import type { Book } from "../../api/types";
import { CheckCard, RateInput } from "../../components/inputs";
import { Icon } from "../../components/Icon";
import { Modal, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { updateBook } from "../../store/store";

export function openReview(book: Book) {
    openDialog((done) => <ReviewDialog book={book} onClose={done} />);
}

function ReviewDialog({ book, onClose }: { book: Book; onClose: () => void }) {
    const [rating, setRating] = useState(book.rating);
    const [spice, setSpice] = useState(book.spice);
    const [quotes, setQuotes] = useState(book.quotes);
    const [newQuote, setNewQuote] = useState("");
    const [started, setStarted] = useState(book.dateStarted || "");
    const [finished, setFinished] = useState(book.dateFinished || "");
    const [review, setReview] = useState(book.review);
    const [reviewed, setReviewed] = useState(book.reviewed);
    const [journaled, setJournaled] = useState(book.journaled);
    const reviewRef = useRef<HTMLTextAreaElement>(null);
    const quoteRef = useRef<HTMLTextAreaElement>(null);

    const addQuote = () => {
        const text = newQuote.trim();
        if (!text) return;
        setQuotes((list) => [...list, text]);
        setNewQuote("");
        quoteRef.current?.focus();
    };

    return (
        <Modal title={`Review · ${book.title}`} submitLabel="Save review" initialFocus={reviewRef} onClose={onClose}
            onSubmit={async ({ setError }) => {
                if (started && finished && finished < started) return setError("Date finished can't be before date started."), false;
                // Don't lose a quote that was typed but not added yet.
                const typed = newQuote.trim();
                await updateBook(book.id, {
                    rating, spice,
                    quotes: typed ? [...quotes, typed] : quotes,
                    review: review.trim(),
                    reviewed, journaled,
                    dateStarted: started || null,
                    dateFinished: finished || null
                });
                toast("Review saved");
            }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div className="field-row">
                    <div className="field"><span className="label">Rating</span><RateInput kind="star" value={rating} onChange={setRating} label="Rating" /></div>
                    <div className="field"><span className="label">Spice</span><RateInput kind="chili" value={spice} onChange={setSpice} label="Spice level" /></div>
                </div>
                <div className="field-row">
                    <div className="field">
                        <label htmlFor="rStarted">Date started</label>
                        <input className="input" type="date" id="rStarted" value={started} onChange={(e) => setStarted(e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="rFinished">Date finished</label>
                        <input className="input" type="date" id="rFinished" value={finished} onChange={(e) => setFinished(e.target.value)} />
                    </div>
                </div>
                <div className="field">
                    <span className="label">Favourite quotes</span>
                    <span className="hint">These show up on your dashboard.</span>
                    <div className="quote-list">
                        {quotes.map((q, i) => (
                            <div key={`${i}-${q}`} className="quote-item">
                                <span>{q}</span>
                                <button type="button" className="icon-btn" aria-label="Remove quote"
                                    onClick={() => setQuotes((list) => list.filter((_, n) => n !== i))}><Icon name="close" /></button>
                            </div>
                        ))}
                    </div>
                    <div className="quote-add">
                        <textarea ref={quoteRef} className="textarea" rows={2} placeholder="Type a line you loved…" aria-label="New quote" maxLength={2000}
                            value={newQuote} onChange={(e) => setNewQuote(e.target.value)} />
                        <button type="button" className="btn btn-sm" onClick={addQuote}><Icon name="plus" />Add</button>
                    </div>
                </div>
                <div className="field">
                    <label htmlFor="rReview">Review</label>
                    <textarea ref={reviewRef} className="textarea" id="rReview" rows={6} placeholder="What did you think? How did it make you feel?"
                        value={review} onChange={(e) => setReview(e.target.value)} />
                </div>
                <div className="field">
                    <span className="label">Checklist</span>
                    <div className="check-row">
                        <CheckCard id="rReviewed" label="Review" hint="Written or posted" checked={reviewed} onChange={setReviewed} />
                        <CheckCard id="rJournaled" label="Reading journal" hint="Added to my journal" checked={journaled} onChange={setJournaled} />
                    </div>
                </div>
            </div>
        </Modal>
    );
}
