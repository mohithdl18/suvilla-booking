
"use client";

import { useState } from "react";
import { calculateRoomPrice } from "@/logic/pricing";

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

function formatDate(dateString) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
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

function getRoomGuests(room, adults, children) {
    return {
        adults: Number(room?.guests?.adults ?? room?.adults ?? adults),
        children: Number(
            room?.guests?.children ?? room?.children ?? children
        ),
    };
}

function PriceRow({ label, amount, bold = false }) {
    return (
        <div
            className={`flex items-center justify-between gap-4 ${
                bold ? "text-base font-bold" : ""
            }`}
        >
            <span>{label}</span>
            <span>{formatINR(amount)}</span>
        </div>
    );
}

export default function Checkout({
    room,
    rooms: selectedRooms = [],
    checkIn,
    checkOut,
    nights = 1,
    adults = 2,
    children = 0,
    addons = {},
    customer = {},
    onBack,
    onConfirm,
    loading = false,
}) {
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const rooms =
        Array.isArray(selectedRooms) && selectedRooms.length > 0
            ? selectedRooms
            : room
              ? [room]
              : [];

    const roomPricing = checkIn && checkOut
        ? calculateRoomPrice(checkIn, checkOut)
        : null;

    const roomSummaries = rooms.map((item, index) => {
        const guests = getRoomGuests(item, adults, children);

        const roomTotal = Number(
            item?.roomTotal ??
                item?.pricing?.roomTotal ??
                roomPricing?.roomTotal ??
                (Number(item?.price) || 0) * nights
        );

        return {
            roomId: item?.roomId ?? item?.id ?? `Room${index + 1}`,
            name: getRoomName(item, index),
            guests,
            roomTotal: Number.isFinite(roomTotal) ? roomTotal : 0,
        };
    });

    const roomTotal = roomSummaries.reduce(
        (sum, item) => sum + item.roomTotal,
        0
    );

    // New booking-wide add-ons are supplied once by AddonsModal.
    const combinedAddons = addons?.addons ?? addons ?? {};

    const addonTotal = Number(
        addons?.total ?? combinedAddons?.total ?? 0
    );

    const addonItems = Array.isArray(combinedAddons?.items)
        ? combinedAddons.items
        : [];

    const subtotal = roomTotal + addonTotal;

    // Display estimates only. The API calculates the authoritative total.
    const tax = Math.round(subtotal * 0.18);
    const platformFee = Math.round(subtotal * 0.02);
    const total = subtotal + tax + platformFee;

    const totalAdults = roomSummaries.reduce(
        (sum, item) => sum + item.guests.adults,
        0
    );

    const totalChildren = roomSummaries.reduce(
        (sum, item) => sum + item.guests.children,
        0
    );

    function handleSubmit(event) {
        event.preventDefault();

        if (!acceptedTerms || loading || rooms.length === 0) return;

        onConfirm?.({
            customer,
            rooms: roomSummaries.map((item) => ({
                roomId: item.roomId,
                roomName: item.name,
                guests: item.guests,
                addons: {},
            })),
            addons: combinedAddons,
            pricing: {
                roomTotal,
                addonTotal,
                subtotal,
                tax,
                platformFee,
                total,
            },
        });
    }

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto p-4"
            style={{ backgroundColor: "rgba(5,42,80,0.65)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
        >
            <div
                className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl shadow-2xl"
                style={{
                    backgroundColor: COLORS.background,
                    color: COLORS.foreground,
                }}
            >
                {/* Header */}
                <div
                    className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-6 py-5"
                    style={{
                        backgroundColor: COLORS.background,
                        borderColor: `${COLORS.foreground}20`,
                    }}
                >
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
                            SU VILLA
                        </p>

                        <h2
                            id="checkout-title"
                            className="mt-1 text-2xl font-semibold"
                        >
                            Review your booking
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onBack}
                        disabled={loading}
                        className="rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-50"
                        style={{
                            borderColor: `${COLORS.foreground}30`,
                        }}
                    >
                        Back
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 p-6">
                    {/* Stay summary */}
                    <section>
                        <h3 className="font-semibold">Your stay</h3>

                        <div className="mt-3 rounded-xl border border-black/10 bg-white/50 p-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
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

                                <div>
                                    <p className="opacity-60">Duration</p>
                                    <p className="mt-1 font-medium">
                                        {nights}{" "}
                                        {nights === 1 ? "night" : "nights"}
                                    </p>
                                </div>

                                <div>
                                    <p className="opacity-60">Rooms</p>
                                    <p className="mt-1 font-medium">
                                        {rooms.length}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-3 border-t border-black/10 pt-4">
                                {roomSummaries.map((item, index) => (
                                    <div
                                        key={`${item.roomId}-${index}`}
                                        className="rounded-lg border border-black/10 p-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold">
                                                    {item.name}
                                                </p>

                                                <p className="mt-1 text-xs opacity-65">
                                                    {item.guests.adults}{" "}
                                                    {item.guests.adults === 1
                                                        ? "adult"
                                                        : "adults"}
                                                    {" · "}
                                                    {item.guests.children}{" "}
                                                    {item.guests.children === 1
                                                        ? "child"
                                                        : "children"}
                                                </p>
                                            </div>

                                            <p className="shrink-0 text-sm font-semibold">
                                                {formatINR(item.roomTotal)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-4 border-t border-black/10 pt-3 text-sm">
                                <p className="font-semibold">All guests</p>
                                <p className="mt-1 opacity-70">
                                    {totalAdults} adults, {totalChildren}{" "}
                                    {totalChildren === 1 ? "child" : "children"}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Single combined add-ons section */}
                    <section>
                        <h3 className="font-semibold">Selected extras</h3>

                        <div className="mt-3 space-y-3 rounded-xl border border-black/10 bg-white/50 p-4">
                            {addonItems.length === 0 ? (
                                <p className="text-sm opacity-60">
                                    No additional extras selected.
                                </p>
                            ) : (
                                addonItems.map((item, index) => (
                                    <PriceRow
                                        key={item.id ?? `addon-${index}`}
                                        label={
                                            item.label ??
                                            item.name ??
                                            "Add-on"
                                        }
                                        amount={item.amount ?? item.total ?? 0}
                                    />
                                ))
                            )}

                            <div className="flex items-center justify-between gap-4 border-t border-black/10 pt-3 font-semibold">
                                <span>Combined add-ons</span>
                                <span>{formatINR(addonTotal)}</span>
                            </div>
                        </div>
                    </section>

                    {/* Combined price breakdown */}
                    <section>
                        <h3 className="font-semibold">Price breakdown</h3>

                        <div className="mt-3 space-y-3 rounded-xl border border-black/10 bg-white/50 p-4 text-sm">
                            <PriceRow
                                label="All rooms"
                                amount={roomTotal}
                            />

                            <PriceRow
                                label="Combined add-ons"
                                amount={addonTotal}
                            />

                            <div className="border-t border-black/10 pt-3">
                                <PriceRow
                                    label="Subtotal (estimate)"
                                    amount={subtotal}
                                    bold
                                />
                            </div>

                            <PriceRow label="Tax (18%, estimate)" amount={tax} />

                            <PriceRow
                                label="Platform fee (2%, estimate)"
                                amount={platformFee}
                            />

                            <div className="border-t border-black/10 pt-3">
                                <PriceRow
                                    label="Estimated total"
                                    amount={total}
                                    bold
                                />
                            </div>
                        </div>

                        <p className="mt-2 text-xs opacity-60">
                            The final total, taxes and fees are calculated
                            and verified by the booking server.
                        </p>
                    </section>

                    {/* Terms */}
                    <label className="flex items-start gap-3 text-sm">
                        <input
                            type="checkbox"
                            checked={acceptedTerms}
                            onChange={(event) =>
                                setAcceptedTerms(event.target.checked)
                            }
                            className="mt-1 h-4 w-4 accent-[#e4b441]"
                            required
                        />

                        <span>
                            I agree to the booking terms and cancellation
                            policy. Read our{" "}
                            <a
                                href="/terms"
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold underline"
                            >
                                terms and conditions
                            </a>
                            .
                        </span>
                    </label>

                    {/* Actions */}
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={onBack}
                            disabled={loading}
                            className="rounded-xl border px-5 py-3 font-semibold disabled:opacity-50 sm:w-1/3"
                            style={{
                                borderColor: `${COLORS.foreground}30`,
                            }}
                        >
                            Back to details
                        </button>

                        <button
                            type="submit"
                            disabled={
                                !acceptedTerms ||
                                loading ||
                                roomSummaries.length === 0
                            }
                            className="flex-1 rounded-xl px-5 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
                            style={{
                                backgroundColor: COLORS.accent,
                                color: COLORS.foreground,
                            }}
                        >
                            {loading
                                ? "Confirming booking..."
                                : "Confirm Booking"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
