
import { NextResponse } from "next/server";
import Razorpay from "razorpay";

import { getDatabase } from "@/lib/mongodb";

// export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

function errorResponse(message, status) {
    return NextResponse.json(
        { success: false, message },
        { status }
    );
}

export async function POST(request) {
    try {
        if (
            !process.env.RAZORPAY_KEY_ID ||
            !process.env.RAZORPAY_KEY_SECRET
        ) {
            console.error("Razorpay environment variables are missing.");

            return errorResponse(
                "Payment service is not configured.",
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
            typeof body.bookingId !== "string" ||
            !/^SV-[A-F0-9]{12}$/.test(body.bookingId)
        ) {
            return errorResponse("Invalid booking reference.", 400);
        }

        const db = await getDatabase();
        const bookings = db.collection("bookings");

        const booking = await bookings.findOne({
            bookingId: body.bookingId,
        });

        if (!booking) {
            return errorResponse("Booking not found.", 404);
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

        const amountInRupees = booking.pricing?.total;

        if (
            typeof amountInRupees !== "number" ||
            !Number.isFinite(amountInRupees) ||
            amountInRupees <= 0
        ) {
            console.error("Invalid saved booking amount:", booking.bookingId);

            return errorResponse(
                "The booking amount is invalid.",
                500
            );
        }

        const amount = Math.round(amountInRupees * 100);

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return errorResponse(
                "The booking amount is invalid.",
                500
            );
        }

        // Reuse an order already saved for this booking.
        if (booking.razorpayOrderId) {
            return NextResponse.json({
                success: true,
                order: {
                    id: booking.razorpayOrderId,
                    amount,
                    currency: "INR",
                },
                key: process.env.RAZORPAY_KEY_ID,
                booking: {
                    bookingId: booking.bookingId,
                },
            });
        }

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: booking.bookingId,
            notes: {
                bookingId: booking.bookingId,
            },
        });

        // Save the order against the existing pending booking.
        const update = await bookings.updateOne(
            {
                _id: booking._id,
                status: "pending_payment",
                paymentStatus: "pending",
                razorpayOrderId: { $exists: false },
            },
            {
                $set: {
                    razorpayOrderId: order.id,
                    updatedAt: new Date(),
                },
            }
        );

        if (update.modifiedCount !== 1) {
            // Another request may have created an order concurrently.
            const latest = await bookings.findOne({
                _id: booking._id,
            });

            if (
                latest?.razorpayOrderId &&
                latest.status === "pending_payment" &&
                latest.paymentStatus === "pending"
            ) {
                return NextResponse.json({
                    success: true,
                    order: {
                        id: latest.razorpayOrderId,
                        amount,
                        currency: "INR",
                    },
                    key: process.env.RAZORPAY_KEY_ID,
                    booking: {
                        bookingId: latest.bookingId,
                    },
                });
            }

            return errorResponse(
                "The booking changed while starting payment. Please try again.",
                409
            );
        }

        return NextResponse.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
            },
            key: process.env.RAZORPAY_KEY_ID,
            booking: {
                bookingId: booking.bookingId,
            },
        });
    } catch (error) {
        console.error("Razorpay order creation failed:", error);

        return errorResponse(
            "Unable to start payment. Please try again.",
            500
        );
    }
}
