"use client";

import { AdminRoleListPage } from "@/components/admin/admin-role-list";

export default function AdminStudentsPage() {
  return (
    <AdminRoleListPage
      role="student"
      title="Students"
      description="All registered student accounts."
    />
  );
}