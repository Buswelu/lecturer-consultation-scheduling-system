"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/supabase/auth";

interface UserMenuProps {
  name: string;
  email: string;
  role: string;
  photoUrl?: string;
  profileUrl: string;
  settingsUrl: string;
}

export function UserMenu({ name, email, role, photoUrl, profileUrl, settingsUrl }: UserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async (e: Event) => {
    e.preventDefault();
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // Proceed to login even if sign-out fails (e.g. session already gone).
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="User menu">
          <Avatar src={photoUrl} alt={name} fallback={name} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs font-normal text-muted-foreground">{email}</p>
            <p className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
              {role}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileUrl}>
            <User className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={settingsUrl}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="text-destructive focus:text-destructive"
          disabled={signingOut}
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Logging out..." : "Logout"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
