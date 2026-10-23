
"use client";

import { useState } from "react";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

function formatDate(dateString) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatINR(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
}

function getRoomName(room, index) {
    return (
        room?.roomName ||
        room?.name ||
        room?.title ||
        room?.roomId ||
        room?.id ||
        `Room ${index + 1}`
    );
}

function getRoomGuests(room, fallbackAdults, fallbackChildren) {
    return {
        adults: Number(
            room?.guests?.adults ?? room?.adults ?? fallbackAdults
        ),
        children: Number(
            room?.guests?.children ?? room?.children ?? fallbackChildren
        ),
    };
}

function getMealLabel(mealId) {
    const labels = {
        lunch: "Lunch",
        dinner: "Dinner",
        lunchAndDinner: "Lunch + Dinner",
    };

    return labels[mealId] || mealId;
}

function getSelectedMealIds(addonData, prefix = "") {
    const directKey = prefix
        ? `${prefix}MealPlan`
        : "mealPlan";

    const directValue = addonData?.[directKey];

    if (Array.isArray(directValue)) {
        return directValue;
    }

    if (typeof directValue === "string" && directValue !== "none") {
        return [directValue];
    }

    const mealsKey = prefix ? `${prefix}Meals` : "meals";
    const meals = addonData?.[mealsKey];

    if (meals && typeof meals === "object") {
        return Object.keys(meals).filter(
            (key) => meals[key]?.selected === true
        );
    }

    return [];
}

function getAddonLines(addonData) {
    if (!addonData || typeof addonData !== "object") {
        return [];
    }

    const items = Array.isArray(addonData.items)
        ? addonData.items
        : [];

    if (items.length > 0) {
        return items.map((item, index) => ({
            id: item.id ?? `addon-${index}`,
            name: item.name ?? item.label ?? "Extra",
            total: Number(item.total ?? item.amount) || 0,
        }));
    }

    const lines = [];

    const guestMeals = getSelectedMealIds(addonData);

    for (const mealId of guestMeals) {
        const meal = addonData.meals?.[mealId];

        lines.push({
            id: `guest-${mealId}`,
            name: `Guest ${getMealLabel(mealId)}`,
            total: Number(meal?.total) || 0,
        });
    }

    if (addonData.driver === true) {
        lines.push({
            id: "driver",
            name: "Driver accommodation",
            total: Number(addonData.driverTotal) || 0,
        });

        const driverMeals = getSelectedMealIds(addonData, "driver");

        for (const mealId of driverMeals) {
            const meal = addonData.driverMeals?.[mealId];

            lines.push({
                id: `driver-${mealId}`,
                name: `Driver ${getMealLabel(mealId)}`,
                total: Number(meal?.total) || 0,
            });
        }
    }

    return lines;
}

