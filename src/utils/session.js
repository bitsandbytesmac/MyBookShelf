// The login token lives in an HttpOnly cookie, so page JavaScript (and anything injected into it) can't read it.

const isProduction = () => process.env.NODE_ENV === "production";

// "__Host-" makes the browser enforce Secure, Path=/ and no Domain. It needs HTTPS, so it's production only.
const cookieName = () => (isProduction() ? "__Host-mbs_session" : "mbs_session");

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // matches the JWT's 1-day expiry

function cookieOptions() {
    return {
        httpOnly: true,
        secure: isProduction(),
        sameSite: "lax",
        path: "/"
    };
}

export function setSessionCookie(res, token) {
    res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(res) {
    res.clearCookie(cookieName(), cookieOptions());
}

export function readSessionToken(req) {
    const header = req.headers.cookie;
    if (!header) return null;

    for (const part of header.split(";")) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === cookieName()) {
            try {
                return decodeURIComponent(part.slice(eq + 1).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

// Blocks cross-site request forgery: a change request (POST/PUT/PATCH/DELETE) must come from our own pages.
// Browsers always send Origin on these requests; SameSite=Lax on the cookie is the second layer.
export function sameOriginOnly(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const origin = req.headers.origin;
    if (origin) {
        let host = null;
        try {
            host = new URL(origin).host;
        } catch {
            /* malformed Origin: treat as foreign */
        }
        if (host !== req.headers.host) {
            return res.status(403).json({ message: "Request blocked.", status: "error" });
        }
    }
    next();
}
