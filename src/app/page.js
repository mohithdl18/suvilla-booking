import Link from "next/link";

export const metadata = {
    title: "SU VILLA | Luxury Stay",
    description:
        "Discover SU VILLA and plan your next relaxing getaway.",
};

export default function HomePage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-[#F7FAEE] px-6 text-center text-[#052a50]">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-[#b38a2e]">
                Welcome to
            </p>

            <h1 className="text-5xl font-semibold tracking-wide sm:text-7xl">
                SU VILLA
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 opacity-75 sm:text-lg">
                Your peaceful getaway awaits. Explore your stay, choose your
                dates, and reserve your experience with us.
            </p>

            <Link
                href="/bookings"
                className="mt-10 inline-flex items-center justify-center rounded-full bg-[#052a50] px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#0b416f]"
            >
                Book Your Stay
                <span className="ml-3" aria-hidden="true">
                    →
                </span>
            </Link>

            <p className="mt-16 text-xs tracking-wide opacity-50">
                A stay worth slowing down for.
            </p>
        </main>
    );
}