
"use client";

import { useMemo, useState } from "react";
import pricing from "@/data/pricing.json";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

function formatINR(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
}

function normalizeRoom(room, index, fallbackAdults, fallbackChildren) {
    const adults = Number(
        room?.guests?.adults ??
            room?.adults ??
            (index === 0 ? fallbackAdults : 2)
    );

    const children = Number(
        room?.guests?.children ??
            room?.children ??
            (index === 0 ? fallbackChildren : 0)
    );

    return {
        roomId: String(room?.roomId ?? room?.id ?? `Room${index + 1}`),
        roomName:
            room?.roomName ??
            room?.name ??
            room?.title ??
            `Room ${index + 1}`,
        guestAllocationId: String(
            room?.guestAllocationId ?? room?.guests?.id ?? index + 1
        ),
        guests: {
            adults: Number.isInteger(adults) ? adults : 2,
            children: Number.isInteger(children) ? children : 0,
        },
    };
}

function getMealOptions() {
    return [
        {
            id: "lunch",
            label: "Lunch",
            description: "Lunch for all guests in this booking.",
            price: Number(pricing.meals.lunch) || 0,
        },
        {
            id: "dinner",
            label: "Dinner",
            description: "Dinner for all guests in this booking.",
            price: Number(pricing.meals.dinner) || 0,
        },
        {
            id: "lunchAndDinner",
            label: "Lunch + Dinner",
            description: "Both meals for all guests in this booking.",
            price: Number(pricing.meals.lunchAndDinner) || 0,
        },
    ];
}

function getSelectedMealTotal(selection, mealOptions, people, nights) {
    if (!selection) return 0;

    const option = mealOptions.find((item) => item.id === selection);

    return option ? option.price * people * nights : 0;
}

function createEmptyRoomAddons() {
    return {
        extraAdults: 0,
        children: 0,
        mealPlan: [],
        meals: {},
        driver: false,
        driverMealPlan: [],
        driverMeals: {},
        items: [],
        extraAdultTotal: 0,
        childTotal: 0,
        mealTotal: 0,
        driverTotal: 0,
        total: 0,
    };
}

