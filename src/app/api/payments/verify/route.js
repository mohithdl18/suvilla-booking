
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

import clientPromise, { getDatabase } from "@/lib/mongodb";
import { sendBookingConfirmation } from "@/lib/email/sendBookingConfirmation";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

function errorResponse(message, status = 400) {
    return NextResponse.json(
        { success: false, message },
        { status }
    );
}

function safeStringEqual(first, second) {
    if (
        typeof first !== "string" ||
        typeof second !== "string" ||
        first.length !== second.length
    ) {
        return false;
    }

    return timingSafeEqual(
        Buffer.from(first, "utf8"),
        Buffer.from(second, "utf8")
    );
}

function publicBooking(booking, emailStatus) {
    return {
        bookingId: booking.bookingId,
        status: "confirmed",
        paymentStatus: "paid",
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        rooms: booking.rooms,
        guests: booking.guests,
        addons: booking.addons,
        pricing: booking.pricing,
        confirmationEmailStatus: emailStatus,
    };
}

async function deliverConfirmationEmail(bookings, booking) {
    if (booking.confirmationEmailStatus === "sent") {
        return "sent";
    }

    // Avoid concurrent requests sending the same email simultaneously.
    const claim = await bookings.updateOne(
        {
            _id: booking._id,
            status: "confirmed",
            paymentStatus: "paid",
            confirmationEmailStatus: {
                $in: ["pending", "failed", "sending"],
            },
            $or: [
                { confirmationEmailUpdatedAt: { $exists: false } },
                {
                    confirmationEmailUpdatedAt: {
                        $lt: new Date(Date.now() - 5 * 60 * 1000),
                    },
                },
                { confirmationEmailStatus: { $in: ["pending", "failed"] } },
            ],
        },
        {
            $set: {
                confirmationEmailStatus: "sending",
                confirmationEmailUpdatedAt: new Date(),
            },
        }
    );

    if (claim.modifiedCount !== 1) {
        const latest = await bookings.findOne({
            _id: booking._id,
        });

        return latest?.confirmationEmailStatus === "sent"
            ? "sent"
            : latest?.confirmationEmailStatus ?? "pending";
    }

    try {
        await sendBookingConfirmation(booking);

        await bookings.updateOne(
            {
                _id: booking._id,
                status: "confirmed",
                paymentStatus: "paid",
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

        return "sent";
    } catch (error) {
        console.error(
            "Booking confirmation email failed:",
            booking.bookingId,
            error
        );

        await bookings.updateOne(
            {
                _id: booking._id,
                status: "confirmed",
                paymentStatus: "paid",
                confirmationEmailStatus: "sending",
            },
            {
                $set: {
                    confirmationEmailStatus: "failed",
                    confirmationEmailError:
                        "Email delivery failed. Retry required.",
                    confirmationEmailUpdatedAt: new Date(),
                },
            }
        );

        return "failed";
    }
}

/**
 * Finalize only after Razorpay confirms the complete captured payment.
 * Booking insertion, room reservation, and checkout completion are atomic.
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
            // A webhook and browser verification can arrive together.
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
                intent.status !== "awaiting_payment" &&
                intent.status !== "payment_processing"
            ) {
                throw new Error("CHECKOUT_NOT_PAYABLE");
            }

            const now = new Date();
            const roomIds = intent.roomIds;
            const stayDates = intent.stayDates;

            if (
                !Array.isArray(roomIds) ||
                roomIds.length < 1 ||
                !Array.isArray(stayDates) ||
                stayDates.length < 1
            ) {
                throw new Error("INVALID_CHECKOUT_DATA");
            }

            // Ensure one availability document exists per stay date.
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

            // Reserve each room only if it is still available.
            // Any failed update aborts the whole transaction.
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
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            console.error("Razorpay environment variables are missing.");

            return errorResponse(
                "Payment verification is not configured.",
                503
            );
        }

        const contentType = request.headers.get("content-type") ?? "";

        if (!contentType.toLowerCase().includes("application/json")) {
            return errorResponse(
                "Content-Type must be application/json.",
                415
            );
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request body.");
        }

        const allowedKeys = [
            "bookingId",
            "razorpay_payment_id",
            "razorpay_order_id",
            "razorpay_signature",
        ];

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => !allowedKeys.includes(key))
        ) {
            return errorResponse("Invalid payment verification request.");
        }

        const {
            bookingId,
            razorpay_payment_id: paymentId,
            razorpay_order_id: submittedOrderId,
            razorpay_signature: submittedSignature,
        } = body;

        if (
            typeof bookingId !== "string" ||
            !/^SV-[A-F0-9]{12}$/.test(bookingId) ||
            typeof paymentId !== "string" ||
            !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
            typeof submittedOrderId !== "string" ||
            !/^order_[A-Za-z0-9]+$/.test(submittedOrderId) ||
            typeof submittedSignature !== "string" ||
            !/^[a-fA-F0-9]{64}$/.test(submittedSignature)
        ) {
            return errorResponse("Invalid payment details.");
        }

        const db = await getDatabase();
        const intents = db.collection("checkout_intents");
        const bookings = db.collection("bookings");

        // Idempotent retry: the same verified payment already finalized.
        let existingBooking = await bookings.findOne({ bookingId });

        if (existingBooking) {
            if (
                existingBooking.status !== "confirmed" ||
                existingBooking.paymentStatus !== "paid" ||
                existingBooking.razorpayOrderId !== submittedOrderId ||
                existingBooking.razorpayPaymentId !== paymentId
            ) {
                return errorResponse(
                    "This booking reference has a different payment record.",
                    409
                );
            }

            const emailStatus = await deliverConfirmationEmail(
                bookings,
                existingBooking
            );

            existingBooking = await bookings.findOne({ bookingId });

            return NextResponse.json({
                success: true,
                message: "Payment has already been verified.",
                booking: publicBooking(existingBooking, emailStatus),
            });
        }

        const intent = await intents.findOne({ bookingId });

        if (!intent) {
            return errorResponse(
                "Checkout session not found. If payment was deducted, contact the property with your Razorpay payment ID.",
                404
            );
        }

        if (intent.razorpayOrderId !== submittedOrderId) {
            return errorResponse(
                "The payment order does not match this checkout.",
                400
            );
        }

        const expectedSignature = createHmac("sha256", keySecret)
            .update(`${intent.razorpayOrderId}|${paymentId}`)
            .digest("hex");

        if (!safeStringEqual(expectedSignature, submittedSignature)) {
            return errorResponse(
                "Payment signature verification failed.",
                400
            );
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        // Trust Razorpay's API response, not just the browser callback.
        const payment = await razorpay.payments.fetch(paymentId);

        const totalRupees = Number(intent.pricing?.total);
        const expectedAmount = Math.round(totalRupees * 100);

        if (
            !Number.isFinite(totalRupees) ||
            totalRupees <= 0 ||
            payment.order_id !== intent.razorpayOrderId ||
            payment.currency !== "INR" ||
            payment.amount !== expectedAmount
        ) {
            console.error(
                "Payment details do not match checkout:",
                bookingId
            );

            return errorResponse(
                "The payment details do not match this checkout.",
                400
            );
        }

        if (
            payment.status !== "captured" ||
            payment.captured !== true
        ) {
            return errorResponse(
                "Full payment has not been captured yet. Please wait and retry.",
                409
            );
        }

        const client = await clientPromise;

        let booking;

        try {
            booking = await finalizePaidCheckout({
                client,
                db,
                bookingId,
                orderId: intent.razorpayOrderId,
                paymentId,
                amountPaise: expectedAmount,
            });
        } catch (error) {
            if (error.message === "ROOM_UNAVAILABLE_AFTER_PAYMENT") {
                console.error(
                    "Payment captured but room became unavailable:",
                    bookingId,
                    paymentId
                );

                // Do not create a booking. Payment recovery/refund is required.
                await intents.updateOne(
                    {
                        bookingId,
                        status: {
                            $in: ["awaiting_payment", "payment_processing"],
                        },
                    },
                    {
                        $set: {
                            status: "payment_recovery_required",
                            paymentStatus: "paid",
                            razorpayPaymentId: paymentId,
                            paymentVerifiedAt: new Date(),
                            updatedAt: new Date(),
                        },
                    }
                );

                return errorResponse(
                    "Payment was received, but the room is no longer available. Your payment requires recovery or a refund. Please contact the property and provide your payment ID.",
                    409
                );
            }

            if (error.message === "CHECKOUT_NOT_FOUND") {
                return errorResponse(
                    "Checkout session not found. If payment was deducted, contact the property with your Razorpay payment ID.",
                    404
                );
            }

            if (error.message === "PAYMENT_AMOUNT_MISMATCH") {
                return errorResponse(
                    "The payment amount does not match the checkout.",
                    400
                );
            }

            if (error.message === "CHECKOUT_NOT_PAYABLE") {
                return errorResponse(
                    "This checkout cannot be finalized. If payment was deducted, contact the property with your payment ID.",
                    409
                );
            }

            if (error.message === "BOOKING_CONFLICT") {
                return errorResponse(
                    "A different payment record already exists for this booking reference.",
                    409
                );
            }

            throw error;
        }

        // Email delivery is outside the transaction; it cannot undo payment.
        const emailStatus = await deliverConfirmationEmail(
            bookings,
            booking
        );

        booking = await bookings.findOne({ bookingId });

        return NextResponse.json({
            success: true,
            message:
                emailStatus === "failed"
                    ? "Payment verified and booking confirmed. The confirmation email needs to be retried."
                    : "Payment verified and booking confirmed.",
            booking: publicBooking(booking, emailStatus),
        });
    } catch (error) {
        console.error("Payment verification failed:", error);

        return errorResponse(
            "Unable to verify payment right now. If payment was deducted, check your booking status or contact the property before retrying.",
            500
        );
    }
}
