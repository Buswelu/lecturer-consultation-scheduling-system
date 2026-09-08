"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import { getSupabase } from "@/lib/supabase/client";
import { updatePassword } from "@/lib/supabase/auth";

const resetSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

/**
 * /reset-password — target of Supabase recovery links (via /auth/confirm).
 * Requires the recovery session; otherwise shows an expired-link message.
 */
export default function ResetPasswordPage() {
  // The browser client auto-detects the recovery session from the URL
  // (code exchange via /auth/confirm, or legacy hash tokens).
  const [checking, setChecking] = useState(() => getSupabase() !== null);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // The browser client auto-detects the recovery session from the URL
  // (code exchange via /auth/confirm, or legacy hash tokens).
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setHasSession(Boolean(data.session?.user));
          setChecking(false);
        }
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (values: ResetValues) => {
    setLoading(true);
    setError(null);
    try {
      await updatePassword(values.password);
      setLoading(false);
      setDone(true);
    } catch {
      setLoading(false);
      setError("We couldn't update your password. The link may have expired.");
    }
  };

  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        description="Your password has been changed"
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            You can now sign in with your new password.
          </p>
          <Button className="mt-6 w-full" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      description="Enter and confirm your new password"
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        </>
      }
    >
      {checking ? (
        <p className="text-center text-sm text-muted-foreground">
          Verifying your reset link...
        </p>
      ) : !hasSession ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            This password reset link is invalid or has expired. Please request a
            new one.
          </p>
          <Button className="w-full" asChild>
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <PasswordInput
              id="password"
              placeholder="Enter a new password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput
              id="confirmPassword"
              placeholder="Confirm your new password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating..." : "Update password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
