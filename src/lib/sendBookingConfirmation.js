
import { Resend } from "resend";

let resendClient;

function getResendClient() {
    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    if (!resendClient) {
        resendClient = new Resend(process.env.RESEND_API_KEY);
    }

    return resendClient;
}

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };

        return entities[character];
    });
}

function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(`${value}`.slice(0, 10) + "T12:00:00");

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(value);
    }

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    });
}

function formatRupees(amount) {
    const value = Number(amount);

    if (!Number.isFinite(value)) return "Not available";

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(value);
}

function renderRows(rows) {
    return rows
        .map(
            ([label, value]) => `
                <tr>
                    <td style="padding:10px 0;color:#555;border-bottom:1px solid #eee;">
                        ${escapeHtml(label)}
                    </td>
                    <td style="padding:10px 0;text-align:right;color:#052a50;font-weight:600;border-bottom:1px solid #eee;">
                        ${escapeHtml(value)}
                    </td>
                </tr>
            `
        )
        .join("");
}

export async function sendBookingConfirmation(booking) {
    if (!booking || !booking.bookingId) {
        throw new Error("A valid booking is required.");
    }

    if (
        booking.status !== "confirmed" ||
        booking.paymentStatus !== "paid"
    ) {
        throw new Error(
            "Confirmation email can only be sent for a paid, confirmed booking."
        );
    }

    const customer = booking.customer ?? {};
    const customerEmail = customer.email;

    if (
        typeof customerEmail !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
        throw new Error("The booking does not contain a valid customer email.");
    }

    const from = process.env.RESEND_FROM_EMAIL;

    if (!from) {
        throw new Error("RESEND_FROM_EMAIL is not configured.");
    }

    const rooms = Array.isArray(booking.rooms)
        ? booking.rooms
        : [];

    const roomNames = rooms
        .map((room) => room.roomName || room.name || room.roomId)
        .filter(Boolean);

    const roomText = roomNames.length
        ? roomNames.join(", ")
        : "Your selected accommodation";

    const guestCount = Number(booking.guests?.adults ?? 0)
        + Number(booking.guests?.children ?? 0);

    const pricing = booking.pricing ?? {};

    const details = [
        ["Booking ID", booking.bookingId],
        ["Check-in", formatDate(booking.checkIn)],
        ["Check-out", formatDate(booking.checkOut)],
        ["Guests", guestCount > 0 ? String(guestCount) : "See booking details"],
        ["Accommodation", roomText],
        ["Payment", "Paid"],
    ];

    const total = formatRupees(pricing.total);

    const html = `
        <!doctype html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>SU VILLA Booking Confirmation</title>
        </head>
        <body style="margin:0;background:#f7faee;font-family:Arial,Helvetica,sans-serif;color:#052a50;">
            <div style="max-width:600px;margin:0 auto;padding:28px 16px;">
                <div style="background:#ffffff;border-radius:12px;overflow:hidden;">
                    <div style="padding:28px 24px;background:#052a50;color:#f7faee;text-align:center;">
                        <h1 style="margin:0;font-size:28px;letter-spacing:2px;">SU VILLA</h1>
                        <p style="margin:10px 0 0;font-size:14px;">Your stay is confirmed</p>
                    </div>

                    <div style="padding:28px 24px;">
                        <h2 style="margin:0 0 12px;font-size:22px;">
                            Thank you${customer.name ? `, ${escapeHtml(customer.name)}` : ""}!
                        </h2>

                        <p style="margin:0 0 24px;line-height:1.6;color:#555;">
                            Your payment has been verified and your booking is confirmed.
                            Keep this email for your records.
                        </p>

                        <h3 style="margin:0 0 8px;font-size:16px;">Booking details</h3>

                        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
                            ${renderRows(details)}
                        </table>

                        <div style="margin-top:24px;padding:18px;background:#f7faee;border-radius:8px;">
                            <p style="margin:0 0 6px;color:#555;font-size:13px;">Total paid</p>
                            <p style="margin:0;font-size:26px;font-weight:700;">
                                ${escapeHtml(total)}
                            </p>
                        </div>

                        <p style="margin:24px 0 0;line-height:1.6;color:#555;font-size:13px;">
                            Please keep your booking ID
                            <strong>${escapeHtml(booking.bookingId)}</strong>
                            handy if you contact us about your reservation.
                        </p>
                    </div>

                    <div style="padding:18px 24px;background:#f8f8f8;color:#777;font-size:12px;text-align:center;">
                        SU VILLA · We look forward to welcoming you.
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    const resend = getResendClient();

    const { data, error } = await resend.emails.send(
        {
            from,
            to: [customerEmail],
            subject: `Booking confirmed — ${booking.bookingId} | SU VILLA`,
            html,
            text: [
                "SU VILLA — Booking Confirmation",
                "",
                `Hello ${customer.name || "Guest"},`,
                "Your payment has been verified and your booking is confirmed.",
                "",
                ...details.map(([label, value]) => `${label}: ${value}`),
                `Total paid: ${total}`,
                "",
                `Booking ID: ${booking.bookingId}`,
            ].join("\n"),
        },
        {
            idempotencyKey: `booking-confirmation-${booking.bookingId}`,
        }
    );

    if (error) {
        console.error("Resend email error:", error);
        throw new Error("Unable to send the booking confirmation email.");
    }

    return {
        success: true,
        emailId: data?.id ?? null,
    };
}
