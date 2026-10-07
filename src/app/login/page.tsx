"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/auth/password-input";
import {
  dashboardPathForRole,
  isPathForRole,
  isSafeNextPath,
} from "@/lib/auth/routes";
import type { AuthRole } from "@/lib/auth/routes";
import { PgAuthClientError, getPgCurrentUser, pgLogin } from "@/lib/auth/client";
import { parseIdentifier } from "@/lib/auth/identifiers";

const loginSchema = z.object({
  username: z.string().min(3, "Enter your registration number or email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  remember: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

function resolveTarget(role: AuthRole, next: string | null): string {
  if (next && isSafeNextPath(next) && isPathForRole(next, role)) {
    return next;
  }
  return dashboardPathForRole(role);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const justConfirmed = searchParams.get("confirmed") === "1";
  const urlError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    urlError === "expired"
      ? "That link has expired. Please request a new one."
      : urlError
        ? "That link is invalid. Please try again."
        : null,
  );
  const [loading, setLoading] = useState(false);
  // Seconds until a rate-limited login may be retried (server-provided,
  // display-only — enforcement is server-side).
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  // Primary path is identifier login; email is the backup mechanism.
  const [useEmail, setUseEmail] = useState(false);

  // Countdown ticker for the rate-limit message.
  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) return;
    const timer = setTimeout(
      () => setRetryAfter((v) => (v !== null && v > 0 ? v - 1 : v)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [retryAfter]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      remember: false,
    },
  });
  const usernameValue = watch("username") ?? "";
  const identifierCheck = useEmail ? null : parseIdentifier(usernameValue);

  // Already signed in → bounce to the role dashboard (or safe `next`).
  // Runs for every visitor; redirects ONLY on a positively confirmed
  // session (never on loading/anonymous states).
  useEffect(() => {
    let cancelled = false;
    getPgCurrentUser()
      .then((user) => {
        if (!user || cancelled) return;
        router.replace(resolveTarget(user.role, next));
      })
      .catch(() => {
        // No usable session — stay on the login form.
      });
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  const onSubmit = async (values: LoginValues) => {
    // Prevent repeated rapid submissions (UX only — the server enforces).
    if (loading) return;
    setLoading(true);
    setError(null);
    setRetryAfter(null);

    try {
      // Server-side PostgreSQL login: rate limiting runs BEFORE password
      // verification. Generic messages only — the server never reveals
      // account existence. The server determines the real role; the client
      // only navigates.
      const { role } = await pgLogin({
        identifier: values.username,
        password: values.password,
      });
      router.push(resolveTarget(role, next));
      router.refresh();
    } catch (err) {
      setLoading(false);
      if (err instanceof PgAuthClientError && err.status === 429) {
        setError(err.message);
        if (typeof err.retryAfterSeconds === "number") {
          setRetryAfter(err.retryAfterSeconds);
        }
        return;
      }
      setError(
        err instanceof PgAuthClientError
          ? err.message
          : "We couldn't process your request right now.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {justConfirmed && !error && (
        <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Your email is confirmed. Please sign in.
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="username">
            {useEmail ? "Email" : "Registration Number / Staff Number"}
          </Label>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => {
              setUseEmail((v) => !v);
              setError(null);
            }}
          >
            {useEmail ? "Use registration number instead" : "Use email instead"}
          </button>
        </div>
        <Input
          id="username"
          type="text"
          placeholder={useEmail ? "you@university.edu" : "STU-2026-0001"}
          autoComplete="username"
          {...register("username")}
        />
        {errors.username && (
          <p className="text-sm text-destructive">{errors.username.message}</p>
        )}
        {!useEmail && usernameValue.length > 0 && (
          <p
            className={`text-xs ${identifierCheck?.valid ? "text-green-600" : "text-destructive"}`}
            role="status"
          >
            {identifierCheck?.valid
              ? `✓ Valid ${identifierCheck.category} format`
              : "✕ Expected STU-YYYY-NNNN, LEC-YYYY-NNNN or ADM-NNNN"}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="remember"
          checked={watch("remember")}
          onCheckedChange={(checked) => setValue("remember", Boolean(checked))}
        />
        <Label htmlFor="remember" className="text-sm font-normal">
          Remember me
        </Label>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
          {retryAfter !== null && retryAfter > 0 && (
            <span> Try again in {retryAfter}s.</span>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your account to continue"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <Suspense
        fallback={
          <p className="text-center text-sm text-muted-foreground">Loading...</p>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
