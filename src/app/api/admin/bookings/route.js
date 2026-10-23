
import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
    const auth = await requireAdmin();

    if (!auth.authorized) {
        return auth.response;
    }

    try {
        const db = await getDatabase();

        const bookings = await db
            .collection("bookings")
            .find({})
            .sort({ createdAt: -1, _id: -1 })
            .project({
                _id: 0,

                // Booking identification
                bookingId: 1,

                // Support both the new multi-room and old single-room formats
                roomId: 1,
                roomIds: 1,
                rooms: 1,

                // Stay details
                checkIn: 1,
                checkOut: 1,
                nights: 1,

                // Guest and pricing details
                customer: 1,
                guests: 1,
                addons: 1,
                pricing: 1,

                // Booking status
                status: 1,
                paymentStatus: 1,
                createdAt: 1,
            })
            .toArray();

        return NextResponse.json({
            success: true,
            bookings,
        });
    } catch (error) {
        console.error("Admin bookings fetch failed:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Unable to load bookings.",
            },
            { status: 500 }
        );
    }
}
