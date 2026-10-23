
import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";

const VALID_ROOMS = ["Room1", "Room2", "Room3", "Room4"];

function isValidDate(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }

    const parsed = new Date(`${date}T12:00:00`);

    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === date
    );
}

function isBookingActive(booking) {
    return !["cancelled", "canceled", "rejected"].includes(
        String(booking.status || "").toLowerCase()
    );
}

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

export async function GET(request) {
    const auth = await requireAdmin();

    if (!auth.authorized) return auth.response;

    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date");

        if (!isValidDate(date)) {
            return NextResponse.json(
                { success: false, message: "A valid date is required." },
                { status: 400 }
            );
        }

        const db = await getDatabase();

        const availability = await db.collection("availability").findOne(
            { date },
            { projection: { _id: 0, blocked_rooms: 1 } }
        );

        return NextResponse.json({
            success: true,
            date,
            blockedRooms: availability?.blocked_rooms || [],
        });
    } catch (error) {
        console.error("Admin blocked rooms fetch error:", error);

        return NextResponse.json(
            { success: false, message: "Unable to load blocked rooms." },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    const auth = await requireAdmin();

    if (!auth.authorized) return auth.response;

    try {
        const { roomId, date } = await request.json();

        if (!VALID_ROOMS.includes(roomId) || !isValidDate(date)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "A valid room and date are required.",
                },
                { status: 400 }
            );
        }

        const db = await getDatabase();
        const availabilityCollection = db.collection("availability");

        // Check customer bookings using both old and new data structures.
        const candidateBookings = await db
            .collection("bookings")
            .find({
                checkIn: { $lte: date },
                checkOut: { $gt: date },
                status: {
                    $nin: ["cancelled", "canceled", "rejected"],
                },
            })
            .project({
                _id: 0,
                roomId: 1,
                roomIds: 1,
                rooms: 1,
                status: 1,
            })
            .toArray();

        const customerBooking = candidateBookings.find(
            (booking) =>
                isBookingActive(booking) &&
                getBookingRoomIds(booking).includes(roomId)
        );

        if (customerBooking) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "This room already has a customer booking and cannot be blocked.",
                },
                { status: 409 }
            );
        }

        const existingAvailability =
            await availabilityCollection.findOne({ date });

        if (existingAvailability?.booked_rooms?.includes(roomId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "This room is already unavailable for that date.",
                },
                { status: 409 }
            );
        }

        if (existingAvailability?.blocked_rooms?.includes(roomId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "This room is already blocked for that date.",
                },
                { status: 409 }
            );
        }

        await availabilityCollection.updateOne(
            { date },
            {
                $setOnInsert: { date },
                $addToSet: { blocked_rooms: roomId },
            },
            { upsert: true }
        );

        return NextResponse.json({
            success: true,
            message: `${roomId} blocked for ${date}.`,
            roomId,
            date,
        });
    } catch (error) {
        console.error("Admin room block error:", error);

        return NextResponse.json(
            { success: false, message: "Unable to block this room." },
            { status: 500 }
        );
    }
}

export async function DELETE(request) {
    const auth = await requireAdmin();

    if (!auth.authorized) return auth.response;

    try {
        const { roomId, date } = await request.json();

        if (!VALID_ROOMS.includes(roomId) || !isValidDate(date)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "A valid room and date are required.",
                },
                { status: 400 }
            );
        }

        const db = await getDatabase();
        const availabilityCollection = db.collection("availability");

        const result = await availabilityCollection.updateOne(
            {
                date,
                blocked_rooms: roomId,
            },
            {
                $pull: { blocked_rooms: roomId },
            }
        );

        if (result.matchedCount === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No offline block was found for this room and date.",
                },
                { status: 404 }
            );
        }

        // Delete only if both reservation and block arrays are empty.
        await availabilityCollection.deleteOne({
            date,
            booked_rooms: { $exists: false },
            blocked_rooms: { $exists: false },
        });

        return NextResponse.json({
            success: true,
            message: `${roomId} unblocked for ${date}.`,
            roomId,
            date,
        });
    } catch (error) {
        console.error("Admin room unblock error:", error);

        return NextResponse.json(
            { success: false, message: "Unable to unblock this room." },
            { status: 500 }
        );
    }
}
