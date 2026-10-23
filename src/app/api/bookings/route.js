
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getDatabase } from "@/lib/mongodb";
import pricingConfig from "@/data/pricing.json";

import {
    validateBookingDates,
    getStayDates,
    validateRoom,
} from "@/logic/booking";

import {
    calculateRoomPrice,
    calculateCheckoutFees,
} from "@/logic/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NIGHTS = 60;
const MAX_ROOMS = 3;
const MAX_BODY_BYTES = 20_000;
const CHECKOUT_TTL_HOURS = 24;

const VALID_MEAL_PLANS = ["lunch", "dinner", "lunchAndDinner"];

const MEAL_LABELS = {
    lunch: "Lunch",
    dinner: "Dinner",
    lunchAndDinner: "Lunch + Dinner",
};

const ALLOWED_BODY_KEYS = [
    "checkIn",
    "checkOut",
    "customer",
    "rooms",
    "addons",
];

const ALLOWED_CUSTOMER_KEYS = [
    "name",
    "email",
    "phone",
    "address",
    "city",
    "pinCode",
    "specialRequest",
];

const ALLOWED_ROOM_KEYS = ["roomId", "guests", "roomName", "addons"];
const ALLOWED_GUEST_KEYS = ["adults", "children"];
const ALLOWED_ADDON_KEYS = ["mealPlan", "driver", "driverMealPlan"];

function jsonError(message, status = 400) {
    return NextResponse.json(
        { success: false, message },
        { status }
    );
}

function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(object, allowedKeys) {
    return Object.keys(object).every((key) => allowedKeys.includes(key));
}

function rejectUnknownKeys(object, allowedKeys, label) {
    if (!isPlainObject(object)) {
        throw new Error(`Invalid ${label}.`);
    }

    if (!hasOnlyKeys(object, allowedKeys)) {
        throw new Error(
            `Unexpected fields in ${label}. Refresh the page and try again.`
        );
    }
}

function validCustomer(customer) {
    if (!isPlainObject(customer)) return false;
    if (!hasOnlyKeys(customer, ALLOWED_CUSTOMER_KEYS)) return false;

    const name = typeof customer.name === "string" ? customer.name.trim() : "";
    const email = typeof customer.email === "string" ? customer.email.trim() : "";
    const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";

    if (name.length < 2 || name.length > 100) return false;
    if (!/^[+0-9\s()-]{7,20}$/.test(phone)) return false;

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return false;
    }

    const optionalStringFields = [
        ["address", 300],
        ["city", 100],
        ["pinCode", 6],
        ["specialRequest", 1000],
    ];

    for (const [key, maxLength] of optionalStringFields) {
        if (
            customer[key] !== undefined &&
            (
                typeof customer[key] !== "string" ||
                customer[key].trim().length > maxLength
            )
        ) {
            return false;
        }
    }

    if (
        customer.pinCode !== undefined &&
        customer.pinCode.trim() !== "" &&
        !/^\d{6}$/.test(customer.pinCode.trim())
    ) {
        return false;
    }

    return true;
}

function normalizeCustomer(customer) {
    return {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email.trim().toLowerCase(),
        address: customer.address?.trim() ?? "",
        city: customer.city?.trim() ?? "",
        pinCode: customer.pinCode?.trim() ?? "",
        specialRequest: customer.specialRequest?.trim() ?? "",
    };
}

function validGuests(guests) {
    return (
        isPlainObject(guests) &&
        hasOnlyKeys(guests, ALLOWED_GUEST_KEYS) &&
        Number.isInteger(guests.adults) &&
        guests.adults >= 1 &&
        guests.adults <= 20 &&
        Number.isInteger(guests.children) &&
        guests.children >= 0 &&
        guests.children <= 20
    );
}

function getRoomCapacity(roomId) {
    if (roomId === "Room1" || roomId === "Room2") return 4;
    if (roomId === "Room3" || roomId === "Room4") return 3;
    return 0;
}

