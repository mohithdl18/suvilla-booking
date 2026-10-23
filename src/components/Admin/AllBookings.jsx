
"use client";

import { useState } from "react";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
});

function formatCurrency(amount) {
    return CURRENCY_FORMATTER.format(Number(amount) || 0);
}

function formatDate(dateString) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

// Supports both new multi-room and legacy single-room bookings.
function getBookingRoomIds(booking) {
    if (Array.isArray(booking.roomIds) && booking.roomIds.length > 0) {
        return [...new Set(booking.roomIds)];
    }

    if (Array.isArray(booking.rooms) && booking.rooms.length > 0) {
        return [
            ...new Set(
                booking.rooms
                    .map((room) => room.roomId ?? room.id)
                    .filter(Boolean)
            ),
        ];
    }

    return booking.roomId ? [booking.roomId] : [];
}

function getRoomLabel(booking) {
    const roomIds = getBookingRoomIds(booking);

    if (roomIds.length === 0) return "Room not specified";

    return roomIds
        .map((id) => id.replace(/^Room(\d+)$/, "Room $1"))
        .join(", ");
}

function getBookingStatus(booking) {
    const status = String(booking.status || "unknown").toLowerCase();

    if (["cancelled", "canceled"].includes(status)) {
        return {
            label: "Cancelled",
            background: "#fee2e2",
            color: "#991b1b",
        };
    }

    if (status === "rejected") {
        return {
            label: "Rejected",
            background: "#ffedd5",
            color: "#9a3412",
        };
    }

    if (status === "confirmed") {
        return {
            label: "Confirmed",
            background: "#dcfce7",
            color: "#166534",
        };
    }

    return {
        label: status.charAt(0).toUpperCase() + status.slice(1),
        background: "#f1f5f9",
        color: "#334155",
    };
}

function getAmountPaid(booking) {
    if (String(booking.paymentStatus || "").toLowerCase() !== "paid") {
        return 0;
    }

    return Number(booking.pricing?.total) || 0;
}

