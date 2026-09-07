"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { FilterPanel, FilterField } from "@/components/filter-panel";
import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUsers, getDepartments } from "@/lib/services/users";
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
        (u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    if (deptFilter !== "all") result = result.filter((u) => u.departmentId === deptFilter);
    if (statusFilter !== "all") result = result.filter((u) => u.status === statusFilter);
    return result;
  }, [users, search, deptFilter, statusFilter]);

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
          <SearchBar placeholder="Search by name or email..." value={search} onChange={setSearch} />
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
    </div>
  );
}