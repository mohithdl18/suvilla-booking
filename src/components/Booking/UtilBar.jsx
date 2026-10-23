
"use client";

import { useEffect, useRef, useState } from "react";
import DateRangeCalendar from "./DateRangeCalendar";
import GuestSelector from "./GuestSelector";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

function formatDisplayDate(dateString) {
    if (!dateString) return "Select date";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
        checkIn: getLocalDateString(today),
        checkOut: getLocalDateString(tomorrow),
    };
}

function createInitialRooms(adults = 2, children = 0) {
    return [
        {
            id: 1,
            adults: Math.min(4, Math.max(1, adults)),
            children: Math.min(
                Math.max(0, children),
                4 - Math.min(4, Math.max(1, adults))
            ),
        },
    ];
}

export default function UtilBar({
    onSearch,
    initialCheckIn,
    initialCheckOut,
    initialAdults = 2,
    initialChildren = 0,
}) {
    const defaults = getDefaultDates();

    const [checkIn, setCheckIn] = useState(
        initialCheckIn || defaults.checkIn
    );
    const [checkOut, setCheckOut] = useState(
        initialCheckOut || defaults.checkOut
    );

    const [guestSelection, setGuestSelection] = useState(() => {
        const rooms = createInitialRooms(initialAdults, initialChildren);

        return {
            rooms,
            roomCount: rooms.length,
            adults: rooms.reduce((sum, room) => sum + room.adults, 0),
            children: rooms.reduce((sum, room) => sum + room.children, 0),
        };
    });

    const [activePopup, setActivePopup] = useState(null);
    const [error, setError] = useState("");

    const containerRef = useRef(null);

    useEffect(() => {
        function handleOutsideClick(event) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target)
            ) {
                setActivePopup(null);
            }
        }

        function handleEscape(event) {
            if (event.key === "Escape") {
                setActivePopup(null);
            }
        }

        document.addEventListener("mousedown", handleOutsideClick);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    function handleDatesChange(newCheckIn, newCheckOut) {
        setCheckIn(newCheckIn);
        setCheckOut(newCheckOut);
        setError("");
    }

    function handleGuestsChange(value) {
        setGuestSelection(value);
        setError("");
    }

    function handleSearch() {
        if (!checkIn || !checkOut) {
            setError("Please select your check-in and check-out dates.");
            return;
        }

        if (checkOut <= checkIn) {
            setError("Check-out must be after check-in.");
            return;
        }

        setError("");
        setActivePopup(null);

        onSearch?.({
            checkIn,
            checkOut,
            adults: guestSelection.adults,
            children: guestSelection.children,
            rooms: guestSelection.rooms,
            roomCount: guestSelection.roomCount,
            totalGuests: guestSelection.totalGuests ??
                guestSelection.adults + guestSelection.children,
        });
    }

    return (
        <div className="w-full" ref={containerRef}>
            <div
                className="relative z-30 mx-auto grid w-full max-w-7xl grid-cols-1 gap-2 rounded-2xl border p-3 shadow-sm md:grid-cols-[45fr_35fr_20fr] md:gap-0 md:p-3"
                style={{
                    backgroundColor: COLORS.background,
                    borderColor: `${COLORS.foreground}20`,
                }}
            >
                {/* DATE SELECTION */}
                <div className="relative min-w-0 md:pr-3">
                    <button
                        type="button"
                        onClick={() =>
                            setActivePopup(
                                activePopup === "dates" ? null : "dates"
                            )
                        }
                        aria-expanded={activePopup === "dates"}
                        aria-label={`Select dates. Check-in: ${formatDisplayDate(
                            checkIn
                        )}. Check-out: ${formatDisplayDate(checkOut)}`}
                        className="grid min-h-16 w-full grid-cols-[20%_40%_40%] items-center rounded-xl py-2 text-left transition hover:bg-black/5"
                    >
                        <span
                            className="flex h-full items-center justify-center"
                            aria-hidden="true"
                            style={{ color: COLORS.foreground }}
                        >
                            <svg
                                width="23"
                                height="23"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect x="3" y="5" width="18" height="16" rx="2" />
                                <path d="M16 3v4M8 3v4M3 10h18" />
                            </svg>
                        </span>

                        <span className="min-w-0 pl-2">
                            <span
                                className="block text-[10px] font-medium tracking-wide opacity-60 sm:text-xs"
                                style={{ color: COLORS.foreground }}
                            >
                                CHECK-IN
                            </span>
                            <span
                                className="mt-1 block truncate text-xs font-semibold sm:text-sm"
                                style={{ color: COLORS.foreground }}
                            >
                                {formatDisplayDate(checkIn)}
                            </span>
                        </span>

                        <span className="min-w-0 pl-2">
                            <span
                                className="block text-[10px] font-medium tracking-wide opacity-60 sm:text-xs"
                                style={{ color: COLORS.foreground }}
                            >
                                CHECK-OUT
                            </span>
                            <span
                                className="mt-1 block truncate text-xs font-semibold sm:text-sm"
                                style={{ color: COLORS.foreground }}
                            >
                                {formatDisplayDate(checkOut)}
                            </span>
                        </span>
                    </button>
                </div>

                {/* GUEST SELECTION */}
                <div
                    className="relative min-w-0 md:border-l md:px-3"
                    style={{ borderColor: `${COLORS.foreground}20` }}
                >
                    <button
                        type="button"
                        onClick={() =>
                            setActivePopup(
                                activePopup === "guests" ? null : "guests"
                            )
                        }
                        aria-expanded={activePopup === "guests"}
                        aria-label={`Select guests. ${guestSelection.roomCount} rooms, ${guestSelection.adults} adults and ${guestSelection.children} children`}
                        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-black/5"
                    >
                        <span
                            className="shrink-0"
                            style={{ color: COLORS.foreground }}
                            aria-hidden="true"
                        >
                            <svg
                                width="25"
                                height="25"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="9" cy="7" r="4" />
                                <path d="M2 21v-2a7 7 0 0 1 14 0v2" />
                                <path d="M16 3.5a4 4 0 0 1 0 7.5M19 14a6 6 0 0 1 3 5v2" />
                            </svg>
                        </span>

                        <span className="min-w-0 flex-1">
                            <span
                                className="block text-xs font-medium opacity-60"
                                style={{ color: COLORS.foreground }}
                            >
                                ROOMS & GUESTS
                            </span>
                            <span
                                className="mt-1 block truncate text-sm font-semibold"
                                style={{ color: COLORS.foreground }}
                            >
                                {guestSelection.roomCount}{" "}
                                {guestSelection.roomCount === 1 ? "room" : "rooms"},{" "}
                                {guestSelection.adults} adults,{" "}
                                {guestSelection.children} children
                            </span>
                        </span>

                        <svg
                            className="shrink-0"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            style={{ color: COLORS.foreground }}
                        >
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>
                </div>

                {/* SEARCH BUTTON */}
                <div
                    className="flex min-w-0 items-stretch md:border-l md:pl-3"
                    style={{ borderColor: `${COLORS.foreground}20` }}
                >
                    <button
                        type="button"
                        onClick={handleSearch}
                        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition hover:brightness-95 active:scale-[0.99] sm:px-5"
                        style={{
                            backgroundColor: COLORS.accent,
                            color: COLORS.foreground,
                        }}
                    >
                        <svg
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-4-4" />
                        </svg>
                        <span>Search Rooms</span>
                    </button>
                </div>

                {/* DATE CALENDAR POPUP */}
                {activePopup === "dates" && (
                    <div className="absolute left-0 top-full z-50 mt-2 w-full max-w-sm">
                        <DateRangeCalendar
                            checkIn={checkIn}
                            checkOut={checkOut}
                            onChange={handleDatesChange}
                            onClose={() => setActivePopup(null)}
                        />
                    </div>
                )}

                {/* GUEST SELECTOR POPUP */}
                {activePopup === "guests" && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-full max-w-sm">
                        <GuestSelector
                            adults={guestSelection.adults}
                            children={guestSelection.children}
                            rooms={guestSelection.rooms}
                            onChange={handleGuestsChange}
                            onClose={() => setActivePopup(null)}
                        />
                    </div>
                )}
            </div>

            {error && (
                <p
                    role="alert"
                    className="mt-2 text-sm font-medium"
                    style={{ color: "#b42318" }}
                >
                    {error}
                </p>
            )}
        </div>
    );
}
