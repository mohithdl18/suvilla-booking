"use client";

import { useCallback, useEffect, useState } from "react";

import UtilBar from "@/components/Booking/UtilBar";
import RoomAvailability from "@/components/Booking/RoomAvailability";
import AddonsModal from "@/components/Booking/AddonsModal";
import BookingDetailsModal from "@/components/Booking/BookingDetailsModal";
import Checkout from "@/components/Booking/Checkout";
import BookingConfirmation from "@/components/Booking/BookingConfirmation";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

const RAZORPAY_CHECKOUT_URL =
    "https://checkout.razorpay.com/v1/checkout.js";

function getDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    };

    return {
        checkIn: formatDate(today),
        checkOut: formatDate(tomorrow),
    };
}

function formatDate(dateString) {
    if (!dateString) return "—";

    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function getSelectedRooms(selection) {
    if (!selection) return [];

    if (Array.isArray(selection.rooms) && selection.rooms.length > 0) {
        return selection.rooms;
    }

    return [selection];
}

function getRoomId(room) {
    return String(room?.roomId ?? room?.id ?? "");
}

function mergeRoomAddons(selectedRoom, selectedAddons) {
    const selectedRooms = getSelectedRooms(selectedRoom);
    const addonRooms = Array.isArray(selectedAddons?.rooms)
        ? selectedAddons.rooms
        : [];

    return addonRooms.map((addonRoom) => {
        const originalRoom = selectedRooms.find(
            (item) => getRoomId(item) === getRoomId(addonRoom)
        );

        return {
            roomId: getRoomId(addonRoom),
            roomName:
                originalRoom?.name ??
                originalRoom?.title ??
                originalRoom?.roomName ??
                getRoomId(addonRoom),
            guests: {
                adults: Number(
                    addonRoom.guests?.adults ??
                        originalRoom?.guests?.adults ??
                        originalRoom?.adults ??
                        2
                ),
                children: Number(
                    addonRoom.guests?.children ??
                        originalRoom?.guests?.children ??
                        originalRoom?.children ??
                        0
                ),
            },
        };
    });
}

function normalizeAddonChoices(addons) {
    // Accept add-ons directly or nested under `addons`.
    // Only supported selections are sent to the backend.
    // Client-calculated prices are never used as authoritative pricing.
    const source = addons?.addons ?? addons ?? {};

    return {
        mealPlan: Array.isArray(source.mealPlan)
            ? source.mealPlan
            : [],
        driver: source.driver === true,
        driverMealPlan: Array.isArray(source.driverMealPlan)
            ? source.driverMealPlan
            : [],
    };
}

function normalizeCustomerForRequest(customer) {
    return {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address ?? "",
        city: customer.city ?? "",
        pinCode: customer.pinCode ?? "",
        specialRequest: customer.specialRequest ?? "",
    };
}

async function readApiResponse(response) {
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
        throw new Error(
            result.message || "The request could not be completed."
        );
    }

    return result;
}

function loadRazorpayCheckout() {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            reject(
                new Error("Payment checkout is only available in a browser.")
            );
            return;
        }

        if (window.Razorpay) {
            resolve(true);
            return;
        }

        const existingScript = document.querySelector(
            `script[src="${RAZORPAY_CHECKOUT_URL}"]`
        );

        if (existingScript) {
            existingScript.addEventListener(
                "load",
                () => {
                    if (window.Razorpay) resolve(true);
                    else reject(new Error("Unable to load Razorpay Checkout."));
                },
                { once: true }
            );

            existingScript.addEventListener(
                "error",
                () => reject(new Error("Unable to load Razorpay Checkout.")),
                { once: true }
            );

            return;
        }

        const script = document.createElement("script");
        script.src = RAZORPAY_CHECKOUT_URL;
        script.async = true;

        script.onload = () => {
            if (window.Razorpay) resolve(true);
            else reject(new Error("Unable to initialize Razorpay Checkout."));
        };

        script.onerror = () => {
            reject(
                new Error(
                    "Could not load Razorpay. Please check your connection and try again."
                )
            );
        };

        document.body.appendChild(script);
    });
}

