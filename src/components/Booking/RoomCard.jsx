"use client";

import { useMemo, useState } from "react";
import { calculateRoomPrice } from "@/logic/pricing";
import pricingConfig from "@/data/pricing.json";
import { canRoomAccommodate } from "@/logic/bookingFlow";

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

function getAmenities(room) {
    const allAmenities = [
        ...(Array.isArray(room?.features) ? room.features : []),
        ...(Array.isArray(room?.bathroom) ? room.bathroom : []),
        ...(Array.isArray(room?.tech) ? room.tech : []),
        ...(Array.isArray(room?.amenities) ? room.amenities : []),
    ];

    return [...new Set(allAmenities.filter(Boolean))];
}

function RoomImageCarousel({ room }) {
    const images = useMemo(() => {
        const roomImages = Array.isArray(room?.images)
            ? room.images.filter(Boolean)
            : [];

        return [
            ...new Set([
                ...(room?.heroImage ? [room.heroImage] : []),
                ...(room?.image ? [room.image] : []),
                ...roomImages,
            ]),
        ];
    }, [room]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const currentImage = images[currentIndex];

    function showPrevious(event) {
        event.stopPropagation();

        setCurrentIndex((index) =>
            index === 0 ? images.length - 1 : index - 1
        );
    }

    function showNext(event) {
        event.stopPropagation();

        setCurrentIndex((index) =>
            index === images.length - 1 ? 0 : index + 1
        );
    }

    return (
        <div
            className="relative w-full overflow-hidden bg-black/5"
            style={{ aspectRatio: "4 / 3" }}
        >
            {currentImage ? (
                <img
                    key={currentImage}
                    src={currentImage}
                    alt={`${room?.name || "Room"} image ${currentIndex + 1}`}
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60">
                    Room image
                </div>
            )}

            {images.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={showPrevious}
                        aria-label="Previous room image"
                        className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl shadow-md transition hover:bg-white"
                    >
                        &#8249;
                    </button>

                    <button
                        type="button"
                        onClick={showNext}
                        aria-label="Next room image"
                        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xl shadow-md transition hover:bg-white"
                    >
                        &#8250;
                    </button>

                    <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
                        {images.map((image, index) => (
                            <button
                                key={image}
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setCurrentIndex(index);
                                }}
                                aria-label={`Show image ${index + 1} of ${images.length}`}
                                aria-current={
                                    index === currentIndex ? "true" : undefined
                                }
                                className={`h-2 rounded-full border border-white/80 transition-all ${
                                    index === currentIndex
                                        ? "w-5 bg-white"
                                        : "w-2 bg-white/50 hover:bg-white/80"
                                }`}
                            />
                        ))}
                    </div>

                    <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
                        {currentIndex + 1} / {images.length}
                    </span>
                </>
            )}
        </div>
    );
}

function calculateAllocationPrice({
    checkIn,
    checkOut,
    nights,
    guests,
}) {
    const emptyPricing = {
        baseRoomTotal: 0,
        extraAdultTotal: 0,
        childTotal: 0,
        roomTotal: 0,
        nightlyAverage: 0,
    };

    if (
        !checkIn ||
        !checkOut ||
        checkOut <= checkIn ||
        !guests
    ) {
        return emptyPricing;
    }

    try {
        const basePricing = calculateRoomPrice(checkIn, checkOut);
        const validNights = Math.max(0, Number(nights) || 0);

        const adults = Math.max(0, Number(guests.adults) || 0);
        const children = Math.max(0, Number(guests.children) || 0);
        const includedGuests = Number(pricingConfig.includedGuests) || 2;

        // The base rate includes the configured number of guests.
        // Children are charged separately according to pricing.json.
        const extraAdults = Math.max(0, adults - includedGuests);

        const baseRoomTotal = Number(basePricing.roomTotal) || 0;

        const extraAdultTotal =
            extraAdults *
            (Number(pricingConfig.extraAdult?.price) || 0) *
            validNights;

        const childTotal =
            children *
            (Number(pricingConfig.child?.price) || 0) *
            validNights;

        const roomTotal =
            baseRoomTotal + extraAdultTotal + childTotal;

        return {
            baseRoomTotal,
            extraAdultTotal,
            childTotal,
            roomTotal,
            nightlyAverage:
                validNights > 0
                    ? Math.round(roomTotal / validNights)
                    : 0,
        };
    } catch (error) {
        console.error("Room pricing calculation failed:", error);
        return emptyPricing;
    }
}

