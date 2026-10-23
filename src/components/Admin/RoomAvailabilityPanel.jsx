
"use client";

import { useCallback, useEffect, useState } from "react";

const COLORS = {
    foreground: "#052a50",
    white: "#ffffff",
    green: "#166534",
    red: "#991b1b",
};

const ROOMS = [
    { id: "Room1", name: "Family Suite 1" },
    { id: "Room2", name: "Family Suite 2" },
    { id: "Room3", name: "Couple Suite" },
    { id: "Room4", name: "Pond View Cottage" },
];

function formatDate(dateString) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function isBookingActive(booking) {
    return !["cancelled", "canceled", "rejected"].includes(
        String(booking.status || "").toLowerCase()
    );
}

// Support both multi-room and legacy single-room bookings.
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

function bookingIncludesRoom(booking, roomId) {
    return getBookingRoomIds(booking).includes(roomId);
}

function StatusBadge({ status }) {
    const styles = {
        booked: {
            backgroundColor: "#fee2e2",
            color: COLORS.red,
            label: "Booked",
        },
        blocked: {
            backgroundColor: "#fef3c7",
            color: "#92400e",
            label: "Blocked",
        },
        available: {
            backgroundColor: "#dcfce7",
            color: COLORS.green,
            label: "Available",
        },
    };

    const style = styles[status];

    return (
        <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
            style={{
                backgroundColor: style.backgroundColor,
                color: style.color,
            }}
        >
            {style.label}
        </span>
    );
}

