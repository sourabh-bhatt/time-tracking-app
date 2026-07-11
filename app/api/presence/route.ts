import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPresenceSummaries, normalizeUserId } from "../../../lib/s3-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const cookieStore = await cookies();
    const isAdmin = cookieStore.has("admin_session");
    const isSourabh = cookieStore.has("sourabh_session");
    const isPrayash = cookieStore.has("prayash_session");

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
