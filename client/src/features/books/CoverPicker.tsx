// Cover picker shared by manual add and Edit details. The chosen file is only uploaded when the
// dialog is saved (one Vercel Blob operation), after being shrunk in the browser.
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api";
import { Cover } from "../../components/BookBits";
import { toast } from "../../components/Toast";

const MAX_PICK_BYTES = 20 * 1024 * 1024;  // what you can choose (it gets shrunk before upload)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // what the server accepts
const COVER_MAX_W = 600;
const COVER_MAX_H = 900;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Resize to at most 600×900 and re-encode as WebP (JPEG if the browser can't), so covers are
// typically 30–150 KB. Falls back to the original file if anything goes wrong.
async function shrinkCover(file: File): Promise<File> {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, COVER_MAX_W / bitmap.width, COVER_MAX_H / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
        let blob = await encode("image/webp");
        if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
        if (!blob || (scale === 1 && blob.size >= file.size)) return file;
        return new File([blob], `cover.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
    } catch {
        return file;
    }
}

export type CoverChoice = { resolve: () => Promise<string | null> };

// `choice.current.resolve()` uploads the picked file (if any) and returns the cover URL to save.
export function CoverPicker({ book, choice }: {
    book: { title?: string; author?: string; coverUrl?: string | null };
    choice: { current: CoverChoice | null };
}) {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const inputId = `cover-${useId().replace(/:/g, "")}`;
    const input = useRef<HTMLInputElement>(null);

    // Free the preview when it changes or the dialog closes.
    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    choice.current = {
        async resolve() {
            if (!file) return book.coverUrl || null;
            const small = await shrinkCover(file);
            if (small.size > MAX_UPLOAD_BYTES) throw new Error("That image is too large to upload. Try a smaller one.");
            return api.uploadCover(small);
        }
    };

    const pick = (picked: File | undefined) => {
        if (!picked) return;
        const reset = () => {
            if (input.current) input.current.value = "";
        };
        if (!TYPES.includes(picked.type)) {
            toast("Use a JPG, PNG or WEBP image.", { error: true });
            return reset();
        }
        if (picked.size > MAX_PICK_BYTES) {
            toast("That image is over 20 MB.", { error: true });
            return reset();
        }
        setFile(picked);
        setPreviewUrl(URL.createObjectURL(picked));
    };

    return (
        <div className="cover-field">
            <div><Cover book={{ ...book, coverUrl: previewUrl || book.coverUrl }} size="sm" /></div>
            <div className="cover-actions">
                <label className="btn btn-sm" htmlFor={inputId}>{book.coverUrl ? "Change cover" : "Upload cover"}</label>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id={inputId}
                    onChange={(e) => pick(e.target.files?.[0])} />
                <span className="hint">JPG, PNG or WEBP, up to 20 MB (resized automatically)</span>
            </div>
        </div>
    );
}
