
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import Razorpay from "razorpay";

import { getDatabase } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_CREATION_LEASE_MS = 2 * 60 * 1000;

function errorResponse(message, status = 400) {
    return NextResponse.json(
        { success: false, message },
        { status }
    );
}

function successResponse(intent, order, keyId) {
    return NextResponse.json({
        success: true,
        order: {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
        },
        key: keyId,
        booking: {
            bookingId: intent.bookingId,
        },
    });
}

function validCheckoutAmount(intent) {
    const total = intent.pricing?.total;

    if (
        typeof total !== "number" ||
        !Number.isFinite(total) ||
        total <= 0
    ) {
        return null;
    }

    const amount = Math.round(total * 100);

    return Number.isSafeInteger(amount) && amount > 0
        ? amount
        : null;
}

function orderMatchesCheckout(order, intent, expectedAmount) {
    return (
        order &&
        order.id === intent.razorpayOrderId &&
        order.amount === expectedAmount &&
        order.currency === "INR" &&
        order.receipt === intent.bookingId
    );
}

export async function POST(request) {
    let intents;
    let intentId;
    let leaseToken;

    try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
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

        let body;

        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request body.");
        }

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body) ||
            Object.keys(body).some((key) => key !== "bookingId") ||
            typeof body.bookingId !== "string" ||
            !/^SV-[A-F0-9]{12}$/.test(body.bookingId)
        ) {
            return errorResponse("Invalid checkout reference.", 400);
        }

        const db = await getDatabase();
        intents = db.collection("checkout_intents");

        const intent = await intents.findOne({
            bookingId: body.bookingId,
        });

        if (!intent) {
            return errorResponse(
                "Checkout session not found. Please start again.",
                404
            );
        }

        intentId = intent._id;

        if (
            intent.status !== "awaiting_payment" ||
            intent.paymentStatus !== "pending"
        ) {
            return errorResponse(
                "This checkout session is no longer awaiting payment.",
                409
            );
        }

        if (
            !(intent.expiresAt instanceof Date) ||
            intent.expiresAt.getTime() <= Date.now()
        ) {
            await intents.updateOne(
                {
                    _id: intent._id,
                    status: "awaiting_payment",
                    paymentStatus: "pending",
                    expiresAt: { $lte: new Date() },
                },
                {
                    $set: {
                        status: "expired",
                        updatedAt: new Date(),
                    },
                }
            );

            return errorResponse(
                "Your checkout session has expired. Please start again.",
                410
            );
        }

        const amount = validCheckoutAmount(intent);

        if (amount === null) {
            console.error(
                "Invalid checkout amount:",
                intent.bookingId
            );

            return errorResponse(
                "The checkout amount is invalid.",
                500
            );
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        // Reuse a saved order only after checking it directly with Razorpay.
        if (intent.razorpayOrderId) {
            const existingOrder = await razorpay.orders.fetch(
                intent.razorpayOrderId
            );

            if (
                !orderMatchesCheckout(
                    existingOrder,
                    intent,
                    amount
                )
            ) {
                console.error(
                    "Saved Razorpay order does not match checkout:",
                    intent.bookingId
                );

                return errorResponse(
                    "The payment order could not be validated. Please contact the property.",
                    409
                );
            }

            return successResponse(intent, existingOrder, keyId);
        }

        // Acquire a short lease so concurrent requests do not normally
        // create separate Razorpay orders for the same checkout.
        const now = new Date();
        leaseToken = randomUUID();

        const lease = await intents.updateOne(
            {
                _id: intent._id,
                status: "awaiting_payment",
                paymentStatus: "pending",
                expiresAt: { $gt: now },
                razorpayOrderId: { $exists: false },
                $or: [
                    { orderCreationStatus: { $exists: false } },
                    { orderCreationStatus: "failed" },
                    {
                        orderCreationStatus: "creating",
                        orderCreationLeaseUntil: { $lte: now },
                    },
                ],
            },
            {
                $set: {
                    orderCreationStatus: "creating",
                    orderCreationLeaseToken: leaseToken,
                    orderCreationLeaseUntil: new Date(
                        now.getTime() + ORDER_CREATION_LEASE_MS
                    ),
                    updatedAt: now,
                },
            }
        );

        if (lease.modifiedCount !== 1) {
            const latest = await intents.findOne({
                _id: intent._id,
            });

            // Another request may have completed order creation.
            if (
                latest?.razorpayOrderId &&
                latest.status === "awaiting_payment" &&
                latest.paymentStatus === "pending" &&
                latest.expiresAt instanceof Date &&
                latest.expiresAt.getTime() > Date.now()
            ) {
                const savedOrder = await razorpay.orders.fetch(
                    latest.razorpayOrderId
                );

                const latestAmount = validCheckoutAmount(latest);

                if (
                    latestAmount === null ||
                    !orderMatchesCheckout(
                        savedOrder,
                        latest,
                        latestAmount
                    )
                ) {
                    return errorResponse(
                        "The payment order could not be validated. Please contact the property.",
                        409
                    );
                }

                return successResponse(latest, savedOrder, keyId);
            }

            return errorResponse(
                "Payment setup is already in progress. Please wait a moment and try again.",
                409
            );
        }

        // Create the Razorpay order using the server-calculated amount.
        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: intent.bookingId,
            notes: {
                bookingId: intent.bookingId,
                purpose: "SU_VILLA_CHECKOUT",
            },
        });

        if (
            !order ||
            typeof order.id !== "string" ||
            order.amount !== amount ||
            order.currency !== "INR" ||
            order.receipt !== intent.bookingId
        ) {
            console.error(
                "Razorpay returned an unexpected order:",
                intent.bookingId
            );

            return errorResponse(
                "Unable to validate the payment order. Please contact the property before retrying.",
                502
            );
        }

        // Save only if this request still owns the order-creation lease.
        const saveResult = await intents.updateOne(
            {
                _id: intent._id,
                status: "awaiting_payment",
                paymentStatus: "pending",
                expiresAt: { $gt: new Date() },
                orderCreationStatus: "creating",
                orderCreationLeaseToken: leaseToken,
                razorpayOrderId: { $exists: false },
            },
            {
                $set: {
                    razorpayOrderId: order.id,
                    orderCreationStatus: "created",
                    updatedAt: new Date(),
                },
                $unset: {
                    orderCreationLeaseToken: "",
                    orderCreationLeaseUntil: "",
                    orderCreationError: "",
                },
            }
        );

        if (saveResult.modifiedCount !== 1) {
            // The external order exists, but this request could not safely
            // associate it with the intent. Never return an unbound order.
            console.error(
                "Could not associate Razorpay order with checkout:",
                intent.bookingId,
                order.id
            );

            return errorResponse(
                "Payment setup could not be completed safely. Please contact the property before retrying.",
                409
            );
        }

        return successResponse(
            {
                ...intent,
                razorpayOrderId: order.id,
            },
            order,
            keyId
        );
    } catch (error) {
        console.error("Razorpay order creation failed:", error);

        // Release our lease after a definite failure where possible.
        // If the external request timed out after Razorpay created an order,
        // the outcome is uncertain; do not assume no order was created.
        if (intents && intentId && leaseToken) {
            try {
                await intents.updateOne(
                    {
                        _id: intentId,
                        orderCreationStatus: "creating",
                        orderCreationLeaseToken: leaseToken,
                        razorpayOrderId: { $exists: false },
                    },
                    {
                        $set: {
                            orderCreationStatus: "failed",
                            orderCreationError:
                                "Order creation needs retry or reconciliation.",
                            updatedAt: new Date(),
                        },
                        $unset: {
                            orderCreationLeaseToken: "",
                            orderCreationLeaseUntil: "",
                        },
                    }
                );
            } catch (cleanupError) {
                console.error(
                    "Failed to release order-creation lease:",
                    cleanupError
                );
            }
        }

        return errorResponse(
            "Unable to start payment. Please try again. If payment setup appears stuck, contact the property before retrying.",
            500
        );
    }
}
