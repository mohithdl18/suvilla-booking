"use client";

import { useState } from "react";

export default function LogoutButton() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleLogout() {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/admin/logout", {
                method: "POST",
            });

            if (!response.ok) {
                throw new Error("Unable to log out. Please try again.");
            }

            window.location.replace("/admin/login");
        } catch (err) {
            setError(err.message || "Something went wrong.");
            setLoading(false);
        }
    }

    return (
        <div>
            <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="rounded-xl border px-5 py-3 text-sm font-semibold transition hover:bg-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: "#052a50" }}
            >
                {loading ? "Signing out..." : "Sign out"}
            </button>

            {error && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                    {error}
                </p>
            )}
        </div>
    );
}