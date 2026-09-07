"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import type { UserRole } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  remember: z.boolean().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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

  const onSubmit = async (values: LoginValues) => {
    setLoading(true);
    setError(null);

    // Demo mock login - forward to role demo selection
    // In production, this will be Supabase Auth
    const demoEmail = values.email.toLowerCase();
    if (demoEmail.includes("@university.edu") || demoEmail.includes("schoolemail.edu")) {
      if (demoEmail.includes("sarah") || demoEmail.includes("lec")) {
        await new Promise((r) => setTimeout(r, 800));
        router.push("/lecturer/dashboard");
        return;
      }
      if (demoEmail.includes("admin")) {
        await new Promise((r) => setTimeout(r, 800));
        router.push("/admin/dashboard");
        return;
      }
      await new Promise((r) => setTimeout(r, 800));
      router.push("/student/dashboard");
      return;
    }

    setLoading(false);
    setError(
      "No account found for this email. Try john.mensah@schoolemail.edu or creates an account.",
    );
  };

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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
      </form>
    </AuthLayout>
  );
}
