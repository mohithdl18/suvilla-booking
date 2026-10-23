
"use client";

import { useMemo, useState } from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function parseDate(value) {
    if (!value) return null;

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function getToday() {
    const now = new Date();

    return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );
}

export default function DateRangeCalendar({
    checkIn,
    checkOut,
    onChange,
    onClose,
}) {
    const today = getToday();

    const [visibleMonth, setVisibleMonth] = useState(() => {
        return parseDate(checkIn) || today;
    });

    const [selectingCheckout, setSelectingCheckout] = useState(
        Boolean(checkIn && !checkOut)
    );

    const calendarDays = useMemo(() => {
        const year = visibleMonth.getFullYear();
        const month = visibleMonth.getMonth();

        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];

        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            days.push(new Date(year, month, day));
        }

        return days;
    }, [visibleMonth]);

    const selectedCheckIn = parseDate(checkIn);
    const selectedCheckOut = parseDate(checkOut);

    function changeMonth(offset) {
        setVisibleMonth(
            (current) =>
                new Date(
                    current.getFullYear(),
                    current.getMonth() + offset,
                    1
                )
        );
    }

    function selectDate(date) {
        if (!date || date < today) return;

        const value = formatDate(date);

        if (
            !selectingCheckout ||
            !selectedCheckIn ||
            date <= selectedCheckIn
        ) {
            onChange(value, "");
            setSelectingCheckout(true);
            return;
        }

        onChange(checkIn, value);
        setSelectingCheckout(false);

        onClose?.();
    }

    function isSelected(date) {
        if (!date) return false;

        const value = formatDate(date);

        return value === checkIn || value === checkOut;
    }

    function isInRange(date) {
        if (!date || !selectedCheckIn || !selectedCheckOut) {
            return false;
        }

        return date > selectedCheckIn && date < selectedCheckOut;
    }

    function isDisabled(date) {
        return !date || date < today;
    }

    const previousMonthDisabled =
        visibleMonth.getFullYear() === today.getFullYear() &&
        visibleMonth.getMonth() === today.getMonth();

    return (
        <div
            className="w-full max-w-sm rounded-2xl border p-4 shadow-xl"
            style={{
                backgroundColor: COLORS.background,
                color: COLORS.foreground,
                borderColor: `${COLORS.foreground}20`,
            }}
        >
            {/* Calendar header */}
            <div className="mb-4 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => changeMonth(-1)}
                    disabled={previousMonthDisabled}
                    aria-label="Previous month"
                    className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-25"
                >
                    <span className="text-xl">‹</span>
                </button>

                <h3 className="font-semibold">
                    {visibleMonth.toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                    })}
                </h3>

                <button
                    type="button"
                    onClick={() => changeMonth(1)}
                    aria-label="Next month"
                    className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-black/5"
                >
                    <span className="text-xl">›</span>
                </button>
            </div>

            {/* Weekday names */}
            <div className="mb-2 grid grid-cols-7 text-center text-xs font-semibold opacity-65">
                {DAY_NAMES.map((day) => (
                    <div key={day} className="py-2">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar dates */}
            <div className="grid grid-cols-7 gap-y-1">
                {calendarDays.map((date, index) => {
                    const selected = isSelected(date);
                    const inRange = isInRange(date);
                    const disabled = isDisabled(date);

                    return (
                        <button
                            key={
                                date
                                    ? formatDate(date)
                                    : `empty-${index}`
                            }
                            type="button"
                            disabled={disabled}
                            onClick={() => selectDate(date)}
                            aria-label={
                                date
                                    ? formatDate(date)
                                    : undefined
                            }
                            aria-pressed={selected}
                            className={[
                                "flex aspect-square items-center justify-center rounded-full text-sm transition",
                                selected
                                    ? "font-bold shadow-sm"
                                    : inRange
                                      ? "font-medium"
                                      : "hover:bg-black/5",
                                disabled
                                    ? "cursor-not-allowed opacity-25 hover:bg-transparent"
                                    : "",
                            ].join(" ")}
                            style={
                                selected
                                    ? {
                                          backgroundColor: COLORS.accent,
                                          color: COLORS.foreground,
                                      }
                                    : inRange
                                      ? {
                                            backgroundColor:
                                                `${COLORS.accent}35`,
                                            color: COLORS.foreground,
                                        }
                                      : undefined
                            }
                        >
                            {date ? date.getDate() : ""}
                        </button>
                    );
                })}
            </div>

            {/* Selected dates */}
            <div
                className="mt-4 rounded-xl border p-3 text-sm"
                style={{
                    borderColor: `${COLORS.foreground}15`,
                    backgroundColor: "#FFFFFF80",
                }}
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="opacity-65">Check-in</span>
                    <span className="font-semibold">
                        {checkIn || "Select date"}
                    </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="opacity-65">Check-out</span>
                    <span className="font-semibold">
                        {checkOut || "Select date"}
                    </span>
                </div>

                <p className="mt-3 text-xs opacity-70">
                    {!selectingCheckout
                        ? "Choose your check-in date."
                        : "Now choose your checkout date."}
                </p>
            </div>
        </div>
    );
}
