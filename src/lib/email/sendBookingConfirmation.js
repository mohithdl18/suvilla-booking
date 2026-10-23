
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
        return String(value);
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

export async function sendBookingConfirmation(booking) {
    if (
        !booking?.bookingId ||
        booking.status !== "confirmed" ||
        booking.paymentStatus !== "paid"
    ) {
        throw new Error("A confirmed, paid booking is required.");
    }

    const customer = booking.customer ?? {};

    if (
        typeof customer.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)
    ) {
        throw new Error("The customer email address is invalid.");
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

    const guestCount = rooms.reduce(
        (total, room) =>
            total +
            Number(room.guests?.adults ?? 0) +
            Number(room.guests?.children ?? 0),
        0
    );

    const total = formatRupees(booking.pricing?.total);

    const rows = [
        ["Booking ID", booking.bookingId],
        ["Check-in", formatDate(booking.checkIn)],
        ["Check-out", formatDate(booking.checkOut)],
        ["Accommodation", roomText],
        ["Guests", String(guestCount)],
        ["Payment status", "Paid"],
    ];

    const detailsHtml = rows
        .map(
            ([label, value]) => `
                <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #eee;color:#555">
                        ${escapeHtml(label)}
                    </td>
                    <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">
                        ${escapeHtml(value)}
                    </td>
                </tr>
            `
        )
        .join("");

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#052a50">
            <div style="background:#052a50;color:#F7FAEE;padding:28px;text-align:center">
                <h1 style="margin:0;letter-spacing:2px">SU VILLA</h1>
                <p>Your stay is confirmed</p>
            </div>

            <div style="padding:24px">
                <h2>Thank you${customer.name ? `, ${escapeHtml(customer.name)}` : ""}!</h2>

                <p>Your payment has been verified and your booking is confirmed.</p>

                <table style="width:100%;border-collapse:collapse">
                    ${detailsHtml}
                </table>

                <div style="margin-top:24px;padding:18px;background:#F7FAEE">
                    <p style="margin:0;color:#555">Total paid</p>
                    <h2 style="margin-bottom:0">${escapeHtml(total)}</h2>
                </div>

                <p style="margin-top:24px">
                    Please keep your booking ID
                    <strong>${escapeHtml(booking.bookingId)}</strong>
                    for your records.
                </p>
            </div>
        </div>
    `;

    const resend = getResendClient();

    const { data, error } = await resend.emails.send(
        {
            from,
            to: [customer.email],
            subject: `Booking confirmed — ${booking.bookingId} | SU VILLA`,
            html,
            text: [
                "SU VILLA — Booking Confirmation",
                "",
                `Hello ${customer.name || "Guest"},`,
                "Your payment has been verified and your booking is confirmed.",
                "",
                ...rows.map(([label, value]) => `${label}: ${value}`),
                `Total paid: ${total}`,
            ].join("\n"),
        },
        {
            idempotencyKey: `booking-confirmation-${booking.bookingId}`,
        }
    );

    if (error) {
        console.error("Resend email error:", error);
        throw new Error("Unable to send the confirmation email.");
    }

    return {
        success: true,
        emailId: data?.id ?? null,
    };
}
