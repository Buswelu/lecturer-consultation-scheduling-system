"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PgAuthClientError, pgRequestPasswordReset } from "@/lib/auth/client";

const forgotSchema = z.object({
  username: z.string().min(3, "Enter your registration number or email"),
});

type ForgotValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { username: "" },
  });

  const onSubmit = async (values: ForgotValues) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      // Server-side PostgreSQL recovery: accepts a registration number
      // or an email; the server resolves the account's recovery email.
      // Independent rate limiter runs first; the response is generic
      // either way — never reveals account existence.
      await pgRequestPasswordReset(values.username);
      // Any other status (including errors) → generic success screen so
      // account existence is never revealed.
      setLoading(false);
      setSubmitted(true);
    } catch (err) {
      setLoading(false);
      if (err instanceof PgAuthClientError && err.status === 429) {
        setError("Too many requests. Please try again later.");
        return;
      }
      // Still show the generic success screen: do not reveal email existence.
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <AuthLayout
        title="Check your email"
        description="We&apos;ve sent password reset instructions"
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="mt-4 font-semibold">Reset link sent</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account matches, instructions were sent to its recovery
            email shortly.
          </p>
          <div className="mt-6 flex items-center gap-1 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <span>Check your inbox</span>
          </div>
          <Button variant="outline" className="mt-6 w-full" asChild>
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter your registration number or email"
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Registration Number or Email</Label>
          <Input
            id="username"
            type="text"
            placeholder="STU-2026-0001 or you@university.edu"
            autoComplete="username"
            {...register("username")}
          />
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthLayout>
  );
}
