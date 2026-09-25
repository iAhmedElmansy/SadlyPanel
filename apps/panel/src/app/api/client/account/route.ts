import { NextResponse } from "next/server";
import { authenticateApiKey, hasScope, ApiKeyError } from "@/lib/auth/api-key";

export const dynamic = "force-dynamic";

/**
 * GET /api/client/account
 *
 * Authenticated via `Authorization: Bearer <identifier>.<secret>` (API key).
 * Requires the `account:read` scope. Returns the caller's basic profile.
 */
export async function GET(request: Request) {
  try {
    const ctx = await authenticateApiKey(request);
    if (!hasScope(ctx, "account:read")) {
      return NextResponse.json({ error: "Missing required scope: account:read." }, { status: 403 });
    }

    const { user } = ctx;
    return NextResponse.json(
      {
        id: user.id,
        uuid: user.uuid,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        rootAdmin: user.rootAdmin,
        totpEnabled: user.totpEnabled,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ApiKeyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