function openRazorpayCheckout({ key, order, customer, bookingId }) {
    return new Promise((resolve, reject) => {
        if (!window.Razorpay) {
            reject(new Error("Razorpay Checkout has not loaded."));
            return;
        }

        let settled = false;

        const finish = (callback, value) => {
            if (settled) return;

            settled = true;
            callback(value);
        };

        const checkout = new window.Razorpay({
            key,
            amount: order.amount,
            currency: order.currency,
            name: "SU VILLA",
            description: `Booking ${bookingId}`,
            order_id: order.id,

            prefill: {
                name: customer.name,
                email: customer.email,
                contact: customer.phone,
            },

            notes: {
                bookingId,
            },

            theme: {
                color: COLORS.foreground,
            },

            modal: {
                ondismiss: () => {
                    finish(
                        reject,
                        new Error(
                            "Payment window closed before payment was completed. If you completed a payment, please contact the property before retrying."
                        )
                    );
                },
            },

            // Resolve only when Razorpay returns successful payment details.
            // The backend will independently verify the payment.
            handler: (paymentResponse) => {
                finish(resolve, paymentResponse);
            },
        });

        // Do not reject on payment.failed. A failed attempt can occur while
        // the customer is still in Razorpay and may retry the payment.
        checkout.on("payment.failed", (response) => {
            console.warn(
                "Razorpay payment attempt failed; checkout remains open for retry.",
                response?.error?.code || "UNKNOWN_ERROR",
                response?.error?.description || "No description provided."
            );
        });

        checkout.open();
    });
}

