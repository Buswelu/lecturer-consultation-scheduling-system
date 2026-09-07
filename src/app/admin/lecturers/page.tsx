"use client";

import { AdminRoleListPage } from "@/components/admin/admin-role-list";

export default function AdminLecturersPage() {
  return (
    <AdminRoleListPage
      role="lecturer"
      title="Lecturers"
      description="All registered lecturer accounts."
    />
  );
}