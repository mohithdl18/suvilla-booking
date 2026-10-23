
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

import clientPromise, { getDatabase } from "@/lib/mongodb";
import { sendBookingConfirmation } from "@/lib/email/sendBookingConfirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(message, status = 200) {
    return NextResponse.json(
        { success: status < 400, message },
        { status }
    );
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

    const now = new Date();

    const claim = await bookings.updateOne(
        {
            _id: booking._id,
            status: "confirmed",
            paymentStatus: "paid",
            $or: [
                {
                    confirmationEmailStatus: {
                        $in: ["pending", "failed"],
                    },
                },
                {
                    confirmationEmailStatus: "sending",
                    confirmationEmailUpdatedAt: {
                        $lt: new Date(Date.now() - 5 * 60 * 1000),
                    },
                },
                {
                    confirmationEmailStatus: { $exists: false },
                },
            ],
        },
        {
            $set: {
                confirmationEmailStatus: "sending",
                confirmationEmailUpdatedAt: now,
            },
        }
    );

    if (claim.modifiedCount !== 1) {
        return;
    }

    try {
        await sendBookingConfirmation(booking);

        await bookings.updateOne(
            {
                _id: booking._id,
                status: "confirmed",
                paymentStatus: "paid",
                confirmationEmailStatus: "sending",
            },
            {
                $set: {
                    confirmationEmailStatus: "sent",
                    confirmationEmailSentAt: new Date(),
                    confirmationEmailUpdatedAt: new Date(),
                },
                $unset: {
                    confirmationEmailError: "",
                },
            }
        );
    } catch (error) {
        console.error(
            "Webhook confirmation email failed:",
            booking.bookingId,
            error
        );

        await bookings.updateOne(
            {
                _id: booking._id,
                confirmationEmailStatus: "sending",
            },
            {
                $set: {
                    confirmationEmailStatus: "failed",
                    confirmationEmailError: "Email delivery failed.",
                    confirmationEmailUpdatedAt: new Date(),
                },
            }
        );
    }
}

/**
 * Create a real booking only after full payment has been verified.
 * Booking insertion, room reservations, and checkout completion are atomic.
 */
