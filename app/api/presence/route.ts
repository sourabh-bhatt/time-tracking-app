import { NextResponse } from "next/server";
import { getSessionContext } from "../../../lib/auth";
import { getPresenceSummaries, normalizeUserId } from "../../../lib/s3-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const session = await getSessionContext();
    const isAdmin = session?.role === 'admin';
    const isSourabh = session?.userId === 'sourabh';
    const isPrayash = session?.userId === 'prayash';

    if (!isAdmin && !isSourabh && !isPrayash) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const allowedUsers = isAdmin ? ["sourabh", "prayash"] : (isSourabh ? ["sourabh"] : ["prayash"]);
    const { searchParams } = new URL(request.url);
    const requestedUsers = (searchParams.get("users") || "")
        .split(",")
        .map((user) => normalizeUserId(user))
        .filter(Boolean);

    const users = requestedUsers.length > 0
        ? requestedUsers.filter((user) => allowedUsers.includes(user))
        : allowedUsers;

    const presence = await getPresenceSummaries(users);

    return NextResponse.json({
        timeZone: presence[0]?.timeZone || "America/New_York",
        timeZoneLabel: presence[0]?.timeZoneLabel || "Eastern Time",
        presence,
    });
}
