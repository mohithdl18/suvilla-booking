"use client";

import { useCallback, useEffect, useState } from "react";

import BookingCalendar, {
    localDateString,
} from "@/components/Admin/BookingCalendar";

import RoomAvailabilityPanel from "@/components/Admin/RoomAvailabilityPanel";
import AllBookings from "@/components/Admin/AllBookings";
import BookingDetailsModal from "@/components/Admin/BookingDetailsModal";
import LogoutButton from "@/components/Admin/LogoutButton";

export default function AdminDashboard() {
    const [selectedDate, setSelectedDate] = useState(() =>
        localDateString(new Date())
    );

    const [bookings, setBookings] = useState([]);
    const [selectedBooking, setSelectedBooking] = useState(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchBookings = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/admin/bookings", {
                method: "GET",
                cache: "no-store",
                headers: {
                    Accept: "application/json",
                },
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.success) {
                if (response.status === 401) {
                    window.location.href = "/admin/login";
                    return;
                }

                throw new Error(
                    data.message || "Unable to load bookings."
                );
            }

            setBookings(
                Array.isArray(data.bookings) ? data.bookings : []
            );
        } catch (err) {
            console.error("Failed to fetch admin bookings:", err);

            setError(
                err.message || "Unable to load bookings. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const handleViewBooking = useCallback((booking) => {
        setSelectedBooking(booking);
    }, []);

    const handleCloseModal = useCallback(() => {
        setSelectedBooking(null);
    }, []);

    const handleDateSelect = useCallback((date) => {
        setSelectedDate(date);
    }, []);

    const today = localDateString(new Date());

    const activeBookings = bookings.filter(
        (booking) =>
            !["cancelled", "canceled", "rejected"].includes(
                String(booking.status || "").toLowerCase()
            )
    );

    const confirmedBookings = bookings.filter(
        (booking) =>
            String(booking.status || "").toLowerCase() === "confirmed"
    );

    const paidBookings = bookings.filter(
        (booking) =>
            String(booking.paymentStatus || "").toLowerCase() === "paid"
    );

    const totalPaid = paidBookings.reduce(
        (total, booking) =>
            total + (Number(booking.pricing?.total) || 0),
        0
    );

    const formatCurrency = (amount) =>
        new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
        }).format(amount || 0);

    return (
        <main
            className="min-h-screen px-4 py-5 sm:px-6 sm:py-7 lg:px-8"
            style={{
                backgroundColor: "#F7FAEE",
                color: "#052a50",
            }}
        >
            <div className="mx-auto max-w-[1600px]">
                {/* Header */}
                <header className="mb-7 flex flex-col gap-5 border-b border-[#052a50]/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="font-body text-3xl text-[#052a50] sm:text-4xl">
                            SU VILLA
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h1 className="text-lg font-semibold sm:text-xl">
                                Admin Dashboard
                            </h1>

                            <span className="rounded-full bg-[#e4b441]/20 px-3 py-1 text-xs font-semibold text-[#052a50]">
                                Reservations
                            </span>
                        </div>

                        <p className="mt-2 text-sm text-[#052a50]/60">
                            Manage room availability and guest bookings.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={fetchBookings}
                            disabled={loading}
                            className="rounded-xl border border-[#052a50]/15 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-[#052a50]/5 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? "Refreshing…" : "Refresh bookings"}
                        </button>

                        <LogoutButton />
                    </div>
                </header>

                {/* Summary cards */}
                <section className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Total bookings"
                        value={bookings.length}
                        description="All recorded reservations"
                    />

                    <SummaryCard
                        label="Confirmed bookings"
                        value={confirmedBookings.length}
                        description="Reservations marked confirmed"
                    />

                    <SummaryCard
                        label="Active reservations"
                        value={activeBookings.length}
                        description="Excluding cancelled and rejected"
                    />

                    <SummaryCard
                        label="Amount paid"
                        value={formatCurrency(totalPaid)}
                        description="Bookings recorded as paid"
                    />
                </section>

                {/* Error banner */}
                {error && (
                    <div
                        role="alert"
                        className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <p>{error}</p>

                        <button
                            type="button"
                            onClick={fetchBookings}
                            className="shrink-0 rounded-lg border border-red-300 px-3 py-2 font-semibold hover:bg-red-100"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* Calendar and room availability */}
                <section>
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold">
                            Room availability
                        </h2>

                        <p className="mt-1 text-sm text-[#052a50]/60">
                            Select a date to inspect the four rooms and
                            their reservations.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
                        <div className="min-w-0">
                            <BookingCalendar
                                selectedDate={selectedDate}
                                onSelectDate={handleDateSelect}
                                bookings={bookings}
                            />
                        </div>

                        <div className="min-w-0">
                            <RoomAvailabilityPanel
                                selectedDate={selectedDate}
                                bookings={bookings}
                                loading={loading}
                                onViewBooking={handleViewBooking}
                                onRefresh={fetchBookings}
                            />
                        </div>
                    </div>
                </section>

                {/* All bookings */}
                <section className="mt-8">
                    <AllBookings
    bookings={bookings}
    loading={loading}
    error={error}
    onViewBooking={setSelectedBooking}
    onRefresh={fetchBookings}
/>
                </section>

                {/* Selected booking modal */}
                {selectedBooking && (
                    <BookingDetailsModal
                        booking={selectedBooking}
                        onClose={handleCloseModal}
                    />
                )}

                {/* Footer */}
                <footer className="mt-10 border-t border-[#052a50]/10 py-5 text-center">
                    <p className="text-xs text-[#052a50]/45">
                        SU VILLA · Booking Management
                    </p>

                    <p className="mt-1 text-xs text-[#052a50]/35">
                        Today: {today}
                    </p>
                </footer>
            </div>
        </main>
    );
}

function SummaryCard({ label, value, description }) {
    return (
        <article className="rounded-2xl border border-[#052a50]/10 bg-white p-5 shadow-[0_6px_24px_rgba(5,42,80,0.035)]">
            <p className="text-sm font-medium text-[#052a50]/60">
                {label}
            </p>

            <p className="mt-3 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
                {value}
            </p>

            <p className="mt-2 text-xs text-[#052a50]/45">
                {description}
            </p>
        </article>
    );
}