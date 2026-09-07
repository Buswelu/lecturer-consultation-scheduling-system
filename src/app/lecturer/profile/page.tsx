"use client";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProfileForm } from "@/components/profile-form";

export default function LecturerProfilePage() {
  return (
    <div>
      <Breadcrumbs items={[{ label: "Profile" }]} />
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your professional information.
        </p>
        <div className="mt-6">
          <ProfileForm role="lecturer" />
        </div>
      </div>
    </div>
  );
}