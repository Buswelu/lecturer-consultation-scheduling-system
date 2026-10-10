"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";

/**
 * /verify-email — target of verification links (`?token=…`).
 * Consumes the single-use token server-side, then shows the outcome.
 * The token itself is only ever sent to POST /api/pg-auth/verify-email.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <p className="text-center text-sm text-muted-foreground">Loading...</p>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<"checking" | "done" | "failed">(
    token ? "checking" : "failed",
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/pg-auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (!cancelled) setState(res.ok ? "done" : "failed");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout
      title="Email verification"
      description={
        state === "done"
          ? "Your email has been verified"
          : "Confirm your email address"
      }
      footer={
        <>
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        </>
      }
    >
      {state === "checking" && (
        <p className="text-center text-sm text-muted-foreground">
          Verifying your email...
        </p>
      )}
      {state === "done" && (
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            You can now sign in with your account.
          </p>
          <Button className="mt-6 w-full" asChild>
            <Link href="/login?confirmed=1">Sign in</Link>
          </Button>
        </div>
      )}
      {state === "failed" && (
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-7 w-7 text-destructive" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            This verification link is invalid or has expired.
          </p>
          <Button variant="outline" className="mt-6 w-full" asChild>
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
