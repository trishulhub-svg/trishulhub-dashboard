import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAppSetting, setAppSetting } from "@/lib/db";

const PREF_KEY = (userId: string) => `user_pref:${userId}`;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await getAppSetting(PREF_KEY(session.user.id));
    let preferences: Record<string, unknown> = {};
    if (raw) {
      try { preferences = JSON.parse(raw); } catch { preferences = {}; }
    }

    return Response.json({ success: true, preferences });
  } catch (error) {
    console.error("[user-preferences] GET error:", error);
    return Response.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const preferences = body?.preferences;

    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
      return Response.json({ error: "Invalid preferences format" }, { status: 400 });
    }

    await setAppSetting(PREF_KEY(session.user.id), JSON.stringify(preferences));

    return Response.json({ success: true });
  } catch (error) {
    console.error("[user-preferences] PUT error:", error);
    return Response.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}