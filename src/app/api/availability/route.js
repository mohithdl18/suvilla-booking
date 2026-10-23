import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/mongodb";

import {
    validateBookingDates,
    getStayDates,
    validateRoom,
} from "@/logic/booking";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);

        const checkIn = searchParams.get("checkIn");
        const checkOut = searchParams.get("checkOut");
        const roomId = searchParams.get("roomId");

        if (!checkIn || !checkOut) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Check-in and checkout dates are required.",
                },
                { status: 400 }
            );
        }

        if (!validateBookingDates(checkIn, checkOut)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Invalid check-in or checkout dates.",
                },
                { status: 400 }
            );
        }

        if (roomId && !validateRoom(roomId)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Invalid room ID.",
                },
                { status: 400 }
            );
        }

        const db = await getDatabase();
        const availabilityCollection = db.collection("availability");

        // Get all nights between check-in and checkout.
        // The checkout date itself is excluded by getStayDates().
        const dates = getStayDates(checkIn, checkOut);

        // Fetch both customer bookings and admin-blocked rooms.
        const records = await availabilityCollection
            .find(
                { date: { $in: dates } },
                {
                    projection: {
                        _id: 0,
                        date: 1,
                        booked_rooms: 1,
                        blocked_rooms: 1,
                    },
                }
            )
            .toArray();

        // Combine unavailable room IDs for each date.
        const unavailableRoomsByDate = Object.fromEntries(
            records.map((record) => {
                const bookedRooms = Array.isArray(record.booked_rooms)
                    ? record.booked_rooms
                    : [];

                const blockedRooms = Array.isArray(record.blocked_rooms)
                    ? record.blocked_rooms
                    : [];

                return [
                    record.date,
                    [...new Set([...bookedRooms, ...blockedRooms])],
                ];
            })
        );

        const rooms = ["Room1", "Room2", "Room3", "Room4"];

        const roomAvailability = rooms.map((id) => {
            const unavailable = dates.some((date) =>
                (unavailableRoomsByDate[date] || []).includes(id)
            );

            return {
                roomId: id,
                available: !unavailable,
            };
        });

        // Return availability for one selected room.
        if (roomId) {
            const selectedRoom = roomAvailability.find(
                (room) => room.roomId === roomId
            );

            return NextResponse.json({
                success: true,
                roomId,
                available: selectedRoom.available,
                checkIn,
                checkOut,
            });
        }

        // Return availability for all four rooms.
        return NextResponse.json({
            success: true,
            checkIn,
            checkOut,
            nights: dates.length,
            rooms: roomAvailability,
        });
    } catch (error) {
        console.error("Availability API error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Unable to retrieve room availability.",
            },
            { status: 500 }
        );
    }
}