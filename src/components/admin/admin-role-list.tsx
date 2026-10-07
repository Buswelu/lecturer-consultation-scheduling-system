"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { FilterPanel, FilterField } from "@/components/filter-panel";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUsers, getDepartments, setUserActiveStatus } from "@/lib/services/users";
import { formatDate } from "@/lib/format";
import type { UserWithDepartment } from "@/lib/services/users";
import type { Department } from "@/lib/types";

interface AdminRoleListPageProps {
  role: "student" | "lecturer";
  title: string;
  description: string;
}

export function AdminRoleListPage({ role, title, description }: AdminRoleListPageProps) {
  const [users, setUsers] = React.useState<UserWithDepartment[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [search, setSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actingId, setActingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([getUsers({ role }), getDepartments()]).then(([u, d]) => {
      setUsers(u);
      setDepartments(d);
    });
  }, [role]);

  const filtered = React.useMemo(() => {
    let result = users;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u as unknown as { username?: string }).username?.toLowerCase().includes(q),
      );
    }
    if (deptFilter !== "all") result = result.filter((u) => u.departmentId === deptFilter);
    if (statusFilter !== "all") result = result.filter((u) => u.status === statusFilter);
    return result;
  }, [users, search, deptFilter, statusFilter]);

  const handleToggleActive = async (user: UserWithDepartment) => {
    const userId =
      (user as unknown as { userId?: string }).userId ?? user.id;
    setActionError(null);
    setActingId(user.id);
    try {
      await setUserActiveStatus(userId, user.status !== "active");
      const status = user.status !== "active" ? "active" : "inactive";
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status } : u)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update the account.");
    } finally {
      setActingId(null);
    }
  };

  const columns: Column<UserWithDepartment>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (u) => u.fullName,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar alt={u.fullName} fallback={u.fullName} size="sm" />
          <div>
            <p className="font-medium">{u.fullName}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    ...(role === "student"
      ? [
          {
            key: "programme",
            header: "Programme",
            sortValue: (u: UserWithDepartment) => ("programme" in u ? u.programme : "") ?? "",
            cell: (u: UserWithDepartment) => (
              <span className="text-sm text-muted-foreground">{"programme" in u ? u.programme : "—"}</span>
            ),
          },
        ]
      : [
          {
            key: "office",
            header: "Office",
            sortValue: (u: UserWithDepartment) => ("office" in u ? u.office : "") ?? "",
            cell: (u: UserWithDepartment) => (
              <span className="text-sm text-muted-foreground">{"office" in u ? u.office : "—"}</span>
            ),
          },
        ]),
    {
      key: "department",
      header: "Department",
      sortValue: (u) => u.departmentName ?? "",
      cell: (u) => <span className="text-sm text-muted-foreground">{u.departmentName ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (u) => u.status,
      cell: (u) => (
        <Badge variant={u.status === "active" ? "success" : "neutral"} className="capitalize">
          {u.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Created",
      sortValue: (u) => u.createdAt,
      cell: (u) => <span className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      sortValue: () => "",
      cell: (u) => (
        <Button
          variant="outline"
          size="sm"
          disabled={actingId === u.id}
          onClick={() => handleToggleActive(u)}
        >
          {u.status === "active" ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  const handleReset = () => {
    setSearch("");
    setDeptFilter("all");
    setStatusFilter("all");
  };

  return (
    <div>
      <PageHeader title={title} description={description} />

      <FilterPanel onReset={handleReset}>
        <FilterField label="Search" className="min-w-[200px] flex-1">
          <SearchBar placeholder="Search by name, email, or ID..." value={search} onChange={setSearch} />
        </FilterField>
        <FilterField label="Department">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </FilterPanel>

      <DataTable columns={columns} data={filtered} getRowId={(u) => u.id} pageSize={10} />
      {actionError && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}