export default function RoomAvailabilityPanel({
    selectedDate,
    bookings = [],
    loading = false,
    onViewBooking,
    onRefresh,
}) {
    const [blockedRooms, setBlockedRooms] = useState([]);
    const [loadingBlocks, setLoadingBlocks] = useState(false);
    const [processingRoom, setProcessingRoom] = useState(null);
    const [message, setMessage] = useState(null);

    const fetchBlockedRooms = useCallback(async () => {
        if (!selectedDate) return;

        setLoadingBlocks(true);

        try {
            const response = await fetch(
                `/api/admin/availability/block?date=${encodeURIComponent(
                    selectedDate
                )}`,
                {
                    method: "GET",
                    cache: "no-store",
                    headers: {
                        Accept: "application/json",
                    },
                }
            );

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                window.location.href = "/admin/login";
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Unable to load offline room blocks."
                );
            }

            setBlockedRooms(
                Array.isArray(data.blockedRooms) ? data.blockedRooms : []
            );
        } catch (error) {
            console.error("Failed to fetch blocked rooms:", error);

            setMessage({
                type: "error",
                text: error.message || "Unable to load blocked rooms.",
            });
        } finally {
            setLoadingBlocks(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        setMessage(null);
        fetchBlockedRooms();
    }, [fetchBlockedRooms]);

    const activeBookings = bookings.filter(
        (booking) =>
            isBookingActive(booking) &&
            booking.checkIn <= selectedDate &&
            selectedDate < booking.checkOut
    );

    const roomStatuses = ROOMS.map((room) => ({
        ...room,
        bookings: activeBookings.filter((booking) =>
            bookingIncludesRoom(booking, room.id)
        ),
        blocked: blockedRooms.includes(room.id),
    }));

    async function refreshRoomData() {
        await fetchBlockedRooms();

        if (onRefresh) {
            await onRefresh();
        }
    }

    async function handleBlockRoom(room) {
        const confirmed = window.confirm(
            `Block ${room.name} for ${formatDate(selectedDate)}?\n\n` +
                "Guests will not be able to book this room for this date. " +
                "No customer booking or customer details will be created."
        );

        if (!confirmed) return;

        setProcessingRoom(room.id);
        setMessage(null);

        try {
            const response = await fetch("/api/admin/availability/block", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    roomId: room.id,
                    date: selectedDate,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                window.location.href = "/admin/login";
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Unable to block this room."
                );
            }

            setMessage({
                type: "success",
                text: `${room.name} blocked for ${formatDate(selectedDate)}.`,
            });

            await refreshRoomData();
        } catch (error) {
            console.error("Failed to block room:", error);

            setMessage({
                type: "error",
                text: error.message || "Unable to block this room.",
            });
        } finally {
            setProcessingRoom(null);
        }
    }

    async function handleUnblockRoom(room) {
        const confirmed = window.confirm(
            `Unblock ${room.name} for ${formatDate(selectedDate)}?\n\n` +
                "Guests will be able to book this room again if no other reservation exists."
        );

        if (!confirmed) return;

        setProcessingRoom(room.id);
        setMessage(null);

        try {
            const response = await fetch("/api/admin/availability/block", {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    roomId: room.id,
                    date: selectedDate,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                window.location.href = "/admin/login";
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Unable to unblock this room."
                );
            }

            setMessage({
                type: "success",
                text: `${room.name} unblocked for ${formatDate(selectedDate)}.`,
            });

            await refreshRoomData();
        } catch (error) {
            console.error("Failed to unblock room:", error);

            setMessage({
                type: "error",
                text: error.message || "Unable to unblock this room.",
            });
        } finally {
            setProcessingRoom(null);
        }
    }

    return (
        <section
            className="flex min-h-[490px] flex-col rounded-2xl border p-4 sm:p-6"
            style={{
                backgroundColor: COLORS.white,
                borderColor: `${COLORS.foreground}15`,
                boxShadow: "0 8px 30px rgba(5,42,80,0.04)",
            }}
        >
            {/* Header */}
            <div className="shrink-0">
                <h2 className="text-lg font-semibold sm:text-xl">
                    Room availability
                </h2>

                <p className="mt-1 text-sm opacity-60">
                    {formatDate(selectedDate)}
                </p>
            </div>

            {/* Feedback */}
            {message && (
                <div
                    role="status"
                    className="mt-4 rounded-lg border px-3 py-2 text-xs leading-5"
                    style={{
                        backgroundColor:
                            message.type === "success" ? "#f0fdf4" : "#fef2f2",
                        borderColor:
                            message.type === "success" ? "#bbf7d0" : "#fecaca",
                        color:
                            message.type === "success"
                                ? COLORS.green
                                : COLORS.red,
                    }}
                >
                    {message.text}
                </div>
            )}

            {/* Room cards */}
            <div className="mt-5 grid flex-1 grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {roomStatuses.map((room) => {
                    const hasCustomerBooking = room.bookings.length > 0;
                    const isBlocked = room.blocked;
                    const isUnavailable = hasCustomerBooking || isBlocked;
                    const isProcessing = processingRoom === room.id;

                    const cardBackground = hasCustomerBooking
                        ? "#fff7f7"
                        : isBlocked
                          ? "#fffbeb"
                          : "#f4fbf5";

                    const cardBorder = hasCustomerBooking
                        ? "#fecaca"
                        : isBlocked
                          ? "#fcd34d"
                          : "#bbf7d0";

                    const status = hasCustomerBooking
                        ? "booked"
                        : isBlocked
                          ? "blocked"
                          : "available";

                    return (
                        <article
                            key={room.id}
                            className="flex h-[250px] min-h-[250px] flex-col overflow-hidden rounded-xl border p-4"
                            style={{
                                backgroundColor: cardBackground,
                                borderColor: cardBorder,
                            }}
                        >
                            <div className="flex shrink-0 items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="text-base font-semibold">
                                        {room.name}
                                    </h3>

                                    <p className="mt-1 text-xs opacity-55">
                                        {room.id}
                                    </p>
                                </div>

                                <StatusBadge status={status} />
                            </div>

                            <div className="mt-4 flex min-h-0 flex-1 flex-col">
                                {hasCustomerBooking ? (
                                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                                        {room.bookings.map((booking) => (
                                            <div
                                                key={booking.bookingId}
                                                className="flex flex-1 flex-col border-t pt-3"
                                                style={{
                                                    borderColor: "#fecaca",
                                                }}
                                            >
                                                <p className="truncate text-sm font-semibold">
                                                    {booking.customer?.name ||
                                                        "Guest"}
                                                </p>

                                                <p className="mt-1 truncate text-xs opacity-65">
                                                    {booking.bookingId}
                                                </p>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onViewBooking?.(booking)
                                                    }
                                                    className="mt-auto w-full rounded-lg px-3 py-3 text-sm font-semibold transition hover:brightness-95"
                                                    style={{
                                                        backgroundColor:
                                                            COLORS.foreground,
                                                        color: COLORS.white,
                                                    }}
                                                >
                                                    View booking details
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : isBlocked ? (
                                    <div className="flex flex-1 flex-col">
                                        <div className="flex flex-1 items-end">
                                            <p className="text-xs leading-5 text-[#92400e]">
                                                Offline reservation block.
                                                Guests cannot book this room.
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={
                                                loading ||
                                                loadingBlocks ||
                                                processingRoom !== null
                                            }
                                            onClick={() => handleUnblockRoom(room)}
                                            className="mt-3 w-full shrink-0 rounded-lg px-3 py-2.5 text-sm font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                                            style={{
                                                backgroundColor: "#92400e",
                                                color: COLORS.white,
                                            }}
                                        >
                                            {isProcessing
                                                ? "Unblocking…"
                                                : "Unblock Room"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-1 flex-col">
                                        <div className="flex flex-1 items-end">
                                            <p className="text-xs leading-5 opacity-65">
                                                No active booking for this date.
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={
                                                loading ||
                                                loadingBlocks ||
                                                processingRoom !== null ||
                                                isUnavailable
                                            }
                                            onClick={() => handleBlockRoom(room)}
                                            className="mt-3 w-full shrink-0 rounded-lg px-3 py-2.5 text-sm font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                                            style={{
                                                backgroundColor: COLORS.green,
                                                color: COLORS.white,
                                            }}
                                        >
                                            {isProcessing
                                                ? "Blocking room…"
                                                : "Block Room"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>

            {(loading || loadingBlocks) && (
                <p className="mt-4 shrink-0 text-center text-xs opacity-55">
                    Updating booking data…
                </p>
            )}
        </section>
    );
}
