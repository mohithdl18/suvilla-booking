
import pricing from "@/data/pricing.json";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// Parse a YYYY-MM-DD date without timezone-related shifts.
function parseDate(dateString) {
    if (typeof dateString !== "string") {
        throw new Error("Date must be a YYYY-MM-DD string.");
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);

    if (!match) {
        throw new Error("Invalid date format. Use YYYY-MM-DD.");
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error("Invalid calendar date.");
    }

    return date;
}

// Calculate the number of nights between check-in and checkout.
export function calculateNights(checkIn, checkOut) {
    const start = parseDate(checkIn);
    const end = parseDate(checkOut);

    const nights = (end.getTime() - start.getTime()) / DAY_IN_MS;

    if (nights <= 0) {
        throw new Error("Checkout must be after check-in.");
    }

    return nights;
}

// Return the configured room rate for a particular night.
// Monday-Thursday = weekday.
// Friday-Sunday = weekend.
// Optional peak dates can override the regular rate.
export function getNightlyRoomRate(dateString, peakDates = []) {
    const date = parseDate(dateString);
    const formattedDate = dateString;

    if (peakDates.includes(formattedDate)) {
        return pricing.roomRates.peakDay;
    }

    const dayOfWeek = date.getUTCDay();

    // Sunday (0), Friday (5), and Saturday (6) are weekend days.
    if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
        return pricing.roomRates.weekend;
    }

    return pricing.roomRates.weekday;
}

// Calculate the room-only price for the entire stay.
// Checkout day is excluded from the calculation.
export function calculateRoomPrice(
    checkIn,
    checkOut,
    peakDates = []
) {
    const nights = calculateNights(checkIn, checkOut);
    const start = parseDate(checkIn);

    let roomTotal = 0;
    const nightlyBreakdown = [];

    for (let i = 0; i < nights; i++) {
        const currentDate = new Date(
            start.getTime() + i * DAY_IN_MS
        );

        const dateString = currentDate.toISOString().slice(0, 10);
        const nightlyRate = getNightlyRoomRate(
            dateString,
            peakDates
        );

        roomTotal += nightlyRate;

        nightlyBreakdown.push({
            date: dateString,
            rate: nightlyRate,
        });
    }

    return {
        nights,
        roomTotal,
        nightlyBreakdown,
    };
}

// Calculate checkout fees on the supplied subtotal.
// Pass the subtotal including applicable room and add-on charges.
export function calculateCheckoutFees(subtotal) {
    if (!Number.isFinite(subtotal) || subtotal < 0) {
        throw new Error("Subtotal must be a non-negative number.");
    }

    const tax = Math.round(
        subtotal * pricing.checkoutFees.taxPercent / 100
    );

    const platformFee = Math.round(
        subtotal * pricing.checkoutFees.platformFeePercent / 100
    );

    return {
        subtotal,
        tax,
        platformFee,
        total: subtotal + tax + platformFee,
    };
}
