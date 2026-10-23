
"use client";

import { useEffect } from "react";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
});

function currency(value) {
    return currencyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
    if (!value) return "—";

    const [year, month, day] = String(value).split("-").map(Number);

    if (!year || !month || !day) return value;

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });
}

function formatDateTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function Detail({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-50">
                {label}
            </p>
            <p className="mt-1 break-words text-sm font-medium">
                {value === undefined || value === null || value === ""
                    ? "—"
                    : String(value)}
            </p>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="border-t py-5 first:border-t-0 first:pt-0">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#052a50]">
                {title}
            </h3>
            {children}
        </section>
    );
}

function getStatusStyle(status) {
    switch (String(status || "").toLowerCase()) {
        case "confirmed":
            return {
                background: "#dcfce7",
                color: "#166534",
                label: "Confirmed",
            };

        case "cancelled":
        case "canceled":
            return {
                background: "#fee2e2",
                color: "#991b1b",
                label: "Cancelled",
            };

        case "rejected":
            return {
                background: "#ffedd5",
                color: "#9a3412",
                label: "Rejected",
            };

        default:
            return {
                background: "#f1f5f9",
                color: "#334155",
                label: status || "Unknown",
            };
    }
}

function getPaymentStyle(status) {
    if (String(status || "").toLowerCase() === "paid") {
        return {
            background: "#dcfce7",
            color: "#166534",
            label: "Paid",
        };
    }

    return {
        background: "#f1f5f9",
        color: "#334155",
        label: status || "Not recorded",
    };
}

// Supports both multi-room and legacy single-room booking documents.
function getBookingRooms(booking) {
    if (Array.isArray(booking.rooms) && booking.rooms.length > 0) {
        return booking.rooms.map((room) => ({
            ...room,
            roomId: room.roomId ?? room.id,
            guests: room.guests ?? {},
            addons: room.addons ?? {},
            pricing: room.pricing ?? {},
        }));
    }

    return [
        {
            roomId: booking.roomId ?? booking.roomIds?.[0],
            guests: booking.guests ?? {},
            addons: booking.addons ?? {},
            pricing: booking.pricing ?? {},
        },
    ];
}

function getAddonLines(addons = {}) {
    const lines = [];

    if (Number(addons.extraAdults) > 0) {
        lines.push({
            label: `Extra adults (${addons.extraAdults})`,
            amount: addons.extraAdultTotal,
        });
    }

    if (Number(addons.children) > 0) {
        lines.push({
            label: `Children (${addons.children})`,
            amount: addons.childTotal,
        });
    }

    if (addons.extraBreakfast === true) {
        lines.push({
            label: "Extra breakfast",
            amount: addons.breakfastTotal,
        });
    } else if (Number(addons.extraBreakfast) > 0) {
        lines.push({
            label: `Extra breakfasts (${addons.extraBreakfast})`,
            amount: addons.breakfastTotal,
        });
    }

    if (addons.driver) {
        lines.push({
            label: "Driver accommodation",
            amount: addons.driverTotal,
        });
    }

    const mealLabels = {
        lunch: "Lunch",
        dinner: "Dinner",
        lunchAndDinner: "Lunch and dinner",
    };

    Object.entries(addons.meals || {}).forEach(([key, meal]) => {
        if (meal?.selected) {
            lines.push({
                label: mealLabels[key] || key,
                detail: meal.people ? `${meal.people} people` : "",
                amount: meal.total,
            });
        }
    });

    if (Array.isArray(addons.mealPlan)) {
        addons.mealPlan.forEach((meal) => {
            if (
                typeof meal === "string" &&
                !addons.meals?.[meal]?.selected
            ) {
                lines.push({
                    label: mealLabels[meal] || meal,
                    amount: null,
                });
            }
        });
    }

    if (Array.isArray(addons.items)) {
        addons.items.forEach((item) => {
            // Avoid duplicating extras already represented above.
            const alreadyRepresented =
                ["Extra adults", "Children", "Extra breakfast",
                    "Driver accommodation"].includes(item.name) ||
                Object.values(mealLabels).includes(item.name);

            if (alreadyRepresented) return;

            lines.push({
                label: `${item.name || "Additional item"}${
                    item.quantity ? ` × ${item.quantity}` : ""
                }`,
                amount: item.total,
            });
        });
    }

    return lines;
}

