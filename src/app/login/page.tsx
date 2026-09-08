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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  dashboardPathForRole,
  ensureUserProfile,
  getCurrentProfile,
  getSessionUserId,
  isPathForRole,
  isSafeNextPath,
  mapSignInError,
  signIn,
} from "@/lib/supabase/auth";
import type { DbRole } from "@/lib/supabase/database.types";
import type { UserRole } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  remember: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

function resolveTarget(role: DbRole, next: string | null): string {
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
  const [configured] = useState(() => isSupabaseConfigured());
  const [error, setError] = useState<string | null>(
    urlError === "expired"
      ? "That link has expired. Please request a new one."
      : urlError
        ? "That link is invalid. Please try again."
        : null,
  );
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  // Already signed in → bounce to the role dashboard (or safe `next`).
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    getSessionUserId()
      .then(async (id) => {
        if (!id || cancelled) return;
        const profile = await getCurrentProfile();
        if (!profile || cancelled) return;
        router.replace(resolveTarget(profile.role, next));
      })
      .catch(() => {
        // No usable session — stay on the login form.
      });
    return () => {
      cancelled = true;
    };
  }, [configured, router, next]);

  const onSubmit = async (values: LoginValues) => {
    setLoading(true);
    setError(null);

    if (!configured) {
      // Legacy mock preview (no Supabase configured): route by email hint.
      const demoEmail = values.email.toLowerCase();
      await new Promise((r) => setTimeout(r, 800));
      if (demoEmail.includes("sarah") || demoEmail.includes("lec")) {
        router.push("/lecturer/dashboard");
        return;
      }
      if (demoEmail.includes("admin")) {
        router.push("/admin/dashboard");
        return;
      }
      router.push("/student/dashboard");
      return;
    }

    try {
      const session = await signIn({
        email: values.email,
        password: values.password,
      });
      const profile = await ensureUserProfile({
        userId: session.userId,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
      });
      router.push(resolveTarget(profile.role, next));
      router.refresh();
    } catch (e) {
      setLoading(false);
      setError(mapSignInError(e instanceof Error ? e.message : ""));
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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@university.edu"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
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
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>

      {!configured && (
        <div className="pt-2">
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Demo: Select a role to preview the interface
          </p>
          <Select onValueChange={(r: UserRole) => {
            if (r === "student") router.push("/student/dashboard");
            if (r === "lecturer") router.push("/lecturer/dashboard");
            if (r === "admin") router.push("/admin/dashboard");
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Demo login as..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student (John Mensah)</SelectItem>
              <SelectItem value="lecturer">Lecturer (Dr. Sarah Smith)</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
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
