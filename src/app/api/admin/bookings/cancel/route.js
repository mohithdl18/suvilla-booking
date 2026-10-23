
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import clientPromise, { getDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { getStayDates } from "@/logic/booking";

function pinMatches(providedPin, expectedPin) {
    if (
        typeof providedPin !== "string" ||
        typeof expectedPin !== "string" ||
        !providedPin ||
        !expectedPin
    ) {
        return false;
    }

    const provided = Buffer.from(providedPin, "utf8");
    const expected = Buffer.from(expectedPin, "utf8");

    if (provided.length !== expected.length) {
        return false;
    }

    return timingSafeEqual(provided, expected);
}

// Support new multi-room bookings and older single-room bookings.
function getBookingRoomIds(booking) {
    if (Array.isArray(booking.roomIds) && booking.roomIds.length > 0) {
        return [...new Set(booking.roomIds)];
    }

    if (Array.isArray(booking.rooms) && booking.rooms.length > 0) {
        return [
            ...new Set(
                booking.rooms
                    .map((room) => room.roomId ?? room.id)
                    .filter(Boolean)
            ),
        ];
    }

    return booking.roomId ? [booking.roomId] : [];
}

export async function POST(request) {
    const auth = await requireAdmin();

    if (!auth.authorized) {
        return auth.response;
    }

    const expectedPin = process.env.ADMIN_CANCEL_PIN;

    if (!expectedPin) {
        console.error("ADMIN_CANCEL_PIN is not configured.");

        return NextResponse.json(
            {
                success: false,
                message: "Cancellation is not configured on the server.",
            },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { bookingId, pin } = body;

        if (
            typeof bookingId !== "string" ||
            !bookingId.trim() ||
            typeof pin !== "string" ||
            !pin
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Booking ID and cancellation PIN are required.",
                },
                { status: 400 }
            );
        }

        if (!pinMatches(pin, expectedPin)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Incorrect cancellation PIN.",
                },
                { status: 403 }
            );
        }

        const client = await clientPromise;
        const db = await getDatabase();

        const bookingsCollection = db.collection("bookings");
        const availabilityCollection = db.collection("availability");

        let bookingNotFound = false;
        let releasedRoomIds = [];

        const session = client.startSession();

        try {
            await session.withTransaction(async () => {
                bookingNotFound = false;
                releasedRoomIds = [];

                const booking = await bookingsCollection.findOne(
                    { bookingId: bookingId.trim() },
                    { session }
                );

                if (!booking) {
                    bookingNotFound = true;
                    return;
                }

                if (!booking.checkIn || !booking.checkOut) {
                    throw new Error(
                        "Booking is missing stay date information."
                    );
                }

                const roomIds = getBookingRoomIds(booking);

                if (roomIds.length === 0) {
                    throw new Error(
                        "Booking is missing room information."
                    );
                }

                const stayDates = getStayDates(
                    booking.checkIn,
                    booking.checkOut
                );

                if (stayDates.length === 0) {
                    throw new Error(
                        "Booking has invalid stay dates."
                    );
                }

                // Release every room reserved by this booking on every night.
                // Offline blocks are stored separately and remain untouched.
                for (const date of stayDates) {
                    for (const roomId of roomIds) {
                        await availabilityCollection.updateOne(
                            { date },
                            {
                                $pull: {
                                    booked_rooms: roomId,
                                },
                            },
                            { session }
                        );
                    }
                }

                // Remove only the selected booking document.
                await bookingsCollection.deleteOne(
                    { _id: booking._id },
                    { session }
                );

                releasedRoomIds = roomIds;
            });
        } finally {
            await session.endSession();
        }

        if (bookingNotFound) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Booking not found. It may already be deleted.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Booking cancelled and deleted successfully.",
            bookingId: bookingId.trim(),
            releasedRoomIds,
        });
    } catch (error) {
        console.error("Cancel booking API error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Unable to cancel the booking.",
            },
            { status: 500 }
        );
    }
}