function getRoomName(room) {
    return (
        room.roomName ||
        room.name ||
        (room.roomId
            ? room.roomId.replace(/^Room(\d+)$/, "Room $1")
            : "Room not specified")
    );
}

function getRoomTotal(room) {
    if (Number.isFinite(Number(room.pricing?.roomTotal))) {
        return Number(room.pricing.roomTotal);
    }

    return Number(room.roomTotal ?? room.price) || 0;
}

function getRoomAddonTotal(room) {
    if (Number.isFinite(Number(room.pricing?.addonTotal))) {
        return Number(room.pricing.addonTotal);
    }

    return Number(room.addons?.total) || 0;
}

export default function BookingDetailsModal({ booking, onClose }) {
    useEffect(() => {
        if (!booking) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                onClose?.();
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [booking, onClose]);

    if (!booking) return null;

    const customer = booking.customer || {};
    const guests = booking.guests || {};
    const pricing = booking.pricing || {};
    const rooms = getBookingRooms(booking);

    const status = getStatusStyle(booking.status);
    const paymentStatus = getPaymentStyle(booking.paymentStatus);

    const amountPaid =
        String(booking.paymentStatus || "").toLowerCase() === "paid"
            ? Number(pricing.total) || 0
            : 0;

    const roomCount = rooms.length;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#052a50]/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose?.();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-modal-title"
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#F7FAEE] text-[#052a50] shadow-2xl"
            >
                <header className="flex items-start justify-between gap-4 border-b border-[#052a50]/10 px-5 py-5 sm:px-7">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7b24]">
                            SU VILLA · Reservation
                        </p>

                        <h2
                            id="booking-modal-title"
                            className="mt-2 break-words text-xl font-semibold sm:text-2xl"
                        >
                            {booking.bookingId || "Booking details"}
                        </h2>

                        <p className="mt-1 text-sm opacity-60">
                            Created {formatDateTime(booking.createdAt)}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close booking details"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#052a50]/15 text-xl transition hover:bg-[#052a50]/5"
                    >
                        ×
                    </button>
                </header>

                <div className="overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
                    <div className="mb-6 flex flex-wrap gap-2">
                        <span
                            className="rounded-full px-3 py-1.5 text-xs font-semibold"
                            style={{
                                backgroundColor: status.background,
                                color: status.color,
                            }}
                        >
                            {status.label}
                        </span>

                        <span
                            className="rounded-full px-3 py-1.5 text-xs font-semibold"
                            style={{
                                backgroundColor: paymentStatus.background,
                                color: paymentStatus.color,
                            }}
                        >
                            Payment: {paymentStatus.label}
                        </span>

                        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold">
                            {roomCount} {roomCount === 1 ? "room" : "rooms"}
                        </span>
                    </div>

                    <Section title="Stay details">
                        <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
                            <Detail
                                label="Rooms booked"
                                value={rooms.map(getRoomName).join(", ")}
                            />

                            <Detail
                                label="Check-in"
                                value={formatDate(booking.checkIn)}
                            />

                            <Detail
                                label="Check-out"
                                value={formatDate(booking.checkOut)}
                            />

                            <Detail
                                label="Duration"
                                value={`${booking.nights || 0} ${
                                    Number(booking.nights) === 1
                                        ? "night"
                                        : "nights"
                                }`}
                            />

                            <Detail
                                label="Total adults"
                                value={guests.adults ?? rooms.reduce(
                                    (sum, room) =>
                                        sum + (Number(room.guests.adults) || 0),
                                    0
                                )}
                            />

                            <Detail
                                label="Total children"
                                value={guests.children ?? rooms.reduce(
                                    (sum, room) =>
                                        sum + (Number(room.guests.children) || 0),
                                    0
                                )}
                            />
                        </div>
                    </Section>

                    <Section title="Room allocations and add-ons">
                        <div className="space-y-4">
                            {rooms.map((room, index) => {
                                const roomGuests = room.guests || {};
                                const roomAddons = room.addons || {};
                                const roomLines = getAddonLines(roomAddons);
                                const roomTotal = getRoomTotal(room);
                                const roomAddonTotal = getRoomAddonTotal(room);

                                return (
                                    <article
                                        key={`${room.roomId || "room"}-${index}`}
                                        className="rounded-xl border border-[#052a50]/10 bg-white/70 p-4 sm:p-5"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider opacity-50">
                                                    Room {index + 1}
                                                </p>

                                                <h4 className="mt-1 text-base font-semibold">
                                                    {getRoomName(room)}
                                                </h4>

                                                <p className="mt-1 text-xs opacity-65">
                                                    {Number(roomGuests.adults) || 0} adults
                                                    {" · "}
                                                    {Number(roomGuests.children) || 0} children
                                                </p>
                                            </div>

                                            <div className="text-right">
                                                <p className="text-xs opacity-55">
                                                    Room price
                                                </p>
                                                <p className="mt-1 font-semibold">
                                                    {currency(roomTotal)}
                                                </p>
                                            </div>
                                        </div>

                                        {roomLines.length > 0 ? (
                                            <div className="mt-4 space-y-2 border-t border-[#052a50]/10 pt-3">
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-55">
                                                    Selected extras
                                                </p>

                                                {roomLines.map((item, lineIndex) => (
                                                    <div
                                                        key={`${item.label}-${lineIndex}`}
                                                        className="flex items-start justify-between gap-4 text-sm"
                                                    >
                                                        <div>
                                                            <p className="font-medium">
                                                                {item.label}
                                                            </p>

                                                            {item.detail && (
                                                                <p className="mt-1 text-xs opacity-55">
                                                                    {item.detail}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <span className="shrink-0 font-medium">
                                                            {item.amount == null
                                                                ? "—"
                                                                : currency(item.amount)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="mt-4 border-t border-[#052a50]/10 pt-3 text-xs opacity-55">
                                                No add-ons selected for this room.
                                            </p>
                                        )}

                                        <div className="mt-3 flex justify-between border-t border-[#052a50]/10 pt-3 text-sm">
                                            <span className="opacity-65">
                                                Room add-ons total
                                            </span>
                                            <span className="font-semibold">
                                                {currency(roomAddonTotal)}
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </Section>

                    <Section title="Guest information">
                        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                            <Detail label="Full name" value={customer.name} />
                            <Detail label="Phone" value={customer.phone} />
                            <Detail label="Email" value={customer.email} />
                            <Detail label="Address" value={customer.address} />
                            <Detail label="City" value={customer.city} />
                            <Detail label="PIN code" value={customer.pinCode} />
                        </div>
                    </Section>

                    <Section title="Special requests">
                        <p className="whitespace-pre-wrap text-sm leading-6">
                            {customer.specialRequest || "No special requests."}
                        </p>
                    </Section>

                    <Section title="Price breakdown">
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between gap-4">
                                <span className="opacity-65">All rooms total</span>
                                <span>{currency(pricing.roomTotal)}</span>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="opacity-65">All add-ons total</span>
                                <span>{currency(pricing.addonTotal)}</span>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="opacity-65">Subtotal</span>
                                <span>{currency(pricing.subtotal)}</span>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="opacity-65">Tax</span>
                                <span>{currency(pricing.tax)}</span>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="opacity-65">Platform fee</span>
                                <span>{currency(pricing.platformFee)}</span>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-4 border-t border-[#052a50]/15 pt-4">
                                <span className="font-semibold">
                                    Total reservation amount
                                </span>

                                <span className="text-xl font-semibold">
                                    {currency(pricing.total)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-4 rounded-xl bg-white/70 p-4">
                                <span className="text-sm opacity-65">
                                    Amount paid
                                </span>

                                <span className="font-semibold">
                                    {currency(amountPaid)}
                                </span>
                            </div>
                        </div>
                    </Section>

                    {Array.isArray(pricing.nightlyBreakdown) &&
                        pricing.nightlyBreakdown.length > 0 && (
                            <Section title="Nightly rate breakdown">
                                <div className="space-y-3">
                                    {pricing.nightlyBreakdown.map((night, index) => (
                                        <div
                                            key={`${night.date || index}`}
                                            className="flex items-center justify-between gap-4 text-sm"
                                        >
                                            <div>
                                                <p className="font-medium">
                                                    {formatDate(night.date)}
                                                </p>

                                                {night.type && (
                                                    <p className="mt-1 text-xs opacity-55">
                                                        {night.type}
                                                    </p>
                                                )}
                                            </div>

                                            <span className="font-medium">
                                                {currency(
                                                    night.rate ??
                                                        night.price ??
                                                        night.amount
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        )}
                </div>

                <footer className="flex justify-end border-t border-[#052a50]/10 bg-white/50 px-5 py-4 sm:px-7">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-[#052a50] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0b3b6b]"
                    >
                        Close details
                    </button>
                </footer>
            </div>
        </div>
    );
}
