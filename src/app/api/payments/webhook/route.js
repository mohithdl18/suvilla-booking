
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { getDatabase } from "@/lib/mongodb";
import { sendBookingConfirmation } from "@/lib/email/sendBookingConfirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(message, status = 200) {
    return NextResponse.json({ success: status < 400, message }, { status });
}

function safeSignatureEqual(expected, received) {
    if (
        typeof received !== "string" ||
        !/^[a-fA-F0-9]{64}$/.test(received)
    ) {
        return false;
    }

    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(received, "hex");

    return (
        expectedBuffer.length === receivedBuffer.length &&
        timingSafeEqual(expectedBuffer, receivedBuffer)
    );
}

async function sendConfirmationEmail(bookings, booking) {
    if (booking.confirmationEmailStatus === "sent") {
        return;
    }

    // Avoid duplicate sends when another request has already claimed the email.
    const claim = await bookings.updateOne(
        {
            _id: booking._id,
            status: "confirmed",
            paymentStatus: "paid",
            confirmationEmailStatus: { $nin: ["sent", "sending"] },
        },
        {
            $set: {
                confirmationEmailStatus: "sending",
                confirmationEmailUpdatedAt: new Date(),
            },
        }
    );

    if (claim.modifiedCount !== 1) {
        return;
    }

    try {
        await sendBookingConfirmation(booking);

        await bookings.updateOne(
            { _id: booking._id, confirmationEmailStatus: "sending" },
            {
                $set: {
                    confirmationEmailStatus: "sent",
                    confirmationEmailSentAt: new Date(),
                    confirmationEmailUpdatedAt: new Date(),
                },
                $unset: { confirmationEmailError: "" },
            }
        );
    } catch (error) {
        console.error(
            "Webhook confirmation email failed:",
            booking.bookingId,
            error
        );

        await bookings.updateOne(
            { _id: booking._id, confirmationEmailStatus: "sending" },
            {
                $set: {
                    confirmationEmailStatus: "failed",
                    confirmationEmailError: "Email delivery failed.",
                    confirmationEmailUpdatedAt: new Date(),
                },
            }
        );

        // Payment is already confirmed; email failure must not undo it.
    }
}

export async function POST(request) {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error("RAZORPAY_WEBHOOK_SECRET is not configured.");
            return response("Webhook is not configured.", 503);
        }

        const signature = request.headers.get("x-razorpay-signature");

        if (!signature) {
            return response("Missing webhook signature.", 400);
        }

        // IMPORTANT: signature validation must use the exact raw request body.
        const rawBody = await request.text();

        const expectedSignature = createHmac("sha256", webhookSecret)
            .update(rawBody)
            .digest("hex");

        if (!safeSignatureEqual(expectedSignature, signature)) {
            return response("Invalid webhook signature.", 400);
        }

        let event;

        try {
            event = JSON.parse(rawBody);
        } catch {
            return response("Invalid JSON payload.", 400);
        }

        // Ignore events that do not confirm a captured payment.
        if (!["payment.captured", "order.paid"].includes(event.event)) {
            return response("Event ignored.");
        }

        const payment =
            event.payload?.payment?.entity ?? null;

        const order =
            event.payload?.order?.entity ?? null;

        const orderId = payment?.order_id ?? order?.id;
        const paymentId = payment?.id;
        const amount = payment?.amount ?? order?.amount_paid;
        const currency = payment?.currency ?? order?.currency;

        if (
            typeof orderId !== "string" ||
            typeof paymentId !== "string" ||
            !Number.isSafeInteger(amount) ||
            currency !== "INR"
        ) {
            return response("Incomplete payment payload.", 400);
        }

        // payment.captured carries the payment entity. For order.paid,
        // also require captured payment data before confirming a booking.
        if (
            payment &&
            (payment.status !== "captured" || payment.captured !== true)
        ) {
            return response("Payment is not captured.");
        }

        const db = await getDatabase();
        const bookings = db.collection("bookings");

        let booking = await bookings.findOne({
            razorpayOrderId: orderId,
        });

        if (!booking) {
            // An unknown order may be an unrelated event. Acknowledge it
            // rather than causing endless retries; investigate server logs.
            console.error("Webhook order does not match a booking:", orderId);
            return response("No matching booking.");
        }

        const expectedAmount = Math.round(
            Number(booking.pricing?.total) * 100
        );

        if (
            !Number.isSafeInteger(expectedAmount) ||
            expectedAmount <= 0 ||
            amount !== expectedAmount
        ) {
            console.error(
                "Webhook amount mismatch for booking:",
                booking.bookingId
            );

            return response("Payment amount does not match booking.", 400);
        }

        if (
            booking.status === "confirmed" &&
            booking.paymentStatus === "paid"
        ) {
            if (booking.razorpayPaymentId !== paymentId) {
                console.error(
                    "Different payment received for confirmed booking:",
                    booking.bookingId
                );

                return response("Booking already has another payment.", 409);
            }

            await sendConfirmationEmail(bookings, booking);
            return response("Payment already processed.");
        }

        if (
            booking.status !== "pending_payment" ||
            booking.paymentStatus !== "pending"
        ) {
            console.error(
                "Booking is not awaiting payment:",
                booking.bookingId
            );

            return response("Booking is not awaiting payment.", 409);
        }

        const now = new Date();

        const update = await bookings.updateOne(
            {
                _id: booking._id,
                status: "pending_payment",
                paymentStatus: "pending",
                razorpayOrderId: orderId,
            },
            {
                $set: {
                    status: "confirmed",
                    paymentStatus: "paid",
                    razorpayPaymentId: paymentId,
                    paymentVerifiedAt: now,
                    updatedAt: now,
                    confirmationEmailStatus: "pending",
                },
            }
        );

        if (update.modifiedCount !== 1) {
            booking = await bookings.findOne({
                razorpayOrderId: orderId,
            });

            if (
                !booking ||
                booking.status !== "confirmed" ||
                booking.paymentStatus !== "paid" ||
                booking.razorpayPaymentId !== paymentId
            ) {
                return response("Booking state changed; retry required.", 500);
            }
        } else {
            booking = await bookings.findOne({
                _id: booking._id,
            });
        }

        await sendConfirmationEmail(bookings, booking);

        return response("Payment processed.");
    } catch (error) {
        console.error("Razorpay webhook processing error:", error);

        // Non-2xx tells Razorpay delivery failed and may trigger a retry.
        return response("Webhook processing failed.", 500);
    }
}
