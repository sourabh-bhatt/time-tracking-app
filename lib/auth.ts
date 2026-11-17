import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import type { SessionContext } from "./session";

export type { SessionContext } from "./session";

export async function getSessionContext(): Promise<SessionContext> {
    const store = await cookies();
    return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function canAccessUser(session: SessionContext, userId: string) {
    return Boolean(session && (session.role === "admin" || session.userId === userId.toLowerCase()));
}
