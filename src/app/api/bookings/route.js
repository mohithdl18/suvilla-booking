
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import clientPromise, { getDatabase } from "@/lib/mongodb";
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

const ALLOWED_ROOM_KEYS = [
    "roomId",
    "guests",
    "roomName",
    "addons",
];

const ALLOWED_GUEST_KEYS = ["adults", "children"];

const ALLOWED_ADDON_KEYS = [
    "mealPlan",
    "driver",
    "driverMealPlan",
];

function jsonError(message, status = 400) {
    return NextResponse.json(
        { success: false, message },
        { status }
    );
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null)
    );
}

function hasOnlyKeys(object, allowedKeys) {
    return Object.keys(object).every((key) =>
        allowedKeys.includes(key)
    );
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

    if (!hasOnlyKeys(customer, ALLOWED_CUSTOMER_KEYS)) {
        return false;
    }

    const name =
        typeof customer.name === "string"
            ? customer.name.trim()
            : "";

    const email =
        typeof customer.email === "string"
            ? customer.email.trim()
            : "";

    const phone =
        typeof customer.phone === "string"
            ? customer.phone.trim()
            : "";

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
            (typeof customer[key] !== "string" ||
                customer[key].trim().length > maxLength)
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
    if (roomId === "Room1" || roomId === "Room2") {
        return 4;
    }

    if (roomId === "Room3" || roomId === "Room4") {
        return 3;
    }

    return 0;
}

function normalizeRoomRequest(room) {
    rejectUnknownKeys(room, ALLOWED_ROOM_KEYS, "room selection");

    if (
        typeof room.roomId !== "string" ||
        !validateRoom(room.roomId)
    ) {
        throw new Error("Invalid room selected.");
    }

    if (!validGuests(room.guests)) {
        throw new Error("Invalid guest count for a selected room.");
    }

    const guestCount = room.guests.adults + room.guests.children;

    if (guestCount > getRoomCapacity(room.roomId)) {
        throw new Error(
            "The selected room cannot accommodate those guests."
        );
    }

    // Compatibility only: nested room add-ons must be empty.
    // All actual add-on choices belong to the top-level addons field.
    if (
        room.addons !== undefined &&
        (!isPlainObject(room.addons) ||
            Object.keys(room.addons).length !== 0)
    ) {
        throw new Error(
            "Send add-on selections once at the booking level."
        );
    }

    if (
        room.roomName !== undefined &&
        (typeof room.roomName !== "string" ||
            room.roomName.length > 100)
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
        const price = pricingConfig.meals[mealId];

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

    const guestMealIds = normalizeMealIds(
        addons.mealPlan ?? []
    );

    const driver = addons.driver ?? false;

    if (typeof driver !== "boolean") {
        throw new Error("Invalid driver accommodation selection.");
    }

    const driverMealIds = normalizeMealIds(
        addons.driverMealPlan ?? []
    );

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

    const driverPrice = Number(pricingConfig.driver.price);

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

export async function POST(request) {
    let session;

    try {
        // Enforce JSON requests and a small request body limit.
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

        if (
            !rawBody ||
            Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES
        ) {
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
            return jsonError(
                `Select between 1 and ${MAX_ROOMS} rooms.`
            );
        }

        if (!isPlainObject(body.addons)) {
            return jsonError("Invalid add-on selection.");
        }

        const rooms = body.rooms.map(normalizeRoomRequest);
        const roomIds = rooms.map((item) => item.roomId);

        if (new Set(roomIds).size !== roomIds.length) {
            return jsonError("Each selected room must be unique.");
        }

        const totalGuests = rooms.reduce(
            (sum, item) =>
                sum + item.guests.adults + item.guests.children,
            0
        );

        // All pricing is recalculated here using server-side configuration.
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

        // calculateRoomPrice returns the price for one room.
        const pricedRooms = rooms.map((item) => ({
            roomId: item.roomId,
            guests: item.guests,
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
            (sum, item) => sum + item.pricing.roomTotal,
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

        // This route reserves the booking as pending payment.
        // A separate verified payment flow must confirm it.
        const booking = {
            bookingId,
            roomIds,
            rooms: pricedRooms,
            addons: bookingAddons,
            checkIn,
            checkOut,
            nights: roomPricing.nights,
            customer: normalizeCustomer(customer),
            guests: {
                adults: rooms.reduce(
                    (sum, item) => sum + item.guests.adults,
                    0
                ),
                children: rooms.reduce(
                    (sum, item) => sum + item.guests.children,
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
            status: "pending_payment",
            paymentStatus: "pending",
            createdAt: new Date(),
        };

        const client = await clientPromise;
        const db = await getDatabase();

        const availabilityCollection = db.collection("availability");
        const bookingsCollection = db.collection("bookings");

        // Prefer creating indexes in a deployment migration, not on each request.
        await availabilityCollection.createIndex(
            { date: 1 },
            { unique: true }
        );

        await bookingsCollection.createIndex(
            { bookingId: 1 },
            { unique: true }
        );

        session = client.startSession();

        await session.withTransaction(async () => {
            // Check all rooms for all nights.
            for (const date of stayDates) {
                const existing = await availabilityCollection.findOne(
                    { date },
                    { session }
                );

                const bookedRooms = existing?.booked_rooms ?? [];
                const blockedRooms = existing?.blocked_rooms ?? [];

                for (const roomId of roomIds) {
                    if (
                        bookedRooms.includes(roomId) ||
                        blockedRooms.includes(roomId)
                    ) {
                        throw new Error("ROOM_UNAVAILABLE");
                    }
                }
            }

            // Write the availability documents inside the same transaction.
            for (const date of stayDates) {
                await availabilityCollection.updateOne(
                    { date },
                    {
                        $setOnInsert: { date },
                        $addToSet: {
                            booked_rooms: { $each: roomIds },
                        },
                    },
                    {
                        upsert: true,
                        session,
                    }
                );
            }

            await bookingsCollection.insertOne(booking, { session });
        });

        return NextResponse.json(
            {
                success: true,
                message: "Booking created. Payment is required to confirm it.",
                booking: {
                    bookingId: booking.bookingId,
                    status: booking.status,
                    paymentStatus: booking.paymentStatus,
                    checkIn: booking.checkIn,
                    checkOut: booking.checkOut,
                    nights: booking.nights,
                    rooms: booking.rooms,
                    guests: booking.guests,
                    addons: booking.addons,
                    pricing: booking.pricing,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        if (error.message === "ROOM_UNAVAILABLE") {
            return jsonError(
                "One or more selected rooms are no longer available. Please search again.",
                409
            );
        }

        const validationMessages = [
            "Invalid booking request.",
            "Unexpected fields in booking request. Refresh the page and try again.",
            "Unexpected fields in customer. Refresh the page and try again.",
            "Unexpected fields in room selection. Refresh the page and try again.",
            "Unexpected fields in add-on selection. Refresh the page and try again.",
            "Invalid room selection.",
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

        if (validationMessages.includes(error.message)) {
            return jsonError(error.message);
        }

        if (
            error.code === 11000 ||
            error.code === 112 ||
            error.codeName === "WriteConflict"
        ) {
            return jsonError(
                "Availability changed while processing your request. Please search again.",
                409
            );
        }

        console.error("Booking creation failed:", error);

        return jsonError(
            "Unable to create the booking. Please try again.",
            500
        );
    } finally {
        if (session) {
            await session.endSession();
        }
    }
}