async function finalizePaidCheckout({
    client,
    db,
    bookingId,
    orderId,
    paymentId,
    amountPaise,
}) {
    const intents = db.collection("checkout_intents");
    const bookings = db.collection("bookings");
    const availability = db.collection("availability");

    let finalizedBooking;

    await client.withSession(async (session) => {
        await session.withTransaction(async () => {
            const existingBooking = await bookings.findOne(
                { bookingId },
                { session }
            );

            if (existingBooking) {
                if (
                    existingBooking.status === "confirmed" &&
                    existingBooking.paymentStatus === "paid" &&
                    existingBooking.razorpayOrderId === orderId &&
                    existingBooking.razorpayPaymentId === paymentId
                ) {
                    finalizedBooking = existingBooking;
                    return;
                }

                throw new Error("BOOKING_CONFLICT");
            }

            const intent = await intents.findOne(
                { bookingId },
                { session }
            );

            if (!intent) {
                throw new Error("CHECKOUT_NOT_FOUND");
            }

            if (
                intent.razorpayOrderId !== orderId ||
                !Number.isFinite(intent.pricing?.total) ||
                Math.round(intent.pricing.total * 100) !== amountPaise
            ) {
                throw new Error("PAYMENT_AMOUNT_MISMATCH");
            }

            if (
                !["awaiting_payment", "payment_processing"].includes(
                    intent.status
                )
            ) {
                throw new Error("CHECKOUT_NOT_PAYABLE");
            }

            const roomIds = intent.roomIds;
            const stayDates = intent.stayDates;

            if (
                !Array.isArray(roomIds) ||
                roomIds.length === 0 ||
                !Array.isArray(stayDates) ||
                stayDates.length === 0
            ) {
                throw new Error("INVALID_CHECKOUT_DATA");
            }

            // Ensure one availability document exists for every night.
            for (const date of stayDates) {
                await availability.updateOne(
                    { date },
                    {
                        $setOnInsert: {
                            date,
                            booked_rooms: [],
                            blocked_rooms: [],
                        },
                    },
                    {
                        upsert: true,
                        session,
                    }
                );
            }

            // Reserve all requested rooms for every night.
            // A failed update aborts the transaction.
            for (const date of stayDates) {
                const reservation = await availability.updateOne(
                    {
                        date,
                        booked_rooms: { $nin: roomIds },
                        blocked_rooms: { $nin: roomIds },
                    },
                    {
                        $addToSet: {
                            booked_rooms: { $each: roomIds },
                        },
                    },
                    { session }
                );

                if (reservation.modifiedCount !== 1) {
                    throw new Error("ROOM_UNAVAILABLE_AFTER_PAYMENT");
                }
            }

            const now = new Date();

            const booking = {
                bookingId: intent.bookingId,
                roomIds: intent.roomIds,
                rooms: intent.rooms,
                addons: intent.addons,
                checkIn: intent.checkIn,
                checkOut: intent.checkOut,
                nights: intent.nights,
                customer: intent.customer,
                guests: intent.guests,
                pricing: intent.pricing,
                status: "confirmed",
                paymentStatus: "paid",
                razorpayOrderId: orderId,
                razorpayPaymentId: paymentId,
                paymentVerifiedAt: now,
                createdAt: intent.createdAt ?? now,
                confirmedAt: now,
                updatedAt: now,
                confirmationEmailStatus: "pending",
            };

            await bookings.insertOne(booking, { session });

            const intentUpdate = await intents.updateOne(
                {
                    _id: intent._id,
                    status: {
                        $in: ["awaiting_payment", "payment_processing"],
                    },
                },
                {
                    $set: {
                        status: "completed",
                        paymentStatus: "paid",
                        razorpayPaymentId: paymentId,
                        paymentVerifiedAt: now,
                        updatedAt: now,
                    },
                },
                { session }
            );

            if (intentUpdate.modifiedCount !== 1) {
                throw new Error("CHECKOUT_FINALIZATION_CONFLICT");
            }

            finalizedBooking = booking;
        });
    });

    return finalizedBooking;
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

        // Verify the exact raw body before parsing it.
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

        if (!["payment.captured", "order.paid"].includes(event.event)) {
            return response("Event ignored.");
        }

        const paymentEntity = event.payload?.payment?.entity ?? null;
        const orderEntity = event.payload?.order?.entity ?? null;

        const orderId = paymentEntity?.order_id ?? orderEntity?.id;

        if (typeof orderId !== "string") {
            return response("Payment order ID is missing.", 400);
        }

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            console.error("Razorpay API credentials are not configured.");
            return response("Payment service is not configured.", 503);
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        let payment = paymentEntity;

        if (
            !payment ||
            payment.status !== "captured" ||
            payment.captured !== true
        ) {
            const paymentsResult =
                await razorpay.orders.fetchPayments(orderId);

            const paymentItems = paymentsResult?.items ?? [];

            payment = paymentItems.find(
                (item) =>
                    item.order_id === orderId &&
                    item.status === "captured" &&
                    item.captured === true
            ) ?? null;
        }

        if (
            !payment ||
            typeof payment.id !== "string" ||
            payment.order_id !== orderId ||
            payment.status !== "captured" ||
            payment.captured !== true ||
            !Number.isSafeInteger(payment.amount) ||
            payment.currency !== "INR"
        ) {
            return response(
                "Captured payment could not be verified yet.",
                500
            );
        }

        const db = await getDatabase();
        const intents = db.collection("checkout_intents");
        const bookings = db.collection("bookings");

        const intent = await intents.findOne({
            razorpayOrderId: orderId,
        });

        if (!intent) {
            const existing = await bookings.findOne({
                razorpayOrderId: orderId,
            });

            if (
                existing?.status === "confirmed" &&
                existing.paymentStatus === "paid" &&
                existing.razorpayPaymentId === payment.id
            ) {
                await sendConfirmationEmail(bookings, existing);
                return response("Payment already processed.");
            }

            console.error(
                "Captured payment has no checkout intent:",
                orderId,
                payment.id
            );

            return response(
                "No matching checkout was found. Payment reconciliation is required.",
                500
            );
        }

        const expectedAmount = Math.round(
            Number(intent.pricing?.total) * 100
        );

        if (
            !Number.isSafeInteger(expectedAmount) ||
            expectedAmount <= 0 ||
            payment.amount !== expectedAmount ||
            intent.razorpayOrderId !== orderId
        ) {
            console.error(
                "Webhook amount mismatch:",
                intent.bookingId,
                payment.id
            );

            return response(
                "Payment amount does not match checkout.",
                400
            );
        }

        // Idempotently acknowledge the same captured payment if recovery
        // has already been recorded. Do not attempt to confirm an unavailable
        // room again; the recovery/refund process must handle this payment.
        if (
            intent.status === "payment_recovery_required" &&
            intent.paymentStatus === "paid" &&
            intent.razorpayPaymentId === payment.id
        ) {
            console.error(
                "Captured payment remains in recovery:",
                intent.bookingId,
                payment.id
            );

            return response(
                "Payment is recorded and requires recovery or refund."
            );
        }

        let existingBooking = await bookings.findOne({
            bookingId: intent.bookingId,
        });

        if (existingBooking) {
            if (
                existingBooking.status === "confirmed" &&
                existingBooking.paymentStatus === "paid" &&
                existingBooking.razorpayOrderId === orderId &&
                existingBooking.razorpayPaymentId === payment.id
            ) {
                await sendConfirmationEmail(bookings, existingBooking);
                return response("Payment already processed.");
            }

            return response(
                "A conflicting booking payment record exists.",
                409
            );
        }

        const client = await clientPromise;

        let booking;

        try {
            booking = await finalizePaidCheckout({
                client,
                db,
                bookingId: intent.bookingId,
                orderId,
                paymentId: payment.id,
                amountPaise: expectedAmount,
            });
        } catch (error) {
            if (error.message === "ROOM_UNAVAILABLE_AFTER_PAYMENT") {
                console.error(
                    "Payment captured but room is no longer available:",
                    intent.bookingId,
                    payment.id
                );

                // Persist recovery state. If this database write fails, the
                // outer handler returns 500 so Razorpay can retry the event.
                await intents.updateOne(
                    {
                        bookingId: intent.bookingId,
                        status: {
                            $in: ["awaiting_payment", "payment_processing"],
                        },
                    },
                    {
                        $set: {
                            status: "payment_recovery_required",
                            paymentStatus: "paid",
                            razorpayPaymentId: payment.id,
                            paymentVerifiedAt: new Date(),
                            updatedAt: new Date(),
                        },
                    }
                );

                return response(
                    "Payment received; room unavailable. Recovery required."
                );
            }

            if (
                error.message === "CHECKOUT_NOT_FOUND" ||
                error.message === "PAYMENT_AMOUNT_MISMATCH" ||
                error.message === "CHECKOUT_NOT_PAYABLE" ||
                error.message === "BOOKING_CONFLICT"
            ) {
                console.error(
                    "Webhook checkout finalization rejected:",
                    intent.bookingId,
                    error.message
                );

                return response(
                    "Payment requires reconciliation.",
                    500
                );
            }

            throw error;
        }

        await sendConfirmationEmail(bookings, booking);

        existingBooking = await bookings.findOne({
            bookingId: intent.bookingId,
        });

        return response("Payment processed and booking confirmed.");
    } catch (error) {
        console.error("Razorpay webhook processing error:", error);

        // Non-2xx responses allow retries for transient processing failures.
        return response("Webhook processing failed.", 500);
    }
}
