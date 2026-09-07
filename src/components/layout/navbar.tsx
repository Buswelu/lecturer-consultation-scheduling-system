"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "./notification-dropdown";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  role: "student" | "lecturer" | "admin";
  onMenuClick: () => void;
}

export function Navbar({ role, onMenuClick }: NavbarProps) {
  const user = {
    name: role === "student" ? "John Mensah" : role === "lecturer" ? "Dr. Sarah Smith" : "System Admin",
    email: role === "student" ? "john.mensah@schoolemail.edu" : role === "lecturer" ? "sarah.smith@university.edu" : "admin@university.edu",
    roleLabel: role === "student" ? "Student" : role === "lecturer" ? "Lecturer" : "Administrator",
  };

  const profileUrl = `/${role}/profile`;
  const settingsUrl = `/${role}/settings`;
  const notificationsUrl = `/${role}/notifications`;
  const userId = role === "student" ? "stud-1" : role === "lecturer" ? "lec-1" : "admin-1";

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
          profileUrl={profileUrl}
          settingsUrl={settingsUrl}
        />
      </div>
    </header>
  );
}
