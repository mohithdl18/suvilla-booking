import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/auth";



const SESSION_COOKIE = "suvilla_admin_session";
const SESSION_DURATION = 8 * 60 * 60;

function safeCompare(value, expected) {
    const valueBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);

    if (valueBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(valueBuffer, expectedBuffer);
}

export async function POST(request) {
    try {
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;

        if (!adminUsername || !adminPassword || !sessionSecret) {
            console.error(
                "Admin authentication environment variables are missing."
            );

            return NextResponse.json(
                { message: "Admin login is not configured." },
                { status: 500 }
            );
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { message: "Invalid request." },
                { status: 400 }
            );
        }

        const username =
            typeof body?.username === "string"
                ? body.username.trim()
                : "";

        const password =
            typeof body?.password === "string"
                ? body.password
                : "";

        if (!username || !password) {
            return NextResponse.json(
                { message: "Please enter your username and password." },
                { status: 400 }
            );
        }

        const validUsername = safeCompare(username, adminUsername);
        const validPassword = safeCompare(password, adminPassword);

        if (!validUsername || !validPassword) {
            return NextResponse.json(
                { message: "Invalid username or password." },
                { status: 401 }
            );
        }

        const token = createAdminSession(username, sessionSecret);

        const response = NextResponse.json({
            success: true,
            message: "Login successful.",
        });

        response.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: SESSION_DURATION,
        });

        return response;
    } catch (error) {
        console.error("Admin login error:", error);

        return NextResponse.json(
            { message: "Unable to process login. Please try again." },
            { status: 500 }
        );
    }
}