export default function AddonsModal({
    room,
    rooms: initialRooms = [],
    checkIn,
    checkOut,
    nights = 1,
    adults = 2,
    children = 0,
    onContinue,
    onClose,
}) {
    const mealOptions = useMemo(() => getMealOptions(), []);

    const sourceRooms = useMemo(() => {
        if (Array.isArray(initialRooms) && initialRooms.length > 0) {
            return initialRooms;
        }

        if (Array.isArray(room?.rooms) && room.rooms.length > 0) {
            return room.rooms;
        }

        return room ? [room] : [];
    }, [initialRooms, room]);

    const roomStates = useMemo(
        () =>
            sourceRooms.map((item, index) =>
                normalizeRoom(item, index, adults, children)
            ),
        [sourceRooms, adults, children]
    );

    const totalGuests = roomStates.reduce(
        (total, item) =>
            total + item.guests.adults + item.guests.children,
        0
    );

    const [guestMealPlan, setGuestMealPlan] = useState("");
    const [driver, setDriver] = useState(false);
    const [driverMealPlan, setDriverMealPlan] = useState("");

    const guestMealsTotal = getSelectedMealTotal(
        guestMealPlan,
        mealOptions,
        totalGuests,
        nights
    );

    const driverMealsTotal = driver
        ? getSelectedMealTotal(driverMealPlan, mealOptions, 1, nights)
        : 0;

    const driverAccommodationTotal = driver
        ? (Number(pricing.driver.price) || 0) * nights
        : 0;

    const addonsTotal =
        guestMealsTotal +
        driverAccommodationTotal +
        driverMealsTotal;

    const selectedGuestMeal = mealOptions.find(
        (option) => option.id === guestMealPlan
    );

    const selectedDriverMeal = mealOptions.find(
        (option) => option.id === driverMealPlan
    );

    function selectGuestMeal(mealId) {
        setGuestMealPlan((current) => (current === mealId ? "" : mealId));
    }

    function selectDriverMeal(mealId) {
        setDriverMealPlan((current) => (current === mealId ? "" : mealId));
    }

    function handleContinue() {
        if (roomStates.length === 0) return;

        const guestMeals = selectedGuestMeal
            ? {
                  [selectedGuestMeal.id]: {
                      selected: true,
                      people: totalGuests,
                      pricePerPersonPerNight: selectedGuestMeal.price,
                      total: guestMealsTotal,
                  },
              }
            : {};

        const driverMeals = selectedDriverMeal
            ? {
                  [selectedDriverMeal.id]: {
                      selected: true,
                      people: 1,
                      pricePerPersonPerNight: selectedDriverMeal.price,
                      total: driverMealsTotal,
                  },
              }
            : {};

        const addonItems = [];

        if (selectedGuestMeal) {
            addonItems.push({
                id: selectedGuestMeal.id,
                label: `${selectedGuestMeal.label} for ${totalGuests} guests`,
                amount: guestMealsTotal,
            });
        }

        if (driver) {
            addonItems.push({
                id: "driver",
                label: "Driver accommodation",
                amount: driverAccommodationTotal,
            });

            if (selectedDriverMeal) {
                addonItems.push({
                    id: `driver-${selectedDriverMeal.id}`,
                    label: `Driver ${selectedDriverMeal.label}`,
                    amount: driverMealsTotal,
                });
            }
        }

        const bookingAddons = {
            extraAdults: 0,
            children: 0,
            mealPlan: selectedGuestMeal ? [selectedGuestMeal.id] : [],
            meals: guestMeals,
            driver,
            driverMealPlan:
                driver && selectedDriverMeal
                    ? [selectedDriverMeal.id]
                    : [],
            driverMeals,
            items: addonItems,
            extraAdultTotal: 0,
            childTotal: 0,
            mealTotal: guestMealsTotal + driverMealsTotal,
            driverTotal: driverAccommodationTotal,
            total: addonsTotal,
        };

        const selectedRooms = roomStates.map((item, index) => ({
            roomId: item.roomId,
            roomName: item.roomName,
            guestAllocationId: item.guestAllocationId,
            guests: {
                adults: item.guests.adults,
                children: item.guests.children,
            },
            addons: index === 0
                ? bookingAddons
                : createEmptyRoomAddons(),
        }));

        onContinue?.({
            rooms: selectedRooms,
            roomCount: selectedRooms.length,
            totalGuests,
            addons: bookingAddons,
            total: addonsTotal,
        });
    }

    if (roomStates.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="addons-title"
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl p-5 shadow-2xl sm:rounded-2xl sm:p-7"
                style={{
                    backgroundColor: COLORS.background,
                    color: COLORS.foreground,
                }}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                            Booking · Step 1 of 3
                        </p>

                        <h2
                            id="addons-title"
                            className="mt-2 text-2xl font-semibold"
                        >
                            Customize your stay
                        </h2>

                        <p className="mt-1 text-sm opacity-70">
                            {roomStates.length}{" "}
                            {roomStates.length === 1 ? "room" : "rooms"} ·{" "}
                            {nights} {nights === 1 ? "night" : "nights"}
                        </p>

                        {checkIn && checkOut && (
                            <p className="mt-1 text-xs opacity-60">
                                {checkIn} to {checkOut}
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close add-ons"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
                    >
                        <span className="text-2xl">×</span>
                    </button>
                </div>

                {/* Selected rooms and guests */}
                <section className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">
                            Your rooms and guests
                        </h3>

                        <span className="text-sm font-semibold">
                            {totalGuests}{" "}
                            {totalGuests === 1 ? "guest" : "guests"}
                        </span>
                    </div>

                    <div className="mt-3 space-y-3">
                        {roomStates.map((item, index) => (
                            <div
                                key={`${item.roomId}-${item.guestAllocationId}`}
                                className="rounded-xl border p-4"
                                style={{
                                    borderColor: `${COLORS.foreground}20`,
                                    backgroundColor: "rgba(255,255,255,0.45)",
                                }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold">
                                            {index + 1}. {item.roomName}
                                        </p>

                                        <p className="mt-1 text-sm opacity-70">
                                            {item.guests.adults}{" "}
                                            {item.guests.adults === 1
                                                ? "adult"
                                                : "adults"}
                                            {item.guests.children > 0
                                                ? `, ${item.guests.children} ${
                                                      item.guests.children === 1
                                                          ? "child"
                                                          : "children"
                                                  }`
                                                : ""}
                                        </p>
                                    </div>

                                    <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium">
                                        {item.guests.adults +
                                            item.guests.children}{" "}
                                        guests
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="mt-2 text-xs opacity-60">
                        Rooms and guest allocations are fixed for this step.
                    </p>
                </section>

                {/* Guest meals */}
                <section className="mt-7">
                    <h3 className="font-semibold">Meals for your guests</h3>

                    <p className="mt-1 text-xs opacity-60">
                        Choose one option for all {totalGuests} guests.
                    </p>

                    <div className="mt-3 space-y-2">
                        {mealOptions.map((option) => {
                            const selected = guestMealPlan === option.id;

                            return (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition"
                                    style={{
                                        borderColor: selected
                                            ? COLORS.accent
                                            : `${COLORS.foreground}20`,
                                        backgroundColor: selected
                                            ? `${COLORS.accent}20`
                                            : "transparent",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() =>
                                            selectGuestMeal(option.id)
                                        }
                                        className="mt-1 h-4 w-4 accent-[#e4b441]"
                                    />

                                    <span className="flex-1">
                                        <span className="block text-sm font-semibold">
                                            {option.label}
                                        </span>
                                        <span className="mt-1 block text-xs opacity-65">
                                            {option.description}
                                        </span>
                                    </span>

                                    <span className="text-right text-sm font-semibold">
                                        {formatINR(
                                            option.price * totalGuests * nights
                                        )}
                                        <span className="block text-xs font-normal opacity-60">
                                            total
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </section>

                {/* Driver accommodation and meals */}
                <section className="mt-7">
                    <label
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-4"
                        style={{
                            borderColor: driver
                                ? COLORS.accent
                                : `${COLORS.foreground}20`,
                            backgroundColor: driver
                                ? `${COLORS.accent}15`
                                : "transparent",
                        }}
                    >
                        <span>
                            <span className="block font-semibold">
                                Driver accommodation
                            </span>
                            <span className="mt-1 block text-xs opacity-60">
                                {formatINR(pricing.driver.price)} per night
                            </span>
                        </span>

                        <input
                            type="checkbox"
                            checked={driver}
                            onChange={(event) => {
                                const enabled = event.target.checked;
                                setDriver(enabled);

                                if (!enabled) {
                                    setDriverMealPlan("");
                                }
                            }}
                            className="h-4 w-4 accent-[#e4b441]"
                        />
                    </label>

                    {driver && (
                        <div className="mt-3 rounded-xl border p-4">
                            <h4 className="font-semibold">
                                Meals for the driver
                            </h4>

                            <p className="mt-1 text-xs opacity-60">
                                Choose one option for the driver, separately
                                from guest meals.
                            </p>

                            <div className="mt-3 space-y-2">
                                {mealOptions.map((option) => {
                                    const selected =
                                        driverMealPlan === option.id;

                                    return (
                                        <label
                                            key={option.id}
                                            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition"
                                            style={{
                                                borderColor: selected
                                                    ? COLORS.accent
                                                    : `${COLORS.foreground}20`,
                                                backgroundColor: selected
                                                    ? `${COLORS.accent}20`
                                                    : "transparent",
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() =>
                                                    selectDriverMeal(option.id)
                                                }
                                                className="h-4 w-4 accent-[#e4b441]"
                                            />

                                            <span className="flex-1 text-sm font-medium">
                                                {option.label}
                                            </span>

                                            <span className="text-sm font-semibold">
                                                {formatINR(option.price * nights)}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </section>

                {/* Combined add-ons summary */}
                <section className="mt-7 rounded-xl border border-black/10 bg-white/50 p-4">
                    <h3 className="font-semibold">Add-ons summary</h3>

                    <div className="mt-3 space-y-2">
                        {selectedGuestMeal && (
                            <div className="flex justify-between gap-4 text-sm">
                                <span>
                                    {selectedGuestMeal.label} for {totalGuests} guests
                                </span>
                                <span className="font-medium">
                                    {formatINR(guestMealsTotal)}
                                </span>
                            </div>
                        )}

                        {driver && (
                            <div className="flex justify-between gap-4 text-sm">
                                <span>Driver accommodation</span>
                                <span className="font-medium">
                                    {formatINR(driverAccommodationTotal)}
                                </span>
                            </div>
                        )}

                        {driver && selectedDriverMeal && (
                            <div className="flex justify-between gap-4 text-sm">
                                <span>
                                    Driver {selectedDriverMeal.label}
                                </span>
                                <span className="font-medium">
                                    {formatINR(driverMealsTotal)}
                                </span>
                            </div>
                        )}

                        {addonsTotal === 0 && (
                            <p className="text-sm opacity-60">
                                No additional charges selected.
                            </p>
                        )}
                    </div>

                    <div className="mt-4 flex justify-between border-t border-black/10 pt-3">
                        <span className="font-semibold">
                            Combined add-ons total
                        </span>
                        <span className="text-lg font-bold">
                            {formatINR(addonsTotal)}
                        </span>
                    </div>

                    <p className="mt-2 text-xs opacity-60">
                        Extras are selected once for the entire booking.
                        Final pricing, taxes and fees are calculated at checkout.
                    </p>
                </section>

                {/* Actions */}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-black/15 px-5 py-3 text-sm font-semibold transition hover:bg-black/5"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={handleContinue}
                        className="rounded-xl px-6 py-3 text-sm font-bold transition hover:brightness-95"
                        style={{
                            backgroundColor: COLORS.accent,
                            color: COLORS.foreground,
                        }}
                    >
                        Continue to Guest Details
                    </button>
                </div>
            </div>
        </div>
    );
}
