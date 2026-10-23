
"use client";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

function formatINR(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(Number(amount) || 0);
}

export default function BookingConfirmation({
    booking,
    onClose,
    onNewBooking,
}) {
    if (!booking) return null;

    const roomName =
        booking.roomName ||
        booking.room?.name ||
        booking.roomId ||
        "Selected room";

    const pricing = booking.pricing || {};

    const total =
        pricing.total ??
        pricing.totalAmount ??
        booking.totalAmount ??
        0;

    const checkIn = booking.checkIn || "";
    const checkOut = booking.checkOut || "";
    const nights = booking.nights || 0;

    const bookingId =
        booking.bookingId || booking._id || "Confirmed";

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
            style={{ backgroundColor: "rgba(5, 42, 80, 0.65)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-confirmation-title"
        >
            <div
                className="my-auto w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
                style={{
                    backgroundColor: COLORS.background,
                    color: COLORS.foreground,
                }}
            >
                <div
                    className="px-6 py-8 text-center sm:px-8"
                    style={{
                        backgroundColor: COLORS.foreground,
                        color: COLORS.background,
                    }}
                >
                    <div
                        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl font-bold"
                        style={{
                            backgroundColor: COLORS.accent,
                            color: COLORS.foreground,
                        }}
                        aria-hidden="true"
                    >
                        ✓
                    </div>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] opacity-75">
                        SU VILLA
                    </p>

                    <h2
                        id="booking-confirmation-title"
                        className="mt-2 text-2xl font-semibold sm:text-3xl"
                    >
                        Booking confirmed!
                    </h2>

                    <p className="mt-2 text-sm opacity-80">
                        Your reservation has been created successfully.
                    </p>
                </div>

                <div className="space-y-5 p-6 sm:p-8">
                    <div
                        className="rounded-xl border p-4 text-center"
                        style={{ borderColor: `${COLORS.foreground}25` }}
                    >
                        <p className="text-xs font-medium uppercase tracking-wider opacity-60">
                            Booking reference
                        </p>

                        <p className="mt-2 break-all text-lg font-bold">
                            {bookingId}
                        </p>
                    </div>

                    <section>
                        <h3 className="font-semibold">Reservation details</h3>

                        <div className="mt-3 space-y-3 rounded-xl border border-black/10 bg-white/50 p-4">
                            <DetailRow label="Room" value={roomName} />

                            <DetailRow
                                label="Check-in"
                                value={checkIn || "—"}
                            />

                            <DetailRow
                                label="Check-out"
                                value={checkOut || "—"}
                            />

                            <DetailRow
                                label="Duration"
                                value={`${nights} ${
                                    nights === 1 ? "night" : "nights"
                                }`}
                            />

                            <DetailRow
                                label="Guests"
                                value={`${booking.guests?.adults ?? booking.adults ?? 2} adults, ${
                                    booking.guests?.children ?? booking.children ?? 0
                                } children`}
                            />
                        </div>
                    </section>

                    <section
                        className="rounded-xl p-4"
                        style={{
                            backgroundColor: `${COLORS.accent}30`,
                        }}
                    >
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-medium">
                                Total booking amount
                            </span>

                            <span className="text-xl font-bold">
                                {formatINR(total)}
                            </span>
                        </div>

                        <p className="mt-2 text-xs opacity-70">
                            {booking.paymentStatus === "paid"
                                ? "Payment received."
                                : "Payment status: " +
                                  (booking.paymentStatus || "Not required")}
                        </p>
                    </section>

                    {booking.customer?.name && (
                        <p className="text-sm opacity-70">
                            Thank you, {booking.customer.name}. We look forward
                            to welcoming you to SU VILLA.
                        </p>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row">
                        {onNewBooking && (
                            <button
                                type="button"
                                onClick={onNewBooking}
                                className="flex-1 rounded-xl px-5 py-3 text-sm font-bold transition hover:brightness-95"
                                style={{
                                    backgroundColor: COLORS.accent,
                                    color: COLORS.foreground,
                                }}
                            >
                                Make Another Booking
                            </button>
                        )}

                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 rounded-xl border border-black/15 px-5 py-3 text-sm font-semibold transition hover:bg-black/5"
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="opacity-60">{label}</span>
            <span className="text-right font-medium">{value}</span>
        </div>
    );
}
