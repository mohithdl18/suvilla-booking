"use client";

import { useState } from "react";

const COLORS = {
    background: "#F7FAEE",
    foreground: "#052a50",
    accent: "#e4b441",
};

export default function AdminLoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        setError("");

        if (!username.trim() || !password) {
            setError("Please enter your username and password.");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch("/api/admin/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: username.trim(),
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.message || "Invalid username or password.");
                return;
            }

            window.location.href = "/admin";
        } catch {
            setError("Unable to connect. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main
            className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12"
            style={{
                backgroundColor: COLORS.background,
                color: COLORS.foreground,
            }}
        >
            {/* Decorative background */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
                style={{ backgroundColor: COLORS.accent }}
            />

            <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full opacity-10 blur-3xl"
                style={{ backgroundColor: COLORS.foreground }}
            />

            <section className="relative z-10 w-full max-w-md">
                {/* Brand */}
                <div className="mb-8 text-center">
                    <p
                        className="font-display text-5xl"
                        style={{ color: COLORS.foreground }}
                    >
                        SU VILLA
                    </p>

                    <div
                        className="mx-auto mt-4 h-px w-16"
                        style={{ backgroundColor: COLORS.accent }}
                    />

                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] opacity-60">
                        Administration Portal
                    </p>
                </div>

                {/* Login card */}
                <div
                    className="rounded-2xl border p-7 shadow-xl sm:p-9"
                    style={{
                        backgroundColor: "#FFFFFF",
                        borderColor: `${COLORS.foreground}15`,
                        boxShadow: "0 24px 70px rgba(5, 42, 80, 0.09)",
                    }}
                >
                    <div className="mb-7">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Welcome back
                        </h1>

                        <p className="mt-2 text-sm leading-6 opacity-65">
                            Sign in to manage your bookings and resort
                            operations.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Username */}
                        <div>
                            <label
                                htmlFor="username"
                                className="mb-2 block text-sm font-medium"
                            >
                                Username
                            </label>

                            <input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                value={username}
                                onChange={(event) =>
                                    setUsername(event.target.value)
                                }
                                placeholder="Enter your username"
                                required
                                disabled={loading}
                                className="h-12 w-full rounded-xl border px-4 text-sm outline-none transition focus:ring-2 disabled:opacity-60"
                                style={{
                                    backgroundColor: COLORS.background,
                                    borderColor: `${COLORS.foreground}20`,
                                    color: COLORS.foreground,
                                    "--tw-ring-color": `${COLORS.accent}90`,
                                }}
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label
                                    htmlFor="password"
                                    className="block text-sm font-medium"
                                >
                                    Password
                                </label>
                            </div>

                            <div className="relative">
                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    placeholder="Enter your password"
                                    required
                                    disabled={loading}
                                    className="h-12 w-full rounded-xl border px-4 pr-16 text-sm outline-none transition focus:ring-2 disabled:opacity-60"
                                    style={{
                                        backgroundColor: COLORS.background,
                                        borderColor: `${COLORS.foreground}20`,
                                        color: COLORS.foreground,
                                        "--tw-ring-color": `${COLORS.accent}90`,
                                    }}
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword((previous) => !previous)
                                    }
                                    disabled={loading}
                                    className="absolute inset-y-0 right-3 text-xs font-semibold opacity-65 transition hover:opacity-100"
                                    aria-label={
                                        showPassword
                                            ? "Hide password"
                                            : "Show password"
                                    }
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div
                                role="alert"
                                className="rounded-lg border px-3 py-3 text-sm"
                                style={{
                                    backgroundColor: "#FEF2F2",
                                    borderColor: "#FECACA",
                                    color: "#B42318",
                                }}
                            >
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                                backgroundColor: COLORS.accent,
                                color: COLORS.foreground,
                            }}
                        >
                            {loading ? (
                                <>
                                    <span
                                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                                        aria-hidden="true"
                                    />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign in
                                    <span aria-hidden="true">→</span>
                                </>
                            )}
                        </button>
                    </form>

                    <div
                        className="mt-7 border-t pt-5 text-center"
                        style={{ borderColor: `${COLORS.foreground}12` }}
                    >
                        <p className="text-xs opacity-50">
                            Restricted access · Authorized personnel only
                        </p>
                    </div>
                </div>

                <p className="mt-6 text-center text-xs opacity-50">
                    © {new Date().getFullYear()} SU VILLA. All rights reserved.
                </p>
            </section>
        </main>
    );
}