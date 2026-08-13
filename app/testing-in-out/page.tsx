"use client";

import { FormEvent, useEffect, useState } from "react";

export default function TestingInOutPage() {
    const [authenticated, setAuthenticated] = useState<boolean | null>(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [onCall, setOnCall] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const loadStatus = async () => {
        const response = await fetch("/api/testing-in-out", { cache: "no-store" });
        if (response.status === 401) {
            setAuthenticated(false);
            return;
        }
        if (!response.ok) throw new Error("Unable to load tracker status");

        const data = await response.json();
        setEnabled(Boolean(data.enabled));
        setOnCall(Boolean(data.onCall));
        setAuthenticated(true);
    };

    useEffect(() => {
        loadStatus().catch(() => {
            setError("Unable to connect. Please try again.");
            setAuthenticated(false);
        });
    }, []);

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError("");

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                setError(data.message || "Invalid credentials");
                return;
            }

            await loadStatus();
            setPassword("");
        } catch {
            setError("Unable to sign in. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    const handleToggle = async () => {
        const nextEnabled = !enabled;
        setBusy(true);
        setError("");

        try {
            const response = await fetch("/api/testing-in-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: nextEnabled }),
            });
            if (!response.ok) throw new Error("Unable to update tracker status");

            const data = await response.json();
            setEnabled(Boolean(data.enabled));
            setOnCall(Boolean(data.onCall));
        } catch {
            setError("Unable to update the tracker. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    const handleCallToggle = async () => {
        setBusy(true);
        setError("");

        try {
            const response = await fetch("/api/testing-in-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ onCall: !onCall }),
            });
            if (!response.ok) throw new Error("Unable to update call mode");

            const data = await response.json();
            setEnabled(Boolean(data.enabled));
            setOnCall(Boolean(data.onCall));
        } catch {
            setError("Unable to update call mode. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="min-h-screen bg-[#121212] px-4 py-8 text-gray-200">
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
                <section className="w-full rounded-2xl border border-[#333] bg-[#1e1e1e] p-6 shadow-2xl sm:p-8">
                    <div className="mb-8 text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#14a800] text-xl font-bold text-white">S</div>
                        <h1 className="text-2xl font-bold text-white">Sourabh Tracker</h1>
                        <p className="mt-2 text-sm text-gray-400">Control your login status</p>
                    </div>

                    {authenticated === null ? (
                        <p className="text-center text-sm text-gray-400">Loading…</p>
                    ) : authenticated ? (
                        <div className="space-y-6">
                            <div className={`rounded-xl border p-5 text-center ${enabled ? "border-[#14a800] bg-[#132312]" : "border-[#444] bg-[#252525]"}`}>
                                <div className={`mx-auto mb-3 h-3 w-3 rounded-full ${enabled ? "bg-[#14a800] shadow-[0_0_12px_rgba(20,168,0,0.75)]" : "bg-gray-500"}`} />
                                <div className="text-xl font-semibold text-white">{enabled ? "Tracker On" : "Tracker Off"}</div>
                                <p className="mt-2 text-sm text-gray-400">
                                    {enabled ? "Your login status is visible to the admin." : "You are shown as offline unless the desktop tracker is running."}
                                </p>
                            </div>

                            <button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={handleToggle} className={`flex w-full items-center justify-between rounded-xl px-5 py-4 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${enabled ? "bg-[#b42318] hover:bg-[#912018]" : "bg-[#14a800] hover:bg-[#108a00]"}`}>
                                <span>{busy ? "Updating…" : enabled ? "Turn Tracker Off" : "Turn Tracker On"}</span>
                                <span className={`relative h-7 w-12 rounded-full ${enabled ? "bg-white/30" : "bg-black/25"}`}>
                                    <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                                </span>
                            </button>

                            <button type="button" role="switch" aria-label="Call mode" aria-checked={onCall} disabled={busy || !enabled} onClick={handleCallToggle} className={`flex w-full items-center justify-between rounded-xl border px-5 py-4 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${onCall ? "border-[#a855f7] bg-[#6b21a8] hover:bg-[#581c87]" : "border-[#4b3a5f] bg-[#2a2233] hover:bg-[#362841]"}`}>
                                <span>{busy ? "Updatingâ€¦" : onCall ? "Turn Call Mode Off" : "Turn Call Mode On"}</span>
                                <span className={`relative h-7 w-12 rounded-full ${onCall ? "bg-white/30" : "bg-black/25"}`}>
                                    <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white transition-transform ${onCall ? "translate-x-6" : "translate-x-1"}`} />
                                </span>
                            </button>
                            {!enabled ? <p className="-mt-3 text-center text-xs text-gray-500">Turn the tracker on to use call mode.</p> : null}
                        </div>
                    ) : (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label htmlFor="username" className="mb-2 block text-sm font-medium text-gray-300">Username</label>
                                <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required className="w-full rounded-lg border border-[#444] bg-[#2a2a2a] px-4 py-3 text-white outline-none focus:border-[#14a800]" placeholder="Enter username" />
                            </div>
                            <div>
                                <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-300">Password</label>
                                <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="w-full rounded-lg border border-[#444] bg-[#2a2a2a] px-4 py-3 text-white outline-none focus:border-[#14a800]" placeholder="Enter password" />
                            </div>
                            <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#14a800] py-3 font-semibold text-white hover:bg-[#108a00] disabled:cursor-not-allowed disabled:opacity-60">
                                {busy ? "Signing in…" : "Sign In"}
                            </button>
                        </form>
                    )}

                    {error ? <div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">{error}</div> : null}
                    <p className="mt-6 text-center text-xs leading-5 text-gray-500">This control does not record time or take screenshots.</p>
                </section>
            </div>
        </main>
    );
}