export default function RoomCard({
    room,
    checkIn,
    checkOut,
    nights = 1,
    adults = 2,
    children = 0,
    available = true,
    isSelected = false,
    selectionMode = false,
    guestAllocations = [],
    selectedAllocationId = null,
    selectedAllocationIds = [],
    onSelectRoom,
}) {
    const amenities = useMemo(() => getAmenities(room), [room]);

    const allocations = useMemo(() => {
        if (Array.isArray(guestAllocations) && guestAllocations.length > 0) {
            return guestAllocations;
        }

        return [
            {
                id: "1",
                adults,
                children,
            },
        ];
    }, [guestAllocations, adults, children]);

    const allocationOptions = useMemo(
        () =>
            allocations
                .map((guests, index) => {
                    const allocationId = String(guests.id ?? index + 1);
                    const compatible = canRoomAccommodate(room, guests);

                    const pricing = calculateAllocationPrice({
                        checkIn,
                        checkOut,
                        nights,
                        guests,
                    });

                    const assignedElsewhere =
                        selectedAllocationIds.some(
                            (id) =>
                                String(id) === allocationId &&
                                allocationId !==
                                    String(selectedAllocationId ?? "")
                        );

                    const selected =
                        String(selectedAllocationId ?? "") ===
                        allocationId;

                    return {
                        guests,
                        allocationId,
                        label: `Room ${index + 1}`,
                        compatible,
                        pricing,
                        assignedElsewhere,
                        selected,
                    };
                })
                .filter((option) => option.compatible),
        [
            allocations,
            room,
            checkIn,
            checkOut,
            nights,
            selectedAllocationId,
            selectedAllocationIds,
        ]
    );

    function handleAllocationSelect(option) {
        if (!available || !option.compatible) return;

        if (option.assignedElsewhere) return;

        onSelectRoom?.(room, option.guests);
    }

    return (
        <article
            className={`grid overflow-hidden rounded-2xl border bg-white/60 shadow-sm transition hover:shadow-md md:grid-cols-10 ${
                isSelected ? "ring-2 ring-offset-2" : ""
            }`}
            style={{
                borderColor: isSelected
                    ? COLORS.foreground
                    : `${COLORS.foreground}18`,
                "--tw-ring-color": COLORS.foreground,
            }}
        >
            {/* Left column: room images and title */}
<div className="flex h-[420px] flex-col md:col-span-3">
    <RoomImageCarousel room={room} />

    <div className="flex flex-1 flex-col justify-center px-5 py-5">
        <h3 className="text-lg font-semibold leading-snug">
            {room.name}
        </h3>

        {room.tagline && (
            <p className="mt-1 text-sm opacity-65">
                {room.tagline}
            </p>
        )}
    </div>
</div>

{/* Middle column: amenities */}
<div
    className="flex h-[420px] flex-col justify-center overflow-y-auto p-5 md:col-span-4 md:border-l md:p-6"
    style={{ borderColor: `${COLORS.foreground}18` }}
>
    <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
        Amenities
    </p>

    {amenities.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
            {amenities.map((amenity) => (
                <li
                    key={amenity}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{
                        backgroundColor: `${COLORS.foreground}09`,
                    }}
                >
                    {amenity}
                </li>
            ))}
        </ul>
    ) : (
        <p className="mt-3 text-sm opacity-60">
            Contact us for room amenities.
        </p>
    )}
</div>

            {/* Right column: allocation-specific pricing and buttons */}
            <div
                className="flex flex-col justify-center gap-5 border-t p-5 md:col-span-3 md:border-l md:border-t-0 md:p-6"
                style={{ borderColor: `${COLORS.foreground}18` }}
            >
                {/* <p className="text-xs opacity-60">
                    {nights} {nights === 1 ? "night" : "nights"}
                </p> */}

                {allocationOptions.length === 0 ? (
                    <p className="text-sm opacity-60">
                        This room cannot accommodate the selected guest groups.
                    </p>
                ) : (
                    allocationOptions.map((option) => {
                        const { guests, pricing } = option;

                        const buttonLabel = !available
                            ? "Unavailable"
                            : option.assignedElsewhere
                              ? "Already assigned"
                              : option.selected
                                ? "Remove Selection"
                                : "Select Room";

                        return (
                            <div
                                key={option.allocationId}
                                className="border-t pt-4 first:border-t-0 first:pt-0"
                                style={{
                                    borderColor: `${COLORS.foreground}18`,
                                }}
                            >
                                <p className="text-sm font-semibold">
                                    {option.label}
                                </p>

                                <p className="mt-1 text-xs opacity-65">
                                    {guests.adults}{" "}
                                    {guests.adults === 1 ? "adult" : "adults"}
                                    {" + "}
                                    {guests.children}{" "}
                                    {guests.children === 1
                                        ? "child"
                                        : "children"}
                                </p>

                                <p className="mt-2 text-2xl font-bold">
                                    {formatINR(pricing.roomTotal)}
                                </p>

                                <p className="mt-1 text-xs opacity-60">
                                    {formatINR(pricing.nightlyAverage)} average per night
                                </p>

                                {(pricing.extraAdultTotal > 0 ||
                                    pricing.childTotal > 0) && (
                                    <div className="mt-3 space-y-2 border-t pt-3 text-sm"
                                        style={{
                                            borderColor: `${COLORS.foreground}18`,
                                        }}
                                    >
                                        <div className="flex justify-between gap-3">
                                            <span className="opacity-65">
                                                Base room price
                                            </span>
                                            <span>
                                                {formatINR(pricing.baseRoomTotal)}
                                            </span>
                                        </div>

                                        {pricing.extraAdultTotal > 0 && (
                                            <div className="flex justify-between gap-3">
                                                <span className="opacity-65">
                                                    Extra adult(s)
                                                </span>
                                                <span>
                                                    +{formatINR(pricing.extraAdultTotal)}
                                                </span>
                                            </div>
                                        )}

                                        {pricing.childTotal > 0 && (
                                            <div className="flex justify-between gap-3">
                                                <span className="opacity-65">
                                                    Child charge(s)
                                                </span>
                                                <span>
                                                    +{formatINR(pricing.childTotal)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <p className="mt-3 text-xs leading-relaxed opacity-60">
                                    Including breakfast. Excludes checkout fees and add-ons.
                                </p>

                                <button
                                    type="button"
                                    disabled={
                                        !available ||
                                        !option.compatible ||
                                        option.assignedElsewhere
                                    }
                                    aria-pressed={option.selected}
                                    onClick={() => handleAllocationSelect(option)}
                                    className="mt-4 w-full rounded-xl border px-5 py-3.5 text-sm font-bold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
                                    style={{
                                        backgroundColor: option.selected
                                            ? COLORS.foreground
                                            : COLORS.accent,
                                        color: option.selected
                                            ? COLORS.background
                                            : COLORS.foreground,
                                        borderColor: option.selected
                                            ? COLORS.foreground
                                            : "transparent",
                                    }}
                                >
                                    {buttonLabel}
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </article>
    );
}