
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

import { getDatabase } from "@/lib/mongodb";
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

/**
 * Send the confirmation email after payment is confirmed.
 *
 * Resend's stable idempotency key is used by the email helper.
 * Email failure must not undo a successfully paid booking.
 */
async function deliverConfirmationEmail(bookings, booking) {
    if (booking.confirmationEmailStatus === "sent") {
        return "sent";
    }

    await bookings.updateOne(
        {
            _id: booking._id,
            status: "confirmed",
            paymentStatus: "paid",
            confirmationEmailStatus: { $ne: "sent" },
        },
        {
            $set: {
                confirmationEmailStatus: "sending",
                confirmationEmailUpdatedAt: new Date(),
            },
        }
    );

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
                confirmationEmailStatus: { $ne: "sent" },
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

        const body = await request.json();

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some(
                (key) =>
                    ![
                        "bookingId",
                        "razorpay_payment_id",
                        "razorpay_order_id",
                        "razorpay_signature",
                    ].includes(key)
            )
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
        const bookings = db.collection("bookings");

        let booking = await bookings.findOne({ bookingId });

        if (!booking) {
            return errorResponse("Booking not found.", 404);
        }

        // Allow safe retries after the same payment was already verified.
        if (
            booking.status === "confirmed" &&
            booking.paymentStatus === "paid" &&
            booking.razorpayPaymentId === paymentId
        ) {
            const emailStatus = await deliverConfirmationEmail(
                bookings,
                booking
            );

            booking = await bookings.findOne({ bookingId });

            return NextResponse.json({
                success: true,
                message:
                    emailStatus === "failed"
                        ? "Payment is confirmed, but the confirmation email could not be sent."
                        : "Payment has already been verified.",
                booking: publicBooking(booking, emailStatus),
            });
        }

        if (
            booking.status !== "pending_payment" ||
            booking.paymentStatus !== "pending"
        ) {
            return errorResponse(
                "This booking is not awaiting payment.",
                409
            );
        }

        const savedOrderId = booking.razorpayOrderId;

        if (
            typeof savedOrderId !== "string" ||
            savedOrderId !== submittedOrderId
        ) {
            return errorResponse(
                "The payment order does not match this booking.",
                400
            );
        }

        // Verify the signature using the order ID stored on our server.
        const expectedSignature = createHmac("sha256", keySecret)
            .update(`${savedOrderId}|${paymentId}`)
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

        // Verify payment details against Razorpay's API.
        const payment = await razorpay.payments.fetch(paymentId);

        const totalRupees = Number(booking.pricing?.total);
        const expectedAmount = Math.round(totalRupees * 100);

        if (
            !Number.isFinite(totalRupees) ||
            totalRupees <= 0 ||
            payment.order_id !== savedOrderId ||
            payment.currency !== "INR" ||
            payment.amount !== expectedAmount
        ) {
            console.error(
                "Payment details do not match booking:",
                bookingId
            );

            return errorResponse(
                "The payment details do not match this booking.",
                400
            );
        }

        if (
            payment.status !== "captured" ||
            payment.captured !== true
        ) {
            return errorResponse(
                "Payment has not been captured yet. Please wait and retry.",
                409
            );
        }

        const now = new Date();

        // Confirm only if the booking is still awaiting this payment.
        const update = await bookings.updateOne(
            {
                _id: booking._id,
                status: "pending_payment",
                paymentStatus: "pending",
                razorpayOrderId: savedOrderId,
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
            booking = await bookings.findOne({ bookingId });

            if (
                !booking ||
                booking.status !== "confirmed" ||
                booking.paymentStatus !== "paid" ||
                booking.razorpayPaymentId !== paymentId
            ) {
                return errorResponse(
                    "The booking changed during verification. Please check its status.",
                    409
                );
            }
        } else {
            booking = await bookings.findOne({ bookingId });
        }

        // Email delivery happens only after payment is confirmed in MongoDB.
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
                    : "Payment verified, booking confirmed, and confirmation email processed.",
            booking: publicBooking(booking, emailStatus),
        });
    } catch (error) {
        console.error("Payment verification failed:", error);

        return errorResponse(
            "Unable to verify payment right now. Check your booking status before retrying.",
            500
        );
    }
}
