"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import rooms from "@/data/rooms.json";
import { calculateNights } from "@/logic/pricing";
import {
    getVisibleRooms,
    validateGuestAllocations,
    validateRoomSelection,
} from "@/logic/bookingFlow";
import RoomCard from "./RoomCard";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

const MAX_ROOMS = 3;

function getAllocationId(guestRoom, index) {
    return String(guestRoom?.id ?? index + 1);
}

export default function RoomAvailability({
    checkIn,
    checkOut,
    adults = 2,
    children = 0,
    guestRooms = [],
    onSelectRoom,
    searchKey = 0,
}) {
    const [availability, setAvailability] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectionError, setSelectionError] = useState("");
    const [selectedRooms, setSelectedRooms] = useState([]);

    const normalizedGuestRooms = useMemo(() => {
        const source =
            Array.isArray(guestRooms) && guestRooms.length > 0
                ? guestRooms.slice(0, MAX_ROOMS)
                : [{ id: 1, adults, children }];

        return source.map((guestRoom, index) => ({
            ...guestRoom,
            id: getAllocationId(guestRoom, index),
            adults: Math.max(0, Number(guestRoom.adults) || 0),
            children: Math.max(0, Number(guestRoom.children) || 0),
        }));
    }, [guestRooms, adults, children]);

    const requestedRoomCount = normalizedGuestRooms.length;

    const totalGuests = normalizedGuestRooms.reduce(
        (sum, guestRoom) => sum + guestRoom.adults + guestRoom.children,
        0
    );

    const allocationSignature = normalizedGuestRooms
        .map(
            (guestRoom) =>
                `${guestRoom.id}:${guestRoom.adults}:${guestRoom.children}`
        )
        .join("|");

    const guestValidation = useMemo(
        () => validateGuestAllocations(normalizedGuestRooms),
        [normalizedGuestRooms]
    );

    const visibleRooms = useMemo(
        () => getVisibleRooms(normalizedGuestRooms, rooms),
        [normalizedGuestRooms]
    );

    const allRequestedRoomsHaveFourGuests = normalizedGuestRooms.every(
        (guestRoom) =>
            guestRoom.adults + guestRoom.children === 4
    );

    const loadAvailability = useCallback(
        async (signal) => {
            if (!checkIn || !checkOut || checkOut <= checkIn) {
                setAvailability([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            setError("");

            try {
                const params = new URLSearchParams({
                    checkIn,
                    checkOut,
                });

                const response = await fetch(
                    `/api/availability?${params.toString()}`,
                    { signal }
                );

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(
                        result.message ||
                            "Unable to load room availability."
                    );
                }

                setAvailability(result.rooms || []);
            } catch (err) {
                if (err.name !== "AbortError") {
                    console.error("Availability request failed:", err);

                    setError(
                        "We couldn't load room availability. Please try again."
                    );
                }
            } finally {
                if (!signal.aborted) {
                    setLoading(false);
                }
            }
        },
        [checkIn, checkOut]
    );

    useEffect(() => {
        const controller = new AbortController();

        loadAvailability(controller.signal);

        return () => controller.abort();
    }, [loadAvailability, searchKey]);

    // Clear selections whenever dates or any individual guest allocation changes.
    useEffect(() => {
        setSelectedRooms([]);
        setSelectionError("");
    }, [checkIn, checkOut, searchKey, allocationSignature]);

    const nights =
        checkIn && checkOut && checkOut > checkIn
            ? calculateNights(checkIn, checkOut)
            : 0;

    /**
     * One physical room can have only one allocation.
     * One allocation can be assigned to only one physical room.
     */
    function toggleRoom(room, guestRoom) {
        setSelectionError("");

        const allocationId = String(guestRoom.id);

        setSelectedRooms((previous) => {
            const existingRoomAssignment = previous.find(
                (item) => item.id === room.id
            );

            // Clicking the already selected allocation deselects it.
            if (
                existingRoomAssignment?.guestAllocationId === allocationId
            ) {
                return previous.filter((item) => item.id !== room.id);
            }

            // Do not assign the same guest allocation to another room.
            const allocationAlreadyAssigned = previous.some(
                (item) => item.guestAllocationId === allocationId
            );

            if (allocationAlreadyAssigned) {
                setSelectionError(
                    `The allocation for Room ${
                        normalizedGuestRooms.findIndex(
                            (item) => item.id === allocationId
                        ) + 1
                    } is already assigned to another room.`
                );

                return previous;
            }

            // Changing the allocation of an already selected physical room
            // replaces its previous assignment.
            if (existingRoomAssignment) {
                return previous.map((item) =>
                    item.id === room.id
                        ? {
                              ...room,
                              guestAllocationId: allocationId,
                              guests: guestRoom,
                          }
                        : item
                );
            }

            if (previous.length >= requestedRoomCount) {
                setSelectionError(
                    `You can select a maximum of ${requestedRoomCount} ${
                        requestedRoomCount === 1 ? "room" : "rooms"
                    }.`
                );

                return previous;
            }

            return [
                ...previous,
                {
                    ...room,
                    guestAllocationId: allocationId,
                    guests: guestRoom,
                },
            ];
        });
    }

    function handleBookRooms() {
        if (!guestValidation.valid) {
            setSelectionError(guestValidation.message);
            return;
        }

        if (selectedRooms.length !== requestedRoomCount) {
            setSelectionError(
                `Please assign all ${requestedRoomCount} ${
                    requestedRoomCount === 1 ? "room" : "rooms"
                } to continue.`
            );
            return;
        }

        const selectedRoomDetails = selectedRooms
            .map((room) => ({
                ...room,
                guests: normalizedGuestRooms.find(
                    (guestRoom) =>
                        guestRoom.id === room.guestAllocationId
                ),
            }))
            .sort(
                (a, b) =>
                    normalizedGuestRooms.findIndex(
                        (guestRoom) => guestRoom.id === a.guestAllocationId
                    ) -
                    normalizedGuestRooms.findIndex(
                        (guestRoom) => guestRoom.id === b.guestAllocationId
                    )
            );

        if (selectedRoomDetails.some((room) => !room.guests)) {
            setSelectionError(
                "One or more rooms are missing their guest allocation. Please select them again."
            );
            return;
        }

        const selectionValidation = validateRoomSelection(
            selectedRoomDetails,
            normalizedGuestRooms
        );

        if (!selectionValidation.valid) {
            setSelectionError(selectionValidation.message);
            return;
        }

        setSelectionError("");

        if (selectedRoomDetails.length === 1) {
            onSelectRoom?.(selectedRoomDetails[0]);
            return;
        }

        onSelectRoom?.({
            id: `multi-${selectedRoomDetails
                .map((room) => room.id)
                .join("-")}`,
            name: selectedRoomDetails
                .map((room) => room.name)
                .join(" + "),
            isMultiRoom: true,
            rooms: selectedRoomDetails,
            roomIds: selectedRoomDetails.map((room) => room.id),
            roomCount: selectedRoomDetails.length,
            guests: normalizedGuestRooms,
            totalGuests,
        });
    }

    if (!checkIn || !checkOut || checkOut <= checkIn) {
        return (
            <div
                className="rounded-2xl border p-8 text-center"
                style={{
                    backgroundColor: COLORS.background,
                    borderColor: `${COLORS.foreground}20`,
                    color: COLORS.foreground,
                }}
            >
                <p className="text-sm opacity-70">
                    Select your check-in and checkout dates, then search
                    to view available rooms.
                </p>
            </div>
        );
    }

    return (
        <section className="w-full pb-32">
            {loading && (
                <div
                    className="rounded-xl border p-6 text-center text-sm"
                    style={{
                        borderColor: `${COLORS.foreground}20`,
                        color: COLORS.foreground,
                    }}
                    role="status"
                >
                    Checking room availability...
                </div>
            )}

            {error && !loading && (
                <div
                    className="rounded-xl border border-red-200 bg-red-50 p-5"
                    role="alert"
                >
                    <p className="text-sm text-red-800">{error}</p>

                    <button
                        type="button"
                        onClick={() => {
                            const controller = new AbortController();
                            loadAvailability(controller.signal);
                        }}
                        className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold"
                        style={{
                            backgroundColor: COLORS.accent,
                            color: COLORS.foreground,
                        }}
                    >
                        Try again
                    </button>
                </div>
            )}

            {!loading && !error && (
                <>
                    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2
                                className="text-xl font-semibold"
                                style={{ color: COLORS.foreground }}
                            >
                                Available rooms
                            </h2>

                            <p className="mt-1 text-sm text-gray-500">
                                Assign each guest group to a different room.
                            </p>
                        </div>

                        <p
                            className="text-sm font-medium"
                            style={{ color: COLORS.foreground }}
                        >
                            {nights} {nights === 1 ? "night" : "nights"}
                        </p>
                    </div>

                    {!guestValidation.valid && (
                        <p
                            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                            role="alert"
                        >
                            {guestValidation.message}
                        </p>
                    )}

                    {allRequestedRoomsHaveFourGuests &&
                        requestedRoomCount > 1 && (
                            <p
                                className="mb-4 rounded-xl border p-3 text-sm"
                                style={{
                                    borderColor: `${COLORS.foreground}20`,
                                    color: COLORS.foreground,
                                    backgroundColor: COLORS.background,
                                }}
                            >
                                Every room requires four guests, so only
                                Family Suite 01 and Family Suite 02 are shown.
                            </p>
                        )}

                    <div className="space-y-5">
                        {visibleRooms.map((room) => {
                            const roomStatus = availability.find(
                                (item) => item.roomId === room.id
                            );

                            const available =
                                roomStatus?.available === true;

                            const assignedRoom = selectedRooms.find(
                                (item) => item.id === room.id
                            );

                            const selectedAllocationIds = selectedRooms.map(
                                (item) => item.guestAllocationId
                            );

                            return (
                                <div key={room.id} className="relative">
                                    <RoomCard
                                        room={room}
                                        checkIn={checkIn}
                                        checkOut={checkOut}
                                        nights={nights}
                                        adults={2}
                                        children={0}
                                        available={available}
                                        isSelected={Boolean(assignedRoom)}
                                        selectionMode={true}
                                        guestAllocations={normalizedGuestRooms}
                                        selectedAllocationId={
                                            assignedRoom?.guestAllocationId ?? null
                                        }
                                        selectedAllocationIds={
                                            selectedAllocationIds
                                        }
                                        onSelectRoom={(selectedRoom, guestRoom) =>
                                            toggleRoom(
                                                selectedRoom,
                                                guestRoom
                                            )
                                        }
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {visibleRooms.length === 0 && (
                        <p
                            className="rounded-xl border p-5 text-center text-sm"
                            style={{
                                borderColor: `${COLORS.foreground}20`,
                                color: COLORS.foreground,
                            }}
                        >
                            No room types match the selected guest
                            configuration.
                        </p>
                    )}

                    {availability.length === 0 && (
                        <p
                            className="mt-5 rounded-xl border p-5 text-center text-sm"
                            style={{
                                borderColor: `${COLORS.foreground}20`,
                                color: COLORS.foreground,
                            }}
                        >
                            No availability information was returned.
                        </p>
                    )}

                    {selectionError && (
                        <p
                            className="mt-4 text-center text-sm text-red-700"
                            role="alert"
                        >
                            {selectionError}
                        </p>
                    )}
                </>
            )}

            {selectedRooms.length > 0 && (
                <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
                    <button
                        type="button"
                        disabled={
                            selectedRooms.length !== requestedRoomCount ||
                            !guestValidation.valid
                        }
                        onClick={handleBookRooms}
                        className="whitespace-nowrap rounded-full px-10 py-4 text-base font-semibold shadow-xl transition disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                            backgroundColor: COLORS.accent,
                            color: COLORS.foreground,
                        }}
                    >
                        Book Rooms ({selectedRooms.length}/{requestedRoomCount})
                    </button>
                </div>
            )}
        </section>
    );
}