"use client";

import { useEffect, useState } from "react";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

const MAX_ROOMS = 3;
const MAX_GUESTS_PER_ROOM = 4;

function Counter({
    label,
    description,
    value,
    min,
    max,
    onChange,
}) {
    return (
        <div className="flex items-center justify-between gap-6 py-3">
            <div>
                <p
                    className="text-sm font-semibold"
                    style={{ color: COLORS.foreground }}
                >
                    {label}
                </p>

                {description && (
                    <p className="mt-1 text-xs text-gray-500">
                        {description}
                    </p>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-3">
                <button
                    type="button"
                    onClick={() => onChange(Math.max(min, value - 1))}
                    disabled={value <= min}
                    aria-label={`Decrease ${label.toLowerCase()}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border text-lg transition disabled:cursor-not-allowed disabled:opacity-30"
                    style={{
                        borderColor: COLORS.foreground,
                        color: COLORS.foreground,
                    }}
                >
                    −
                </button>

                <span
                    className="w-5 text-center text-sm font-semibold"
                    style={{ color: COLORS.foreground }}
                >
                    {value}
                </span>

                <button
                    type="button"
                    onClick={() => onChange(Math.min(max, value + 1))}
                    disabled={value >= max}
                    aria-label={`Increase ${label.toLowerCase()}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full border text-lg transition disabled:cursor-not-allowed disabled:opacity-30"
                    style={{
                        borderColor: COLORS.accent,
                        backgroundColor: COLORS.accent,
                        color: COLORS.foreground,
                    }}
                >
                    +
                </button>
            </div>
        </div>
    );
}

function createRoom(id) {
    return {
        id,
        adults: 2,
        children: 0,
    };
}

export default function GuestSelector({
    adults = 2,
    children = 0,
    rooms: initialRooms,
    onChange,
    onClose,
}) {
    const [roomGuests, setRoomGuests] = useState(() => {
        if (Array.isArray(initialRooms) && initialRooms.length > 0) {
            return initialRooms.slice(0, MAX_ROOMS);
        }

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
    });

    // Keep the parent's guest data updated whenever room selections change.
    useEffect(() => {
        const totalAdults = roomGuests.reduce(
            (sum, room) => sum + room.adults,
            0
        );

        const totalChildren = roomGuests.reduce(
            (sum, room) => sum + room.children,
            0
        );

        onChange?.({
            rooms: roomGuests,
            roomCount: roomGuests.length,
            adults: totalAdults,
            children: totalChildren,
            totalGuests: totalAdults + totalChildren,
        });
    }, [roomGuests, onChange]);

    function updateRoomCount(count) {
        setRoomGuests((previousRooms) => {
            const nextCount = Math.max(
                1,
                Math.min(MAX_ROOMS, count)
            );

            if (nextCount === previousRooms.length) {
                return previousRooms;
            }

            if (nextCount < previousRooms.length) {
                return previousRooms.slice(0, nextCount);
            }

            const updatedRooms = [...previousRooms];

            while (updatedRooms.length < nextCount) {
                updatedRooms.push(
                    createRoom(updatedRooms.length + 1)
                );
            }

            return updatedRooms;
        });
    }

    function updateRoomGuests(index, guestType, value) {
        setRoomGuests((previousRooms) =>
            previousRooms.map((room, roomIndex) => {
                if (roomIndex !== index) {
                    return room;
                }

                const nextValue = Number(value);

                const updatedRoom = {
                    ...room,
                    [guestType]: nextValue,
                };

                if (
                    updatedRoom.adults < 1 ||
                    updatedRoom.children < 0 ||
                    updatedRoom.adults + updatedRoom.children >
                        MAX_GUESTS_PER_ROOM
                ) {
                    return room;
                }

                return updatedRoom;
            })
        );
    }

    const totalAdults = roomGuests.reduce(
        (sum, room) => sum + room.adults,
        0
    );

    const totalChildren = roomGuests.reduce(
        (sum, room) => sum + room.children,
        0
    );

    const totalGuests = totalAdults + totalChildren;

    return (
        <div
            className="w-full rounded-2xl border p-4 shadow-xl"
            style={{
                backgroundColor: COLORS.background,
                borderColor: `${COLORS.foreground}20`,
            }}
        >
            <div className="mb-3">
                <h3
                    className="text-base font-semibold"
                    style={{ color: COLORS.foreground }}
                >
                    Rooms and guests
                </h3>

                <p className="mt-1 text-sm text-gray-500">
                    Choose your rooms and the number of guests in each room.
                </p>
            </div>

            {/* Rooms counter */}
            <div
                className="mb-4 rounded-2xl border px-3"
                style={{
                    borderColor: `${COLORS.foreground}20`,
                    backgroundColor: "#FFFFFF80",
                }}
            >
                <Counter
                    label="Rooms"
                    description="Choose 1 to 3 rooms"
                    value={roomGuests.length}
                    min={1}
                    max={MAX_ROOMS}
                    onChange={updateRoomCount}
                />
            </div>

            {/* One independent guest section per room */}
            <div className="space-y-3">
                {roomGuests.map((room, index) => {
                    const roomTotal = room.adults + room.children;

                    return (
                        <div
                            key={room.id}
                            className="rounded-2xl border p-4"
                            style={{
                                borderColor: `${COLORS.foreground}20`,
                            }}
                        >
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <h4
                                    className="text-base font-semibold"
                                    style={{
                                        color: COLORS.foreground,
                                    }}
                                >
                                    Room {index + 1}
                                </h4>

                                <span className="text-sm text-gray-500">
                                    {roomTotal}/4 guests
                                </span>
                            </div>

                            <div className="divide-y divide-gray-200">
                                <Counter
                                    label="Adults"
                                    description="Minimum 1 adult"
                                    value={room.adults}
                                    min={1}
                                    max={4 - room.children}
                                    onChange={(value) =>
                                        updateRoomGuests(
                                            index,
                                            "adults",
                                            value
                                        )
                                    }
                                />

                                <Counter
                                    label="Children"
                                    description="Ages and applicable charges can be confirmed later"
                                    value={room.children}
                                    min={0}
                                    max={4 - room.adults}
                                    onChange={(value) =>
                                        updateRoomGuests(
                                            index,
                                            "children",
                                            value
                                        )
                                    }
                                />
                            </div>

                            {roomTotal === 4 && (
                                <p className="mt-3 text-sm font-medium text-amber-700">
                                    Maximum 4 guests reached for this room.
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Summary */}
            <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                    <p
                        className="text-base font-semibold"
                        style={{ color: COLORS.foreground }}
                    >
                        {roomGuests.length}{" "}
                        {roomGuests.length === 1 ? "room" : "rooms"}
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                        {totalGuests} guests · {totalAdults} adults ·{" "}
                        {totalChildren} children
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-6 py-3 text-sm font-semibold transition hover:brightness-95"
                    style={{
                        backgroundColor: COLORS.accent,
                        color: COLORS.foreground,
                    }}
                >
                    Done
                </button>
            </div>
        </div>
    );
}