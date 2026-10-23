
"use client";

import { useEffect, useState } from "react";

const COLORS = {
    foreground: "#052a50",
    accent: "#e4b441",
    white: "#ffffff",
};

export function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function formatDate(dateString, options = {}) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-").map(Number);

    if (!year || !month || !day) return "—";

    return new Date(year, month - 1, day).toLocaleDateString(
        "en-IN",
        options
    );
}

function isBookingActive(booking) {
    return !["cancelled", "canceled", "rejected"].includes(
        String(booking.status || "").toLowerCase()
    );
}

function bookingIncludesDate(booking, dateString) {
    return (
        booking.checkIn <= dateString &&
        dateString < booking.checkOut &&
        isBookingActive(booking)
    );
}

// Supports both the new multi-room and older single-room formats.
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

function getDateRoomCount(bookings, dateString) {
    return bookings.reduce((total, booking) => {
        if (!bookingIncludesDate(booking, dateString)) {
            return total;
        }

        return total + getBookingRoomIds(booking).length;
    }, 0);
}

export default function BookingCalendar({
    selectedDate,
    onSelectDate,
    bookings = [],
}) {
    const [visibleMonth, setVisibleMonth] = useState(() => {
        const date = new Date(`${selectedDate}T12:00:00`);

        return new Date(date.getFullYear(), date.getMonth(), 1);
    });

    useEffect(() => {
        const date = new Date(`${selectedDate}T12:00:00`);

        if (!Number.isNaN(date.getTime())) {
            setVisibleMonth(
                new Date(date.getFullYear(), date.getMonth(), 1)
            );
        }
    }, [selectedDate]);

    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [
        ...Array.from({ length: firstWeekday }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    const todayString = localDateString(new Date());

    function changeMonth(amount) {
        setVisibleMonth(new Date(year, month + amount, 1));
    }

    function getDateBookingCount(day) {
        if (!day) return 0;

        const dateString = localDateString(
            new Date(year, month, day, 12)
        );

        return getDateRoomCount(bookings, dateString);
    }

    return (
        <section
            className="flex aspect-[6/5] w-full flex-col overflow-hidden rounded-2xl border p-3 sm:p-5"
            style={{
                backgroundColor: COLORS.white,
                borderColor: `${COLORS.foreground}15`,
                boxShadow: "0 8px 30px rgba(5,42,80,0.04)",
            }}
        >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold sm:text-xl">
                        Booking Calendar
                    </h2>

                    <p className="mt-1 text-[10px] opacity-60 sm:text-sm">
                        Select a date to see room availability
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => onSelectDate(todayString)}
                    className="shrink-0 rounded-lg border px-2.5 py-2 text-xs font-semibold transition hover:bg-black/5 sm:px-4 sm:text-sm"
                    style={{
                        borderColor: `${COLORS.foreground}25`,
                    }}
                >
                    Today
                </button>
            </div>

            {/* Month navigation */}
            <div className="mt-3 flex shrink-0 items-center justify-between gap-2 sm:mt-4">
                <h3 className="text-sm font-semibold sm:text-lg">
                    {visibleMonth.toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                    })}
                </h3>

                <div className="flex shrink-0 gap-1.5 sm:gap-2">
                    <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        aria-label="Previous month"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border text-base transition hover:bg-black/5 sm:h-9 sm:w-9 sm:text-lg"
                        style={{
                            borderColor: `${COLORS.foreground}20`,
                        }}
                    >
                        ‹
                    </button>

                    <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        aria-label="Next month"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border text-base transition hover:bg-black/5 sm:h-9 sm:w-9 sm:text-lg"
                        style={{
                            borderColor: `${COLORS.foreground}20`,
                        }}
                    >
                        ›
                    </button>
                </div>
            </div>

            {/* Calendar grid */}
            <div className="mt-3 grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-0.5 sm:mt-10 sm:gap-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day) => (
                        <div
                            key={day}
                            className="flex items-center justify-center text-[9px] font-semibold uppercase opacity-50 sm:text-xs"
                        >
                            {day}
                        </div>
                    )
                )}

                {cells.map((day, index) => {
                    if (!day) {
                        return (
                            <div
                                key={`empty-${index}`}
                                className="min-h-0 min-w-0"
                            />
                        );
                    }

                    const dateString = localDateString(
                        new Date(year, month, day, 12)
                    );

                    const isSelected = dateString === selectedDate;
                    const isToday = dateString === todayString;
                    const bookingCount = getDateBookingCount(day);

                    return (
                        <button
                            key={dateString}
                            type="button"
                            onClick={() => onSelectDate(dateString)}
                            aria-label={`${formatDate(dateString, {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                            })}, ${bookingCount} rooms booked`}
                            aria-pressed={isSelected}
                            className="relative flex min-h-0 min-w-0 flex-col items-center justify-center rounded-lg border text-xs transition hover:bg-[#052a50]/5 sm:text-sm"
                            style={{
                                backgroundColor: isSelected
                                    ? COLORS.foreground
                                    : "transparent",
                                color: isSelected
                                    ? COLORS.white
                                    : COLORS.foreground,
                                borderColor: isSelected
                                    ? COLORS.foreground
                                    : isToday
                                      ? COLORS.accent
                                      : "transparent",
                                fontWeight:
                                    isSelected || isToday ? 700 : 400,
                            }}
                        >
                            <span>{day}</span>

                            {bookingCount > 0 && (
                                <span
                                    className="absolute bottom-0.5 h-1 w-1 rounded-full sm:bottom-1"
                                    style={{
                                        backgroundColor: isSelected
                                            ? COLORS.accent
                                            : COLORS.foreground,
                                    }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Legend */}
            <div
                className="mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1.5 border-t pt-2 text-[9px] opacity-65 sm:mt-3 sm:gap-x-5 sm:gap-y-2 sm:pt-3 sm:text-xs"
                style={{
                    borderColor: `${COLORS.foreground}15`,
                }}
            >
                <span className="flex items-center gap-1.5">
                    <span
                        className="h-2.5 w-2.5 shrink-0 rounded border sm:h-3 sm:w-3"
                        style={{ borderColor: COLORS.accent }}
                    />
                    Today
                </span>

                <span className="flex items-center gap-1.5">
                    <span
                        className="h-2.5 w-2.5 shrink-0 rounded sm:h-3 sm:w-3"
                        style={{
                            backgroundColor: COLORS.foreground,
                        }}
                    />
                    Selected date
                </span>

                <span>Dot = one or more rooms booked</span>
            </div>
        </section>
    );
}
