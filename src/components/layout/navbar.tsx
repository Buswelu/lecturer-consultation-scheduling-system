"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "./notification-dropdown";
import { UserMenu } from "./user-menu";
import { usePgCurrentUser } from "@/lib/auth/client";

interface NavbarProps {
  role: "student" | "lecturer" | "admin";
  onMenuClick: () => void;
}

interface RealUser {
  name: string;
  email: string;
  identifier: string;
  roleLabel: string;
  userId: string;
}

function roleLabel(role: string): string {
  if (role === "student") return "Student";
  if (role === "lecturer") return "Lecturer";
  if (role === "admin") return "Administrator";
  return role;
}

export function Navbar({ role, onMenuClick }: NavbarProps) {
  const { user, loading } = usePgCurrentUser();

  // Real PostgreSQL-authenticated user. While the session is being resolved,
  // show a neutral placeholder (never another person's name).
  const realUser: RealUser | null = user
    ? {
        name: user.fullName,
        email: user.email,
        identifier: user.username,
        roleLabel: roleLabel(user.role),
        userId: user.id,
      }
    : null;

  const display = realUser ?? {
    name: loading ? "…" : "Account",
    email: "",
    roleLabel: roleLabel(role),
  };

  const profileUrl = `/${role}/profile`;
  const settingsUrl = `/${role}/settings`;
  const notificationsUrl = `/${role}/notifications`;
  // Use the real profile id when known so no other user's notifications
  // can leak through; otherwise the dropdown stays empty.
  const userId = realUser?.userId ?? "";

  return (
    <header className="flex h-16 items-center justify-between border-b px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href={`/${role}/dashboard`} className="text-sm font-medium lg:hidden">
          ConsultConnect
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <NotificationDropdown userId={userId} notificationsUrl={notificationsUrl} />
        <UserMenu
          name={display.name}
          email={display.email}
          role={display.roleLabel}
          identifier={realUser?.identifier}
          profileUrl={profileUrl}
          settingsUrl={settingsUrl}
        />
      </div>
    </header>
  );
}
