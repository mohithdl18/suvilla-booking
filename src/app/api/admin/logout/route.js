import { NextResponse } from "next/server";

const SESSION_COOKIE = "suvilla_admin_session";

export async function POST() {
    const response = NextResponse.json({
        success: true,
        message: "Logged out successfully.",
    });

    response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        expires: new Date(0),
        maxAge: 0,
    });

    return response;
}