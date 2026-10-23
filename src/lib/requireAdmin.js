import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";

export async function requireAdmin() {
    try {
        const authenticated = await isAdminAuthenticated();

        if (!authenticated) {
            return {
                authorized: false,
                response: NextResponse.json(
                    {
                        success: false,
                        message: "Unauthorized. Please log in.",
                    },
                    { status: 401 }
                ),
            };
        }

        return {
            authorized: true,
            response: null,
        };
    } catch (error) {
        console.error("Admin authorization error:", error);

        return {
            authorized: false,
            response: NextResponse.json(
                {
                    success: false,
                    message: "Unable to verify admin access.",
                },
                { status: 500 }
            ),
        };
    }
}