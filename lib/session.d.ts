export type SessionContext = { role: 'admin'; userId: null } | { role: 'employee'; userId: string } | null;
export const SESSION_COOKIE: string;
export const SESSION_MAX_AGE: number;
export function createSessionToken(userId: string, now?: number): Promise<string>;
export function verifySessionToken(token: unknown, now?: number): Promise<SessionContext>;
