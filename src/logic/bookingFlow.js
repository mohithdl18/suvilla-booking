import rooms from "@/data/rooms.json";

/**
 * Get a room's maximum guest capacity.
 * Capacity includes adults and children.
 */
export function getRoomCapacity(room) {
    if (!room) return 0;

    const name = (room.name || room.title || "")
        .trim()
        .toLowerCase();

    if (
        name === "family suite 01" ||
        name === "family suite 02"
    ) {
        return 4;
    }

    if (
        name === "couple suite" ||
        name === "pond view cottage"
    ) {
        return 3;
    }

    const capacity = Number(room.maxGuests);

    return Number.isFinite(capacity) && capacity > 0
        ? capacity
        : 0;
}

/**
 * Count adults and children assigned to a room.
 */
export function getGuestCount(guestRoom = {}) {
    return (
        Math.max(0, Number(guestRoom.adults) || 0) +
        Math.max(0, Number(guestRoom.children) || 0)
    );
}

/**
 * Determine which room types should be displayed.
 *
 * If every guest allocation requires four guests,
 * only Family Suite 01 and Family Suite 02 are shown.
 *
 * Otherwise, all room types are shown.
 */
export function getVisibleRooms(guestRooms = [], allRooms = rooms) {
    if (!Array.isArray(guestRooms) || guestRooms.length === 0) {
        return allRooms;
    }

    const allRoomsNeedFourGuests = guestRooms.every(
        (guestRoom) => getGuestCount(guestRoom) === 4
    );

    if (allRoomsNeedFourGuests) {
        return allRooms.filter(
            (room) => getRoomCapacity(room) === 4
        );
    }

    return allRooms;
}

/**
 * Validate guest allocations before room selection.
 */
export function validateGuestAllocations(guestRooms = []) {
    if (!Array.isArray(guestRooms) || guestRooms.length < 1) {
        return {
            valid: false,
            message: "Please select at least one room.",
        };
    }

    if (guestRooms.length > 3) {
        return {
            valid: false,
            message: "A maximum of 3 rooms can be selected.",
        };
    }

    for (let index = 0; index < guestRooms.length; index += 1) {
        const guestRoom = guestRooms[index];
        const adults = Number(guestRoom.adults);
        const children = Number(guestRoom.children);

        if (
            !Number.isInteger(adults) ||
            !Number.isInteger(children) ||
            adults < 1 ||
            children < 0
        ) {
            return {
                valid: false,
                message: `Please check the guest counts for Room ${index + 1}.`,
            };
        }

        const totalGuests = adults + children;

        if (totalGuests > 4) {
            return {
                valid: false,
                message: `Room ${index + 1} cannot have more than 4 guests.`,
            };
        }

        if (
            !rooms.some(
                (room) => getRoomCapacity(room) >= totalGuests
            )
        ) {
            return {
                valid: false,
                message: `No room type can accommodate the guests assigned to Room ${index + 1}.`,
            };
        }
    }

    return {
        valid: true,
        message: "",
    };
}

/**
 * Check whether a physical room can accommodate an allocation.
 */
export function canRoomAccommodate(room, guestRoom) {
    if (!room || !guestRoom) return false;

    const totalGuests = getGuestCount(guestRoom);

    return (
        totalGuests >= 1 &&
        totalGuests <= getRoomCapacity(room)
    );
}

/**
 * Validate selected physical rooms against their assigned allocations.
 *
 * Supports the explicit `room.guests` assignment used by
 * RoomAvailability.jsx, so selection order cannot mismatch guests.
 */
export function validateRoomSelection(
    selectedRooms = [],
    guestRooms = []
) {
    if (
        !Array.isArray(selectedRooms) ||
        !Array.isArray(guestRooms) ||
        selectedRooms.length !== guestRooms.length
    ) {
        return {
            valid: false,
            message: `Please select ${guestRooms.length} ${
                guestRooms.length === 1 ? "room" : "rooms"
            } to continue.`,
        };
    }

    const uniqueRoomIds = new Set(
        selectedRooms.map((room) => room.id)
    );

    if (uniqueRoomIds.size !== selectedRooms.length) {
        return {
            valid: false,
            message: "Please select different physical rooms for each allocation.",
        };
    }

    const assignedAllocationIds = selectedRooms.map(
        (room) => room.guestAllocationId
    );

    if (
        assignedAllocationIds.some((id) => id == null) ||
        new Set(assignedAllocationIds.map(String)).size !==
            selectedRooms.length
    ) {
        return {
            valid: false,
            message: "Each guest allocation must be assigned to a different room.",
        };
    }

    const expectedAllocationIds = guestRooms.map(
        (guestRoom) => String(guestRoom.id)
    );

    if (
        expectedAllocationIds.some((id) => id === "undefined") ||
        new Set(expectedAllocationIds).size !== guestRooms.length
    ) {
        return {
            valid: false,
            message: "Guest allocations must have unique room IDs.",
        };
    }

    for (let index = 0; index < selectedRooms.length; index += 1) {
        const selectedRoom = selectedRooms[index];

        const assignedGuests =
            selectedRoom.guests ||
            guestRooms.find(
                (guestRoom) =>
                    String(guestRoom.id) ===
                    String(selectedRoom.guestAllocationId)
            );

        if (!assignedGuests) {
            return {
                valid: false,
                message: "A selected room is missing its guest allocation.",
            };
        }

        const allocationExists = guestRooms.some(
            (guestRoom) =>
                String(guestRoom.id) ===
                String(selectedRoom.guestAllocationId)
        );

        if (!allocationExists) {
            return {
                valid: false,
                message: "A selected room has an invalid guest allocation.",
            };
        }

        if (!canRoomAccommodate(selectedRoom, assignedGuests)) {
            const allocationIndex = guestRooms.findIndex(
                (guestRoom) =>
                    String(guestRoom.id) ===
                    String(selectedRoom.guestAllocationId)
            );

            return {
                valid: false,
                message: `The selected room for Room ${allocationIndex + 1} cannot accommodate its assigned guests.`,
            };
        }
    }

    return {
        valid: true,
        message: "",
    };
}