function normalizeRoomRequest(room) {
    rejectUnknownKeys(room, ALLOWED_ROOM_KEYS, "room selection");

    if (typeof room.roomId !== "string" || !validateRoom(room.roomId)) {
        throw new Error("Invalid room selected.");
    }

    if (!validGuests(room.guests)) {
        throw new Error("Invalid guest count for a selected room.");
    }

    const guestCount = room.guests.adults + room.guests.children;

    if (guestCount > getRoomCapacity(room.roomId)) {
        throw new Error("The selected room cannot accommodate those guests.");
    }

    // Add-ons are selected once for the entire booking.
    if (
        room.addons !== undefined &&
        (
            !isPlainObject(room.addons) ||
            Object.keys(room.addons).length !== 0
        )
    ) {
        throw new Error(
            "Send add-on selections once at the booking level."
        );
    }

    if (
        room.roomName !== undefined &&
        (
            typeof room.roomName !== "string" ||
            room.roomName.length > 100
        )
    ) {
        throw new Error("Invalid room selection.");
    }

    return {
        roomId: room.roomId,
        guests: {
            adults: room.guests.adults,
            children: room.guests.children,
        },
    };
}

function normalizeMealIds(value) {
    if (!Array.isArray(value)) {
        throw new Error("Invalid meal plan selected.");
    }

    if (
        value.length > VALID_MEAL_PLANS.length ||
        value.some((id) => !VALID_MEAL_PLANS.includes(id)) ||
        new Set(value).size !== value.length
    ) {
        throw new Error("Invalid meal plan selected.");
    }

    if (
        value.includes("lunchAndDinner") &&
        (value.includes("lunch") || value.includes("dinner"))
    ) {
        throw new Error("Invalid meal plan selected.");
    }

    return value;
}

function calculateMealCharges(mealIds, people, nights, labelPrefix = "") {
    const meals = {};
    const items = [];
    let total = 0;

    for (const mealId of mealIds) {
        const price = pricingConfig.meals?.[mealId];

        if (!Number.isFinite(price) || price < 0) {
            throw new Error("Invalid meal selection.");
        }

        const mealTotal = price * people * nights;

        meals[mealId] = {
            selected: true,
            people,
            pricePerPersonPerNight: price,
            total: mealTotal,
        };

        items.push({
            id: mealId,
            name: `${labelPrefix}${MEAL_LABELS[mealId]}`,
            quantity: people,
            price,
            total: mealTotal,
        });

        total += mealTotal;
    }

    return {
        meals,
        items,
        total,
        mealPlan: mealIds,
    };
}

function calculateBookingAddons(addons, totalGuests, nights) {
    rejectUnknownKeys(addons, ALLOWED_ADDON_KEYS, "add-on selection");

    const guestMealIds = normalizeMealIds(addons.mealPlan ?? []);
    const driver = addons.driver ?? false;

    if (typeof driver !== "boolean") {
        throw new Error("Invalid driver accommodation selection.");
    }

    const driverMealIds = normalizeMealIds(addons.driverMealPlan ?? []);

    if (!driver && driverMealIds.length > 0) {
        throw new Error(
            "Select driver accommodation before choosing driver meals."
        );
    }

    const guestMeals = calculateMealCharges(
        guestMealIds,
        totalGuests,
        nights
    );

    const driverMeals = driver
        ? calculateMealCharges(driverMealIds, 1, nights, "Driver ")
        : {
            meals: {},
            items: [],
            total: 0,
            mealPlan: [],
        };

    const driverPrice = Number(pricingConfig.driver?.price);

    if (!Number.isFinite(driverPrice) || driverPrice < 0) {
        throw new Error("Pricing configuration is invalid.");
    }

    const driverTotal = driver ? driverPrice * nights : 0;
    const items = [...guestMeals.items];

    if (driver) {
        items.push({
            id: "driver",
            name: "Driver accommodation",
            quantity: nights,
            price: driverPrice,
            total: driverTotal,
        });

        items.push(...driverMeals.items);
    }

    return {
        extraAdults: 0,
        children: 0,
        mealPlan: guestMeals.mealPlan,
        meals: guestMeals.meals,
        driver,
        driverMealPlan: driverMeals.mealPlan,
        driverMeals: driverMeals.meals,
        items,
        extraAdultTotal: 0,
        childTotal: 0,
        mealTotal: guestMeals.total,
        driverTotal,
        driverMealTotal: driverMeals.total,
        total: guestMeals.total + driverTotal + driverMeals.total,
    };
}

function getIndiaToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const values = Object.fromEntries(
        parts.map(({ type, value }) => [type, value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

function validateDateStrings(checkIn, checkOut) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (
        typeof checkIn !== "string" ||
        typeof checkOut !== "string" ||
        !datePattern.test(checkIn) ||
        !datePattern.test(checkOut)
    ) {
        return false;
    }

    const isRealDate = (value) => {
        const date = new Date(`${value}T00:00:00.000Z`);

        return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value
        );
    };

    return isRealDate(checkIn) && isRealDate(checkOut);
}

const VALIDATION_MESSAGES = [
    "Invalid booking request.",
    "Invalid customer.",
    "Invalid room selection.",
    "Unexpected fields in booking request. Refresh the page and try again.",
    "Unexpected fields in customer. Refresh the page and try again.",
    "Unexpected fields in room selection. Refresh the page and try again.",
    "Unexpected fields in add-on selection. Refresh the page and try again.",
    "Invalid room selected.",
    "Invalid guest count for a selected room.",
    "The selected room cannot accommodate those guests.",
    "Send add-on selections once at the booking level.",
    "Invalid add-on selection.",
    "Invalid meal plan selected.",
    "Invalid meal selection.",
    "Invalid driver accommodation selection.",
    "Select driver accommodation before choosing driver meals.",
];

export async function POST(request) {
    try {
        const contentType = request.headers.get("content-type") ?? "";

        if (!contentType.toLowerCase().includes("application/json")) {
            return jsonError("Content-Type must be application/json.", 415);
        }

        const contentLength = Number(
            request.headers.get("content-length") ?? 0
        );

        if (contentLength > MAX_BODY_BYTES) {
            return jsonError("Request body is too large.", 413);
        }

        const rawBody = await request.text();

        if (!rawBody || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
            return jsonError("Invalid or oversized request body.", 413);
        }

        let body;

        try {
            body = JSON.parse(rawBody);
        } catch {
            return jsonError("Invalid JSON request body.");
        }

        rejectUnknownKeys(body, ALLOWED_BODY_KEYS, "booking request");

        const { checkIn, checkOut, customer } = body;

        if (!validateDateStrings(checkIn, checkOut)) {
            return jsonError("Invalid check-in or checkout dates.");
        }

        if (!validateBookingDates(checkIn, checkOut)) {
            return jsonError("Invalid check-in or checkout dates.");
        }

        if (checkIn < getIndiaToday()) {
            return jsonError("Check-in cannot be in the past.");
        }

        const stayDates = getStayDates(checkIn, checkOut);

        if (stayDates.length < 1 || stayDates.length > MAX_NIGHTS) {
            return jsonError(
                `A booking must be between 1 and ${MAX_NIGHTS} nights.`
            );
        }

        if (!validCustomer(customer)) {
            return jsonError(
                "Enter valid contact details and a valid PIN code."
            );
        }

        if (
            !Array.isArray(body.rooms) ||
            body.rooms.length < 1 ||
            body.rooms.length > MAX_ROOMS
        ) {
            return jsonError(`Select between 1 and ${MAX_ROOMS} rooms.`);
        }

        if (!isPlainObject(body.addons)) {
            return jsonError("Invalid add-on selection.");
        }

        const rooms = body.rooms.map(normalizeRoomRequest);
        const roomIds = rooms.map((room) => room.roomId);

        if (new Set(roomIds).size !== roomIds.length) {
            return jsonError("Each selected room must be unique.");
        }

        const totalGuests = rooms.reduce(
            (sum, room) =>
                sum + room.guests.adults + room.guests.children,
            0
        );

        // All pricing is calculated on the server.
        const roomPricing = calculateRoomPrice(checkIn, checkOut);

        if (
            !Number.isInteger(roomPricing.nights) ||
            roomPricing.nights !== stayDates.length ||
            !Number.isFinite(roomPricing.roomTotal) ||
            roomPricing.roomTotal < 0
        ) {
            throw new Error("Pricing configuration is invalid.");
        }

        const bookingAddons = calculateBookingAddons(
            body.addons,
            totalGuests,
            roomPricing.nights
        );

        // calculateRoomPrice returns the rate for one room.
        const pricedRooms = rooms.map((room) => ({
            roomId: room.roomId,
            guests: room.guests,
            addons: {
                extraAdults: 0,
                children: 0,
                mealPlan: [],
                meals: {},
                driver: false,
                driverMealPlan: [],
                driverMeals: {},
                items: [],
                total: 0,
            },
            pricing: {
                nightlyBreakdown: roomPricing.nightlyBreakdown,
                roomTotal: roomPricing.roomTotal,
                addonTotal: 0,
                subtotal: roomPricing.roomTotal,
            },
        }));

        const roomTotal = pricedRooms.reduce(
            (sum, room) => sum + room.pricing.roomTotal,
            0
        );

        const addonTotal = bookingAddons.total;
        const subtotal = roomTotal + addonTotal;
        const fees = calculateCheckoutFees(subtotal);

        if (
            !Number.isFinite(fees.total) ||
            fees.total < 0 ||
            !Number.isFinite(fees.tax) ||
            !Number.isFinite(fees.platformFee)
        ) {
            throw new Error("Pricing configuration is invalid.");
        }

        const bookingId = `SV-${randomUUID()
            .replace(/-/g, "")
            .slice(0, 12)
            .toUpperCase()}`;

        const now = new Date();
        const expiresAt = new Date(
            now.getTime() + CHECKOUT_TTL_HOURS * 60 * 60 * 1000
        );

        // Temporary checkout data only. No booking or room reservation yet.
        const checkoutIntent = {
            bookingId,
            roomIds,
            rooms: pricedRooms,
            addons: bookingAddons,
            checkIn,
            checkOut,
            stayDates,
            nights: roomPricing.nights,
            customer: normalizeCustomer(customer),
            guests: {
                adults: rooms.reduce(
                    (sum, room) => sum + room.guests.adults,
                    0
                ),
                children: rooms.reduce(
                    (sum, room) => sum + room.guests.children,
                    0
                ),
                total: totalGuests,
            },
            pricing: {
                nightlyBreakdown: roomPricing.nightlyBreakdown,
                roomTotal,
                addonTotal,
                subtotal: fees.subtotal,
                tax: fees.tax,
                platformFee: fees.platformFee,
                total: fees.total,
            },
            status: "awaiting_payment",
            paymentStatus: "pending",
            createdAt: now,
            expiresAt,
        };

        const db = await getDatabase();
        const availabilityCollection = db.collection("availability");
        const intentsCollection = db.collection("checkout_intents");

        // Preliminary availability check only. This does not reserve rooms.
        // Final availability must be checked atomically after payment capture.
        for (const date of stayDates) {
            const existing = await availabilityCollection.findOne(
                { date },
                {
                    projection: {
                        booked_rooms: 1,
                        blocked_rooms: 1,
                    },
                }
            );

            const bookedRooms = existing?.booked_rooms ?? [];
            const blockedRooms = existing?.blocked_rooms ?? [];

            if (
                roomIds.some(
                    (roomId) =>
                        bookedRooms.includes(roomId) ||
                        blockedRooms.includes(roomId)
                )
            ) {
                return jsonError(
                    "One or more selected rooms are no longer available. Please search again.",
                    409
                );
            }
        }

        // Indexes must be created separately, not on every checkout request.
        // Do NOT add a TTL index on expiresAt: a captured payment may still
        // require booking finalization or recovery after the intent expires.
        await intentsCollection.insertOne(checkoutIntent);

        return NextResponse.json(
            {
                success: true,
                message:
                    "Checkout prepared. Complete payment to confirm your booking.",
                booking: {
                    bookingId,
                    status: "awaiting_payment",
                    paymentStatus: "pending",
                    checkIn,
                    checkOut,
                    nights: roomPricing.nights,
                    rooms: pricedRooms,
                    guests: checkoutIntent.guests,
                    addons: bookingAddons,
                    pricing: checkoutIntent.pricing,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        if (VALIDATION_MESSAGES.includes(error.message)) {
            return jsonError(error.message);
        }

        if (error.code === 11000) {
            return jsonError(
                "Unable to prepare checkout. Please try again.",
                409
            );
        }

        console.error("Checkout preparation failed:", error);

        return jsonError(
            "Unable to prepare checkout. Please try again.",
            500
        );
    }
}
