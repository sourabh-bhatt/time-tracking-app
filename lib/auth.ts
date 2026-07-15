import { cookies } from "next/headers";

export type SessionContext = { role: "admin"; userId: null } | { role: "employee"; userId: string } | null;

export async function getSessionContext(): Promise<SessionContext> {
    const store = await cookies();
    if (store.has("admin_session")) return { role: "admin", userId: null };
    if (store.has("sourabh_session")) return { role: "employee", userId: "sourabh" };
    if (store.has("prayash_session")) return { role: "employee", userId: "prayash" };
    return null;
}

export function canAccessUser(session: SessionContext, userId: string) {
    return Boolean(session && (session.role === "admin" || session.userId === userId.toLowerCase()));
}
