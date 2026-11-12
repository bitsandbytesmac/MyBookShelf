import nodemailer from "nodemailer";

// Configure with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.
// Without them (local development only) emails are printed to the console instead.

let transporter = null;

export function isMailConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
    if (!transporter) {
        const port = Number(process.env.SMTP_PORT) || 465;
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    return transporter;
}

export async function sendMail({ to, subject, text, html }) {
    if (!isMailConfigured()) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("Email is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS).");
        }
        console.log(`\n[mail:dev] Email not configured; would send to ${to}\nSubject: ${subject}\n${text}\n`);
        return;
    }

    await getTransporter().sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html
    });
}
