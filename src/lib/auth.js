import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

function signPayload(payload, secret) {
    return createHmac("sha256", secret)
        .update(payload)
        .digest("base64url");
}

export function createAdminSession(username, secret) {
    const payload = Buffer.from(
        JSON.stringify({
            username,
            expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION,
        })
    ).toString("base64url");

    const signature = signPayload(payload, secret);

    return `${payload}.${signature}`;
}

export function verifyAdminSessionToken(token, secret) {
    if (!token || !secret || typeof token !== "string") {
        return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const [payload, signature] = parts;

    if (!payload || !signature) {
        return null;
    }

    const expectedSignature = signPayload(payload, secret);

    if (!safeCompare(signature, expectedSignature)) {
        return null;
    }

    try {
        const decoded = Buffer.from(payload, "base64url").toString("utf8");
        const session = JSON.parse(decoded);

        if (
            typeof session.username !== "string" ||
            typeof session.expiresAt !== "number" ||
            session.expiresAt <= Math.floor(Date.now() / 1000)
        ) {
            return null;
        }

        return {
            username: session.username,
            expiresAt: session.expiresAt,
        };
    } catch {
        return null;
    }
}

export async function getAdminSession() {
    const secret = process.env.ADMIN_SESSION_SECRET;

    if (!secret) {
        return null;
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    return verifyAdminSessionToken(token, secret);
}

export async function isAdminAuthenticated() {
    const session = await getAdminSession();

    return Boolean(
        session &&
        session.username === process.env.ADMIN_USERNAME
    );
}