export default function AllBookings({
    bookings = [],
    loading = false,
    error = "",
    onViewBooking,
    onRefresh,
}) {
    const [cancelBooking, setCancelBooking] = useState(null);
    const [cancelPin, setCancelPin] = useState("");
    const [cancelError, setCancelError] = useState("");
    const [cancelMessage, setCancelMessage] = useState("");
    const [cancelling, setCancelling] = useState(false);

    const sortedBookings = [...bookings].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();

        return dateB - dateA;
    });

    function openCancelDialog(booking) {
        setCancelBooking(booking);
        setCancelPin("");
        setCancelError("");
        setCancelMessage("");
    }

    function closeCancelDialog() {
        if (cancelling) return;

        setCancelBooking(null);
        setCancelPin("");
        setCancelError("");
    }

    async function handleCancelBooking(event) {
        event.preventDefault();

        if (!cancelBooking?.bookingId || !cancelPin.trim()) {
            setCancelError("Enter the admin cancellation PIN.");
            return;
        }

        setCancelling(true);
        setCancelError("");
        setCancelMessage("");

        try {
            const response = await fetch("/api/admin/bookings/cancel", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    bookingId: cancelBooking.bookingId,
                    pin: cancelPin,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                setCancelError(
                    data.message || "Unable to cancel this booking."
                );
                return;
            }

            setCancelMessage("Booking cancelled and deleted successfully.");
            setCancelPin("");
            setCancelBooking(null);

            if (typeof onRefresh === "function") {
                await onRefresh();
            }
        } catch (error) {
            console.error("Cancel booking error:", error);
            setCancelError(
                "Unable to connect to the server. Please try again."
            );
        } finally {
            setCancelling(false);
        }
    }

    return (
        <>
            <section
                className="mt-6 overflow-hidden rounded-2xl border"
                style={{
                    backgroundColor: "#ffffff",
                    borderColor: "rgba(5,42,80,0.12)",
                    boxShadow: "0 8px 30px rgba(5,42,80,0.04)",
                }}
            >
                <div
                    className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
                    style={{ borderColor: "rgba(5,42,80,0.10)" }}
                >
                    <div>
                        <h2 className="text-lg font-semibold sm:text-xl">
                            All bookings
                        </h2>

                        <p className="mt-1 text-sm opacity-60">
                            View, inspect, and cancel guest reservations.
                        </p>
                    </div>

                    <div
                        className="w-fit rounded-full px-3 py-1.5 text-xs font-semibold"
                        style={{
                            backgroundColor: "#f7faee",
                            color: "#052a50",
                        }}
                    >
                        {bookings.length}{" "}
                        {bookings.length === 1 ? "booking" : "bookings"}
                    </div>
                </div>

                {cancelMessage && (
                    <div
                        role="status"
                        className="mx-5 mt-4 rounded-lg px-4 py-3 text-sm sm:mx-6"
                        style={{
                            backgroundColor: "#dcfce7",
                            color: "#166534",
                        }}
                    >
                        {cancelMessage}
                    </div>
                )}

                {error ? (
                    <div className="p-6 text-sm text-red-700">{error}</div>
                ) : loading ? (
                    <div className="p-10 text-center text-sm opacity-60">
                        Loading bookings…
                    </div>
                ) : sortedBookings.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="font-medium">No bookings yet</p>
                        <p className="mt-2 text-sm opacity-55">
                            Reservations will appear here when they are created.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1150px] border-collapse text-left">
                            <thead>
                                <tr
                                    className="text-xs uppercase tracking-wider"
                                    style={{
                                        backgroundColor: "#f7faee",
                                        color: "#052a50",
                                    }}
                                >
                                    <th className="px-5 py-4 font-semibold">
                                        Booking ID
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Guest
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Phone
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Rooms
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Stay
                                    </th>
                                    <th className="px-5 py-4 font-semibold">
                                        Status
                                    </th>
                                    <th className="px-5 py-4 text-right font-semibold">
                                        Amount paid
                                    </th>
                                    <th className="px-5 py-4 text-center font-semibold">
                                        Action
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {sortedBookings.map((booking) => {
                                    const status = getBookingStatus(booking);
                                    const roomIds = getBookingRoomIds(booking);
                                    const isCancelled = [
                                        "cancelled",
                                        "canceled",
                                    ].includes(
                                        String(booking.status || "").toLowerCase()
                                    );

                                    return (
                                        <tr
                                            key={booking.bookingId}
                                            onClick={() =>
                                                onViewBooking?.(booking)
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.target !== event.currentTarget ||
                                                    (event.key !== "Enter" &&
                                                        event.key !== " ")
                                                ) {
                                                    return;
                                                }

                                                event.preventDefault();
                                                onViewBooking?.(booking);
                                            }}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`View booking ${booking.bookingId}`}
                                            className="cursor-pointer border-t transition-colors hover:bg-[#fafbf6] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#e4b441]"
                                            style={{
                                                borderColor: "rgba(5,42,80,0.08)",
                                            }}
                                        >
                                            <td className="px-5 py-4">
                                                <span className="text-sm font-semibold">
                                                    {booking.bookingId || "—"}
                                                </span>

                                                <p className="mt-1 text-xs opacity-50">
                                                    {roomIds.length}{" "}
                                                    {roomIds.length === 1
                                                        ? "room"
                                                        : "rooms"}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4">
                                                <p className="text-sm font-medium">
                                                    {booking.customer?.name || "—"}
                                                </p>

                                                <p className="mt-1 text-xs opacity-55">
                                                    {booking.customer?.email || ""}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4 text-sm">
                                                {booking.customer?.phone || "—"}
                                            </td>

                                            <td className="px-5 py-4">
                                                <div className="flex max-w-[220px] flex-wrap gap-1.5">
                                                    {roomIds.length > 0 ? (
                                                        roomIds.map((roomId) => (
                                                            <span
                                                                key={roomId}
                                                                className="rounded-md border px-2 py-1 text-xs font-medium"
                                                                style={{
                                                                    borderColor: "rgba(5,42,80,0.15)",
                                                                    backgroundColor: "#f7faee",
                                                                    color: "#052a50",
                                                                }}
                                                            >
                                                                {roomId.replace(
                                                                    /^Room(\d+)$/,
                                                                    "Room $1"
                                                                )}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-sm opacity-50">
                                                            —
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-5 py-4">
                                                <p className="text-sm">
                                                    {formatDate(booking.checkIn)}
                                                </p>

                                                <p className="mt-1 text-xs opacity-55">
                                                    to {formatDate(booking.checkOut)}
                                                </p>
                                            </td>

                                            <td className="px-5 py-4">
                                                <span
                                                    className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                                                    style={{
                                                        backgroundColor: status.background,
                                                        color: status.color,
                                                    }}
                                                >
                                                    {status.label}
                                                </span>
                                            </td>

                                            <td className="px-5 py-4 text-right">
                                                <span className="text-sm font-semibold">
                                                    {formatCurrency(
                                                        getAmountPaid(booking)
                                                    )}
                                                </span>

                                                {String(
                                                    booking.paymentStatus || ""
                                                ).toLowerCase() !== "paid" && (
                                                    <p className="mt-1 text-xs opacity-50">
                                                        Not recorded as paid
                                                    </p>
                                                )}
                                            </td>

                                            <td
                                                className="px-5 py-4 text-center"
                                                onClick={(event) =>
                                                    event.stopPropagation()
                                                }
                                                onKeyDown={(event) =>
                                                    event.stopPropagation()
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    disabled={isCancelled || cancelling}
                                                    onClick={() =>
                                                        openCancelDialog(booking)
                                                    }
                                                    className="rounded-lg px-3 py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                                                    style={{
                                                        backgroundColor: "#fee2e2",
                                                        color: "#991b1b",
                                                    }}
                                                >
                                                    {isCancelled
                                                        ? "Cancelled"
                                                        : "Cancel"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {cancelBooking && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            closeCancelDialog();
                        }
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cancel-booking-title"
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
                    >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h3
                                    id="cancel-booking-title"
                                    className="text-xl font-semibold"
                                    style={{ color: "#052a50" }}
                                >
                                    Cancel booking?
                                </h3>

                                <p className="mt-2 text-sm leading-6 text-gray-500">
                                    This permanently deletes the booking and
                                    releases its reserved room dates.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={closeCancelDialog}
                                disabled={cancelling}
                                aria-label="Close dialog"
                                className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                            >
                                ×
                            </button>
                        </div>

                        <div
                            className="mb-5 rounded-xl p-4 text-sm"
                            style={{
                                backgroundColor: "#f7faee",
                                color: "#052a50",
                            }}
                        >
                            <p className="font-semibold">
                                {cancelBooking.bookingId}
                            </p>

                            <p className="mt-1">
                                {cancelBooking.customer?.name || "Guest"}
                            </p>

                            <p className="mt-2 text-xs font-medium">
                                Rooms: {getRoomLabel(cancelBooking)}
                            </p>

                            <p className="mt-1 text-xs opacity-70">
                                {formatDate(cancelBooking.checkIn)} –{" "}
                                {formatDate(cancelBooking.checkOut)}
                            </p>
                        </div>

                        <form onSubmit={handleCancelBooking}>
                            <label
                                htmlFor="admin-cancel-pin"
                                className="mb-2 block text-sm font-medium"
                                style={{ color: "#052a50" }}
                            >
                                Admin cancellation PIN
                            </label>

                            <input
                                id="admin-cancel-pin"
                                type="password"
                                autoComplete="new-password"
                                inputMode="numeric"
                                value={cancelPin}
                                onChange={(event) => {
                                    setCancelPin(event.target.value);
                                    setCancelError("");
                                }}
                                placeholder="Enter cancellation PIN"
                                disabled={cancelling}
                                autoFocus
                                required
                                className="w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-[#e4b441] focus:ring-2 focus:ring-[#e4b441]/20"
                                style={{
                                    borderColor: "rgba(5,42,80,0.2)",
                                    color: "#052a50",
                                }}
                            />

                            {cancelError && (
                                <p
                                    role="alert"
                                    className="mt-3 text-sm text-red-700"
                                >
                                    {cancelError}
                                </p>
                            )}

                            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={closeCancelDialog}
                                    disabled={cancelling}
                                    className="rounded-xl border px-5 py-3 text-sm font-semibold disabled:opacity-50"
                                    style={{
                                        borderColor: "rgba(5,42,80,0.2)",
                                        color: "#052a50",
                                    }}
                                >
                                    Keep booking
                                </button>

                                <button
                                    type="submit"
                                    disabled={cancelling || !cancelPin.trim()}
                                    className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ backgroundColor: "#991b1b" }}
                                >
                                    {cancelling
                                        ? "Cancelling…"
                                        : "Confirm cancellation"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
