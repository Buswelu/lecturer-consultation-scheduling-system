"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "./notification-dropdown";
import { UserMenu } from "./user-menu";
import { getCurrentProfile } from "@/lib/supabase/auth";

interface NavbarProps {
  role: "student" | "lecturer" | "admin";
  onMenuClick: () => void;
}

interface RealUser {
  name: string;
  email: string;
  roleLabel: string;
  photoUrl?: string;
  userId: string;
}

function roleLabel(role: string): string {
  if (role === "student") return "Student";
  if (role === "lecturer") return "Lecturer";
  if (role === "admin") return "Administrator";
  return role;
}

export function Navbar({ role, onMenuClick }: NavbarProps) {
  const [realUser, setRealUser] = useState<RealUser | null>(null);

  // Prefer the real authenticated profile; fall back to demo labels when
  // Supabase is unconfigured or no session exists (mock preview mode).
  useEffect(() => {
    let cancelled = false;
    getCurrentProfile()
      .then((profile) => {
        if (!profile || cancelled) return;
        setRealUser({
          name: profile.full_name,
          email: profile.email ?? "",
          roleLabel: roleLabel(profile.role),
          photoUrl: profile.avatar_url ?? undefined,
          userId: profile.id,
        });
      })
      .catch(() => {
        // Keep the fallback labels.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallback = {
    name: role === "student" ? "John Mensah" : role === "lecturer" ? "Dr. Sarah Smith" : "System Admin",
    email: role === "student" ? "john.mensah@schoolemail.edu" : role === "lecturer" ? "sarah.smith@university.edu" : "admin@university.edu",
    roleLabel: roleLabel(role),
  };

  const user = realUser ?? fallback;

  const profileUrl = `/${role}/profile`;
  const settingsUrl = `/${role}/settings`;
  const notificationsUrl = `/${role}/notifications`;
  // Notification data is still mock-backed (later phase); use the real
  // profile id when known so no other user's items can leak through.
  const userId = realUser?.userId
    ?? (role === "student" ? "stud-1" : role === "lecturer" ? "lec-1" : "admin-1");

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
          name={user.name}
          email={user.email}
          role={user.roleLabel}
          photoUrl={realUser?.photoUrl}
          profileUrl={profileUrl}
          settingsUrl={settingsUrl}
        />
      </div>
    </header>
  );
}
