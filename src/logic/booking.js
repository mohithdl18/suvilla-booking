
const VALID_ROOMS = ["Room1", "Room2", "Room3", "Room4"];

// Validate the room ID.
export function validateRoom(roomId) {
    return VALID_ROOMS.includes(roomId);
}

// Validate a booking date range.
export function validateBookingDates(checkIn, checkOut) {
    if (
        typeof checkIn !== "string" ||
        typeof checkOut !== "string"
    ) {
        return false;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(checkIn) || !datePattern.test(checkOut)) {
        return false;
    }

    const start = new Date(`${checkIn}T00:00:00.000Z`);
    const end = new Date(`${checkOut}T00:00:00.000Z`);

    return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        start.toISOString().slice(0, 10) === checkIn &&
        end.toISOString().slice(0, 10) === checkOut &&
        end > start
    );
}

// Generate each occupied night.
// The checkout date is excluded.
export function getStayDates(checkIn, checkOut) {
    if (!validateBookingDates(checkIn, checkOut)) {
        throw new Error("Invalid check-in or checkout dates.");
    }

    const dates = [];
    const current = new Date(`${checkIn}T00:00:00.000Z`);
    const end = new Date(`${checkOut}T00:00:00.000Z`);

    while (current < end) {
        dates.push(current.toISOString().slice(0, 10));
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
}

// Check whether a room is listed as booked for a given date.
// A missing availability document means the room is available.
export function isRoomAvailable(roomId, date, availabilityRecords) {
    if (!validateRoom(roomId)) {
        return false;
    }

    const record = availabilityRecords.find(
        (item) => item.date === date
    );

    if (!record) {
        return true;
    }

    return !record.booked_rooms.includes(roomId);
}

// Check availability for every night of a stay.
// availabilityRecords must be fetched from MongoDB by the caller.
export function isRoomAvailableForStay(
    roomId,
    checkIn,
    checkOut,
    availabilityRecords
) {
    if (!validateRoom(roomId)) {
        return false;
    }

    if (!validateBookingDates(checkIn, checkOut)) {
        return false;
    }

    const stayDates = getStayDates(checkIn, checkOut);

    return stayDates.every((date) =>
        isRoomAvailable(roomId, date, availabilityRecords)
    );
}