export default function BookingPage() {
    // Set dates after mounting to avoid evaluating the current date during
    // the initial server prerender.
    const [dates, setDates] = useState({
        checkIn: "",
        checkOut: "",
    });

    useEffect(() => {
        setDates(getDefaultDates());
    }, []);

    const [guests, setGuests] = useState({
        adults: 2,
        children: 0,
        rooms: [{ id: 1, adults: 2, children: 0 }],
        roomCount: 1,
        totalGuests: 2,
    });

    const [searchKey, setSearchKey] = useState(0);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [addons, setAddons] = useState(null);

    const [customer, setCustomer] = useState({
        name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        pinCode: "",
        specialRequest: "",
    });

    const [currentStep, setCurrentStep] = useState(null);
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const selectedRooms = getSelectedRooms(selectedRoom);
    const bookingRooms = Array.isArray(addons?.rooms) ? addons.rooms : [];

    const handleSearch = useCallback((search) => {
        const roomGuests =
            Array.isArray(search.rooms) && search.rooms.length > 0
                ? search.rooms
                : [
                      {
                          id: 1,
                          adults: search.adults ?? 2,
                          children: search.children ?? 0,
                      },
                  ];

        setDates({
            checkIn: search.checkIn,
            checkOut: search.checkOut,
        });

        setGuests({
            adults: search.adults ?? 2,
            children: search.children ?? 0,
            rooms: roomGuests,
            roomCount: search.roomCount ?? roomGuests.length,
            totalGuests:
                search.totalGuests ??
                roomGuests.reduce(
                    (sum, item) =>
                        sum +
                        (Number(item.adults) || 0) +
                        (Number(item.children) || 0),
                    0
                ),
        });

        setSelectedRoom(null);
        setAddons(null);
        setCurrentStep(null);
        setBooking(null);
        setError("");

        setSearchKey((previous) => previous + 1);
    }, []);

    const handleSelectRoom = useCallback((room) => {
        setSelectedRoom(room);
        setAddons(null);
        setCurrentStep("addons");
        setError("");
    }, []);

    const handleContinueToDetails = useCallback(
        (selectedAddons) => {
            const originalRooms = getSelectedRooms(selectedRoom);

            if (
                !selectedAddons ||
                !Array.isArray(selectedAddons.rooms) ||
                selectedAddons.rooms.length !== originalRooms.length
            ) {
                setError(
                    "Please review your selected rooms and try again."
                );
                return;
            }

            const roomsWithAddons = mergeRoomAddons(
                selectedRoom,
                selectedAddons
            );

            const expectedRoomIds = originalRooms
                .map(getRoomId)
                .sort();

            const receivedRoomIds = roomsWithAddons
                .map(getRoomId)
                .sort();

            if (
                roomsWithAddons.length !== originalRooms.length ||
                expectedRoomIds.some(
                    (id, index) => id !== receivedRoomIds[index]
                )
            ) {
                setError(
                    "Some selected rooms are missing. Please select your rooms again."
                );
                return;
            }

            setAddons({
                rooms: roomsWithAddons,
                roomCount: roomsWithAddons.length,
                totalGuests: roomsWithAddons.reduce(
                    (sum, room) =>
                        sum + room.guests.adults + room.guests.children,
                    0
                ),

                // Preserve the complete add-on object for the UI, including
                // items, total, and meal details for both booking modals.
                addons: selectedAddons.addons ?? {},
            });

            setCustomer({
                name: "",
                email: "",
                phone: "",
                address: "",
                city: "",
                pinCode: "",
                specialRequest: "",
            });

            setError("");
            setCurrentStep("details");
        },
        [selectedRoom]
    );

    const handleContinueToCheckout = useCallback((customerDetails) => {
        setCustomer(customerDetails);
        setError("");
        setCurrentStep("checkout");
    }, []);

    const handleConfirmBooking = useCallback(async () => {
        if (
            !selectedRoom ||
            bookingRooms.length === 0 ||
            !customer.name?.trim() ||
            !customer.email?.trim() ||
            !customer.phone?.trim()
        ) {
            setError(
                "Please complete your name, email, phone number, and booking details."
            );
            return;
        }

        setLoading(true);
        setError("");

        let createdBookingId = null;

        try {
            const roomsPayload = bookingRooms.map((item) => ({
                roomId: item.roomId,
                guests: {
                    adults: item.guests.adults,
                    children: item.guests.children,
                },
            }));

            const payload = {
                checkIn: dates.checkIn,
                checkOut: dates.checkOut,
                customer: normalizeCustomerForRequest(customer),
                rooms: roomsPayload,

                // Send only the selected add-on choices. The server computes
                // the actual prices from trusted pricing data.
                addons: normalizeAddonChoices(addons),
            };

            // 1. Create the checkout intent. The server calculates pricing.
            const bookingResponse = await fetch("/api/bookings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const bookingResult = await readApiResponse(bookingResponse);

            if (!bookingResult.booking?.bookingId) {
                throw new Error(
                    "The server did not return a valid booking reference."
                );
            }

            createdBookingId = bookingResult.booking.bookingId;

            // 2. Create a Razorpay order for this booking.
            const orderResponse = await fetch(
                "/api/payments/create-order",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        bookingId: createdBookingId,
                    }),
                }
            );

            const orderResult = await readApiResponse(orderResponse);

            if (
                !orderResult.key ||
                !orderResult.order?.id ||
                !Number.isFinite(Number(orderResult.order.amount)) ||
                Number(orderResult.order.amount) <= 0
            ) {
                throw new Error(
                    "The server returned invalid payment order details."
                );
            }

            // 3. Load Razorpay Checkout and open the payment window.
            await loadRazorpayCheckout();

            const paymentResponse = await openRazorpayCheckout({
                key: orderResult.key,
                order: orderResult.order,
                customer,
                bookingId: createdBookingId,
            });

            if (
                !paymentResponse?.razorpay_payment_id ||
                !paymentResponse?.razorpay_order_id ||
                !paymentResponse?.razorpay_signature
            ) {
                throw new Error(
                    "Razorpay did not return all the required verification details."
                );
            }

            // 4. The server verifies the signature and checks payment status.
            const verificationResponse = await fetch(
                "/api/payments/verify",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        bookingId: createdBookingId,
                        razorpay_payment_id:
                            paymentResponse.razorpay_payment_id,
                        razorpay_order_id:
                            paymentResponse.razorpay_order_id,
                        razorpay_signature:
                            paymentResponse.razorpay_signature,
                    }),
                }
            );

            const verificationResult = await readApiResponse(
                verificationResponse
            );

            if (
                verificationResult.booking?.status !== "confirmed" ||
                verificationResult.booking?.paymentStatus !== "paid"
            ) {
                throw new Error(
                    "Payment verification is not complete. Please check your booking status before trying again."
                );
            }

            // 5. Show confirmation only after server-side verification.
            setBooking({
                ...verificationResult.booking,
                bookingId:
                    verificationResult.booking.bookingId || createdBookingId,
                customer: {
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone,
                },
            });

            setSelectedRoom(null);
            setAddons(null);
            setCurrentStep(null);
            setError("");
        } catch (err) {
            console.error("Booking/payment flow error:", err);

            setError(
                err.message ||
                    "Something went wrong. Please check your booking status before retrying."
            );
        } finally {
            setLoading(false);
        }
    }, [selectedRoom, bookingRooms, customer, dates, addons]);

    const closeBookingFlow = useCallback(() => {
        if (loading) return;

        setSelectedRoom(null);
        setAddons(null);
        setCurrentStep(null);
        setError("");
    }, [loading]);

    const startNewBooking = useCallback(() => {
        if (loading) return;

        setBooking(null);
        setSelectedRoom(null);
        setAddons(null);
        setCurrentStep(null);
        setError("");
        setSearchKey((previous) => previous + 1);
    }, [loading]);

    const nights =
        dates.checkIn && dates.checkOut
            ? Math.max(
                  1,
                  Math.round(
                      (new Date(`${dates.checkOut}T00:00:00Z`).getTime() -
                          new Date(`${dates.checkIn}T00:00:00Z`).getTime()) /
                          86400000
                  )
              )
            : 1;

    return (
        <main
            className="min-h-screen"
            style={{
                backgroundColor: COLORS.background,
                color: COLORS.foreground,
            }}
        >
            <section className="px-4 pb-16 pt-10 sm:px-8 lg:px-12">
                <div className="mx-auto max-w-7xl">
                    <header className="mb-8 text-center">
                        <p
                            className="text-xs font-semibold uppercase tracking-[0.25em]"
                            style={{ color: COLORS.accent }}
                        >
                            SU VILLA
                        </p>

                        <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">
                            Find Your Perfect Stay
                        </h1>

                        <p className="mx-auto mt-3 max-w-2xl text-sm opacity-70 sm:text-base">
                            Choose your dates, explore our rooms, and plan
                            your stay at SU VILLA.
                        </p>
                    </header>

                    <div className="mx-auto max-w-6xl">
                        {dates.checkIn && dates.checkOut ? (
                            <UtilBar
                                onSearch={handleSearch}
                                initialCheckIn={dates.checkIn}
                                initialCheckOut={dates.checkOut}
                                initialAdults={guests.adults}
                                initialChildren={guests.children}
                            />
                        ) : (
                            <div
                                className="h-20 animate-pulse rounded-xl bg-[#052a50]/5"
                                aria-label="Loading booking dates"
                            />
                        )}

                        <div className="mx-2 mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg bg-[#052a50]/[0.045] px-3 py-2 text-xs text-[#052a50]/65 sm:justify-start sm:px-5">
                            <span>
                                {formatDate(dates.checkIn)} –{" "}
                                {formatDate(dates.checkOut)}
                            </span>

                            <span className="hidden text-[#052a50]/25 sm:inline">
                                |
                            </span>

                            <span>
                                {nights} {nights === 1 ? "night" : "nights"}
                            </span>

                            <span className="hidden text-[#052a50]/25 sm:inline">
                                |
                            </span>

                            <span>
                                {guests.roomCount}{" "}
                                {guests.roomCount === 1 ? "room" : "rooms"},{" "}
                                {guests.adults}{" "}
                                {guests.adults === 1 ? "adult" : "adults"},{" "}
                                {guests.children}{" "}
                                {guests.children === 1 ? "child" : "children"}
                            </span>
                        </div>
                    </div>

                    {dates.checkIn && dates.checkOut && (
                        <div className="mx-auto mt-8 max-w-7xl">
                            <RoomAvailability
                                key={searchKey}
                                checkIn={dates.checkIn}
                                checkOut={dates.checkOut}
                                adults={guests.adults}
                                children={guests.children}
                                guestRooms={guests.rooms}
                                onSelectRoom={handleSelectRoom}
                                searchKey={searchKey}
                            />
                        </div>
                    )}

                    {error && !selectedRoom && (
                        <div
                            className="mx-auto mt-6 max-w-7xl rounded-xl border p-4 text-sm"
                            style={{
                                borderColor: "#b91c1c55",
                                color: "#b91c1c",
                                backgroundColor: "#b91c1c0a",
                            }}
                            role="alert"
                        >
                            {error}
                        </div>
                    )}
                </div>
            </section>

            {selectedRoom && currentStep === "addons" && (
                <AddonsModal
                    room={selectedRoom}
                    rooms={selectedRooms}
                    checkIn={dates.checkIn}
                    checkOut={dates.checkOut}
                    nights={nights}
                    adults={selectedRoom.guests?.adults ?? guests.adults}
                    children={
                        selectedRoom.guests?.children ?? guests.children
                    }
                    onContinue={handleContinueToDetails}
                    onClose={closeBookingFlow}
                />
            )}

            {selectedRoom && currentStep === "details" && (
                <BookingDetailsModal
                    room={selectedRoom}
                    rooms={bookingRooms}
                    addons={addons}
                    checkIn={dates.checkIn}
                    checkOut={dates.checkOut}
                    adults={guests.adults}
                    children={guests.children}
                    customer={customer}
                    onContinue={handleContinueToCheckout}
                    onBack={() => setCurrentStep("addons")}
                    onClose={closeBookingFlow}
                />
            )}

            {selectedRoom && currentStep === "checkout" && !booking && (
                <Checkout
                    room={selectedRoom}
                    rooms={bookingRooms}
                    checkIn={dates.checkIn}
                    checkOut={dates.checkOut}
                    nights={nights}
                    adults={guests.adults}
                    children={guests.children}
                    addons={addons}
                    customer={customer}
                    onBack={() => setCurrentStep("details")}
                    onConfirm={handleConfirmBooking}
                    loading={loading}
                />
            )}

            {error && selectedRoom && currentStep && (
                <div
                    className="fixed bottom-4 left-4 right-4 z-[200] mx-auto max-w-xl rounded-xl border p-4 text-sm shadow-lg"
                    style={{
                        borderColor: "#b91c1c55",
                        color: "#b91c1c",
                        backgroundColor: "#fff5f5",
                    }}
                    role="alert"
                >
                    {error}
                </div>
            )}

            {booking && (
                <BookingConfirmation
                    booking={booking}
                    onClose={startNewBooking}
                    onNewBooking={startNewBooking}
                />
            )}
        </main>
    );
}