export default function BookingDetailsModal({
    room,
    rooms: selectedRooms = [],
    addons = {},
    checkIn,
    checkOut,
    adults = 2,
    children = 0,
    customer = {},
    onContinue,
    onBack,
    onClose,
}) {
    const [form, setForm] = useState({
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: customer.address || "",
        city: customer.city || "",
        pinCode: customer.pinCode || "",
        specialRequest: customer.specialRequest || "",
    });

    const [error, setError] = useState("");

    const rooms =
        Array.isArray(selectedRooms) && selectedRooms.length > 0
            ? selectedRooms
            : room
              ? [room]
              : [];

    const roomSummaries = rooms.map((item, index) => {
        const guests = getRoomGuests(item, adults, children);

        return {
            roomId: item?.roomId || item?.id || `Room${index + 1}`,
            name: getRoomName(item, index),
            adults: guests.adults,
            children: guests.children,
            totalGuests: guests.adults + guests.children,
        };
    });

    const totalAdults = roomSummaries.reduce(
        (sum, item) => sum + item.adults,
        0
    );

    const totalChildren = roomSummaries.reduce(
        (sum, item) => sum + item.children,
        0
    );

    const totalGuests = totalAdults + totalChildren;

    // Read booking-wide add-ons once, not once per selected room.
    const combinedAddons = addons?.addons ?? addons ?? {};
    const addonLines = getAddonLines(combinedAddons);

    const addonTotal = Number(
        addons?.total ?? combinedAddons?.total ?? 0
    );

    const guestMealIds = getSelectedMealIds(combinedAddons);
    const driverMealIds = getSelectedMealIds(combinedAddons, "driver");

    function updateField(field, value) {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));

        if (error) setError("");
    }

    function handleSubmit(event) {
        event.preventDefault();

        const customerDetails = {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            pinCode: form.pinCode.trim(),
            specialRequest: form.specialRequest.trim(),
        };

        if (
            !customerDetails.name ||
            !customerDetails.email ||
            !customerDetails.phone ||
            !customerDetails.address ||
            !customerDetails.city ||
            !customerDetails.pinCode
        ) {
            setError("Please complete all required fields.");
            return;
        }

        if (customerDetails.name.length < 2) {
            setError("Please enter your full name.");
            return;
        }

        if (!/^[+0-9 ()-]{7,20}$/.test(customerDetails.phone)) {
            setError("Please enter a valid phone number.");
            return;
        }

        if (
            customerDetails.email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerDetails.email)
        ) {
            setError("Please enter a valid email address.");
            return;
        }

        if (!/^\d{6}$/.test(customerDetails.pinCode)) {
            setError("Please enter a valid 6-digit PIN code.");
            return;
        }

        setError("");
        onContinue?.(customerDetails);
    }

    const inputClass =
        "mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:ring-2";

    const inputStyle = {
        borderColor: `${COLORS.foreground}25`,
        "--tw-ring-color": COLORS.accent,
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-details-title"
                className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl sm:p-7"
                style={{
                    backgroundColor: COLORS.background,
                    color: COLORS.foreground,
                }}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                            Booking · Step 2 of 3
                        </p>

                        <h2
                            id="booking-details-title"
                            className="mt-2 text-2xl font-semibold"
                        >
                            Guest details
                        </h2>

                        <p className="mt-1 text-sm opacity-70">
                            Confirm your reservation and provide your contact
                            information.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close guest details"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
                    >
                        <span className="text-2xl">×</span>
                    </button>
                </div>

                {/* Reservation summary */}
                <section
                    className="mt-6 rounded-xl border p-4"
                    style={{
                        borderColor: `${COLORS.foreground}20`,
                        backgroundColor: "#FFFFFF80",
                    }}
                >
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                        Your reservation
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="opacity-60">Check-in</p>
                            <p className="mt-1 font-medium">
                                {formatDate(checkIn)}
                            </p>
                        </div>

                        <div>
                            <p className="opacity-60">Check-out</p>
                            <p className="mt-1 font-medium">
                                {formatDate(checkOut)}
                            </p>
                        </div>
                    </div>

                    <div
                        className="mt-4 space-y-3 border-t pt-4"
                        style={{
                            borderColor: `${COLORS.foreground}15`,
                        }}
                    >
                        {roomSummaries.map((item, index) => (
                            <div
                                key={`${item.roomId}-${index}`}
                                className="flex items-start justify-between gap-4"
                            >
                                <div>
                                    <p className="font-semibold">{item.name}</p>

                                    <p className="mt-1 text-xs opacity-65">
                                        {item.adults}{" "}
                                        {item.adults === 1 ? "adult" : "adults"}
                                        {item.children > 0 &&
                                            ` · ${item.children} ${
                                                item.children === 1
                                                    ? "child"
                                                    : "children"
                                            }`}
                                    </p>
                                </div>

                                <span className="shrink-0 text-sm font-medium">
                                    {item.totalGuests}{" "}
                                    {item.totalGuests === 1 ? "guest" : "guests"}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div
                        className="mt-4 border-t pt-3"
                        style={{
                            borderColor: `${COLORS.foreground}15`,
                        }}
                    >
                        <p className="text-xs opacity-60">
                            Total across {rooms.length}{" "}
                            {rooms.length === 1 ? "room" : "rooms"}
                        </p>

                        <p className="mt-1 font-semibold">
                            {totalGuests} guests · {totalAdults} adults
                            {totalChildren > 0 &&
                                ` · ${totalChildren} ${
                                    totalChildren === 1 ? "child" : "children"
                                }`}
                        </p>
                    </div>
                </section>

                {/* Read-only extras summary */}
                <section
                    className="mt-4 rounded-xl border p-4"
                    style={{
                        borderColor: `${COLORS.foreground}20`,
                        backgroundColor: "#FFFFFF80",
                    }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="font-semibold">Selected extras</h3>
                            <p className="mt-1 text-xs opacity-60">
                                Extras apply to your entire reservation.
                            </p>
                        </div>

                        <span className="shrink-0 font-semibold">
                            {formatINR(addonTotal)}
                        </span>
                    </div>

                    {addonLines.length > 0 ? (
                        <div className="mt-3 space-y-2 border-t pt-3"
                            style={{
                                borderColor: `${COLORS.foreground}15`,
                            }}
                        >
                            {addonLines.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-start justify-between gap-3 text-sm"
                                >
                                    <span className="opacity-80">{item.name}</span>
                                    <span className="shrink-0">
                                        {formatINR(item.total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 border-t pt-3 text-sm opacity-60"
                            style={{
                                borderColor: `${COLORS.foreground}15`,
                            }}
                        >
                            No additional extras selected.
                        </p>
                    )}

                    {guestMealIds.length > 0 && (
                        <p className="mt-3 text-xs opacity-65">
                            Guest meals:{" "}
                            {guestMealIds.map(getMealLabel).join(", ")}
                        </p>
                    )}

                    {combinedAddons.driver === true && (
                        <div className="mt-3 rounded-lg bg-black/[0.035] p-3 text-sm">
                            <p className="font-medium">
                                Driver accommodation selected
                            </p>

                            <p className="mt-1 text-xs opacity-70">
                                Driver meals:{" "}
                                {driverMealIds.length > 0
                                    ? driverMealIds.map(getMealLabel).join(", ")
                                    : "None selected"}
                            </p>
                        </div>
                    )}
                </section>

                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                    {/* Contact information */}
                    <section>
                        <h3 className="font-semibold">Contact information</h3>

                        <div className="mt-3 space-y-4">
                            <div>
                                <label
                                    htmlFor="booking-guest-name"
                                    className="block text-sm font-medium"
                                >
                                    Full name *
                                </label>

                                <input
                                    id="booking-guest-name"
                                    type="text"
                                    autoComplete="name"
                                    required
                                    minLength={2}
                                    maxLength={100}
                                    value={form.name}
                                    onChange={(event) =>
                                        updateField("name", event.target.value)
                                    }
                                    placeholder="Enter your full name"
                                    className={inputClass}
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="booking-guest-email"
                                    className="block text-sm font-medium"
                                >
                                    Email address *
                                </label>

                                <input
                                    id="booking-guest-email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    maxLength={254}
                                    value={form.email}
                                    onChange={(event) =>
                                        updateField("email", event.target.value)
                                    }
                                    placeholder="you@example.com"
                                    className={inputClass}
                                    style={inputStyle}
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="booking-guest-phone"
                                    className="block text-sm font-medium"
                                >
                                    Phone number *
                                </label>

                                <input
                                    id="booking-guest-phone"
                                    type="tel"
                                    autoComplete="tel"
                                    required
                                    minLength={7}
                                    maxLength={20}
                                    pattern="[+0-9 ()-]{7,20}"
                                    value={form.phone}
                                    onChange={(event) =>
                                        updateField("phone", event.target.value)
                                    }
                                    placeholder="Enter your phone number"
                                    className={inputClass}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Billing address */}
                    <section>
                        <h3 className="font-semibold">Billing address</h3>

                        <div className="mt-3 space-y-4">
                            <div>
                                <label
                                    htmlFor="booking-address"
                                    className="block text-sm font-medium"
                                >
                                    Address *
                                </label>

                                <textarea
                                    id="booking-address"
                                    autoComplete="street-address"
                                    required
                                    maxLength={300}
                                    rows={2}
                                    value={form.address}
                                    onChange={(event) =>
                                        updateField("address", event.target.value)
                                    }
                                    placeholder="House number, street and area"
                                    className={inputClass}
                                    style={inputStyle}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="booking-city"
                                        className="block text-sm font-medium"
                                    >
                                        City *
                                    </label>

                                    <input
                                        id="booking-city"
                                        type="text"
                                        autoComplete="address-level2"
                                        required
                                        maxLength={100}
                                        value={form.city}
                                        onChange={(event) =>
                                            updateField("city", event.target.value)
                                        }
                                        placeholder="Enter your city"
                                        className={inputClass}
                                        style={inputStyle}
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="booking-pin"
                                        className="block text-sm font-medium"
                                    >
                                        PIN code *
                                    </label>

                                    <input
                                        id="booking-pin"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="postal-code"
                                        required
                                        maxLength={6}
                                        pattern="[0-9]{6}"
                                        value={form.pinCode}
                                        onChange={(event) =>
                                            updateField(
                                                "pinCode",
                                                event.target.value
                                                    .replace(/\D/g, "")
                                                    .slice(0, 6)
                                            )
                                        }
                                        placeholder="6-digit PIN code"
                                        className={inputClass}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Special request */}
                    <section>
                        <label
                            htmlFor="booking-special-request"
                            className="block font-semibold"
                        >
                            Special requests
                            <span className="ml-2 text-xs font-normal opacity-60">
                                Optional
                            </span>
                        </label>

                        <textarea
                            id="booking-special-request"
                            rows={3}
                            maxLength={1000}
                            value={form.specialRequest}
                            onChange={(event) =>
                                updateField(
                                    "specialRequest",
                                    event.target.value
                                )
                            }
                            placeholder="Any preferences or requests for your stay?"
                            className={inputClass}
                            style={inputStyle}
                        />

                        <p className="mt-1 text-xs opacity-60">
                            Requests are subject to availability and confirmation.
                        </p>
                    </section>

                    {error && (
                        <p
                            role="alert"
                            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                        >
                            {error}
                        </p>
                    )}

                    {/* Actions */}
                    <div
                        className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between"
                        style={{
                            borderColor: `${COLORS.foreground}15`,
                        }}
                    >
                        <button
                            type="button"
                            onClick={onBack}
                            className="rounded-xl border px-5 py-3 text-sm font-semibold transition hover:bg-black/5"
                            style={{
                                borderColor: `${COLORS.foreground}30`,
                            }}
                        >
                            Back to add-ons
                        </button>

                        <button
                            type="submit"
                            className="rounded-xl px-6 py-3 text-sm font-bold transition hover:brightness-95"
                            style={{
                                backgroundColor: COLORS.accent,
                                color: COLORS.foreground,
                            }}
                        >
                            Continue to Checkout
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
