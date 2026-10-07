"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/auth/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PgAuthClientError, pgRegister } from "@/lib/auth/client";
import type { UserRole } from "@/lib/types";

const registerSchema = z
  .object({
    fullName: z.string().min(3, "Please enter your full name"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Please confirm your password"),
    role: z.enum(["student", "lecturer"], {
      message: "Please select a role",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [registeredUsername, setRegisteredUsername] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "student",
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Server-side PostgreSQL registration (independent rate limiter runs
      // first). The role allow-list is enforced server-side — the form only
      // offers student/lecturer and the backend coerces anything else.
      const result = await pgRegister({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        role: values.role,
      });
      setLoading(false);
      if (result.needsVerification) {
        setRegisteredEmail(values.email);
        setRegisteredUsername(result.username);
        setConfirmationSent(true);
        return;
      }
      router.push("/login");
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof PgAuthClientError
          ? err.message
          : "Unable to create your account. Please try again.",
      );
    }
  };

  if (confirmationSent) {
    return (
      <AuthLayout
        title="Check your email"
        description="Confirm your account to finish signing up"
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="mt-4 font-semibold">Confirmation email sent</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please check your email{registeredEmail ? ` (${registeredEmail})` : ""} to
            confirm your account, then sign in.
          </p>
          {registeredUsername && (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
              Your registration number:{" "}
              <span className="font-semibold">{registeredUsername}</span>
              <br />
              <span className="text-muted-foreground">
                Use it (or your email) to sign in.
              </span>
            </p>
          )}
          <Button variant="outline" className="mt-6 w-full" asChild>
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      description="Sign up to get started with consultation scheduling"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            placeholder="John Mensah"
            autoComplete="name"
            {...register("fullName")}
          />
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </div>

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
          <Label htmlFor="role">I am a...</Label>
          <Select
            value={watch("role")}
            onValueChange={(v: UserRole) => setValue("role", v as "student" | "lecturer")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select your role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="lecturer">Lecturer</SelectItem>
            </SelectContent>
          </Select>
          {errors.role && (
            <p className="text-sm text-destructive">{errors.role.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            placeholder="Enter a password"
            autoComplete="new-password"
            {...register("password")}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="Confirm your password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
