
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
    try {
        const client = await clientPromise;

        await client.db("admin").command({ ping: 1 });

        return NextResponse.json({
            success: true,
            message: "MongoDB connection successful",
            database:
                process.env.MONGODB_DB || "suvilla_bookings",
        });
    } catch (error) {
        console.error(
            "MongoDB connection test failed:",
            error.message
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    "MongoDB connection failed. Check server logs.",
            },
            { status: 500 }
        );
    }
}
