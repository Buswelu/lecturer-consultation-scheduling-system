import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /auth/confirm?token_hash=…&type=…&next=…
 *
 * Target of Supabase Auth email links (signup confirmation, password
 * recovery). Exchanges the one-time token for a session, then redirects to
 * the validated `next` path. Public by design — the token IS the credential.
 */
function safeNext(raw: string | null, fallback: string): string {
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("\\")
  ) {
    return raw;
  }
  return fallback;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const fallback =
    type === "recovery" ? "/reset-password" : "/login?confirmed=1";
  const next = safeNext(url.searchParams.get("next"), fallback);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", siteUrl),
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Route Handler context always allows setting cookies; ignore.
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({
    type: type as "signup" | "recovery" | "invite" | "magiclink" | "email_change",
    token_hash: tokenHash,
  });

  if (error) {
    const dest =
      type === "recovery" ? "/forgot-password?error=expired" : "/login?error=expired";
    return NextResponse.redirect(new URL(dest, siteUrl));
  }

  return NextResponse.redirect(new URL(next, siteUrl));
}
