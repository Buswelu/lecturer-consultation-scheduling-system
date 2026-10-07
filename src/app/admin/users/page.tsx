"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Eye,
  Pencil,
  Ban,
  CheckCircle2,
  Trash2,
  UserPlus,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { LoadingState } from "@/components/loading-state";
import { getUsersPage, getDepartments, setUserActiveStatus } from "@/lib/services/users";
import { formatDate } from "@/lib/format";
import type {
  UserWithDepartment,
} from "@/lib/services/users";
import type { Department } from "@/lib/types";

const roleBadgeVariant = (role: string) =>
  role === "student"
    ? ("info" as const)
    : role === "lecturer"
      ? ("success" as const)
      : ("default" as const);

const roleLabel = (role: string) =>
  role === "student" ? "Student" : role === "lecturer" ? "Lecturer" : "Admin";

const statusBadgeVariant = (status: string) =>
  status === "active"
    ? ("success" as const)
    : status === "inactive"
      ? ("neutral" as const)
      : ("destructive" as const);

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<UserWithDepartment[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [viewUser, setViewUser] = React.useState<UserWithDepartment | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<{
    user: UserWithDepartment;
    type: "deactivate" | "activate" | "delete";
  } | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const PAGE_SIZE = 20;

  // Debounced search so typing doesn't fan out requests.
  const [debouncedSearch, setDebouncedSearch] = React.useState(search);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    getDepartments().then((d) => setDepartments(d)).catch(() => undefined);
  }, []);

  // Server-driven directory: search/filters/pagination run in PostgreSQL.
  React.useEffect(() => {
    let cancelled = false;
    getUsersPage(
      {
        search: debouncedSearch || undefined,
        role: roleFilter === "all" ? undefined : (roleFilter as "student" | "lecturer" | "admin"),
        departmentId: deptFilter === "all" ? undefined : deptFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      },
      page,
      PAGE_SIZE,
    )
      .then((result) => {
        if (cancelled) return;
        setUsers(result.items);
        setTotal(result.total);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, roleFilter, deptFilter, statusFilter, page]);

  // Reset to the first page whenever the query changes.
  const updateFilter = (setter: (v: string) => void) => (v: string) => {
    setLoading(true);
    setPage(1);
    setter(v);
  };

  const filtered = users;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { user, type } = confirmAction;
    setActionError(null);
    if (type === "delete") {
      // Local-only: auth identities are never hard-deleted from the UI.
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } else {
      const userId = (user as UserWithDepartment & { userId?: string }).userId ?? user.id;
      try {
        await setUserActiveStatus(userId, type === "activate");
        const status = type === "activate" ? "active" : "inactive";
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status } : u)));
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Could not update the account.");
        return;
      }
    }
    setConfirmAction(null);
  };

  const columns: Column<UserWithDepartment>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (u) => u.fullName,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar alt={u.fullName} fallback={u.fullName} size="sm" />
          <div className="min-w-0">
            <p className="font-medium">{u.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortValue: (u) => u.role,
      cell: (u) => <Badge variant={roleBadgeVariant(u.role)}>{roleLabel(u.role)}</Badge>,
    },
    {
      key: "department",
      header: "Department",
      sortValue: (u) => u.departmentName ?? "",
      cell: (u) => (
        <span className="text-sm text-muted-foreground">
          {u.departmentName ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (u) => u.status,
      cell: (u) => <Badge variant={statusBadgeVariant(u.status)}>{u.status}</Badge>,
    },
    {
      key: "created",
      header: "Created",
      sortValue: (u) => u.createdAt,
      cell: (u) => <span className="text-sm text-muted-foreground">{formatDate(u.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${u.fullName}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setViewUser(u)}>
              <Eye className="h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            {u.status === "active" ? (
              <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "deactivate" })}>
                <Ban className="h-4 w-4" />
                Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setConfirmAction({ user: u, type: "activate" })}>
                <CheckCircle2 className="h-4 w-4" />
                Activate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmAction({ user: u, type: "delete" })}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const handleReset = () => {
    setSearch("");
    setRoleFilter("all");
    setDeptFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        description="View and manage all users in the system."
        action={
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      <FilterPanel onReset={handleReset}>
        <FilterField label="Search" className="min-w-[200px] flex-1">
          <SearchBar
            placeholder="Search by name, email, or ID..."
            value={search}
            onChange={(v) => {
              setLoading(true);
              setPage(1);
              setSearch(v);
            }}
          />
        </FilterField>
        <FilterField label="Role">
          <Select value={roleFilter} onValueChange={updateFilter(setRoleFilter)}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="lecturer">Lecturer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Department">
          <Select value={deptFilter} onValueChange={updateFilter(setDeptFilter)}>
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
          <Select value={statusFilter} onValueChange={updateFilter(setStatusFilter)}>
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

      {loading ? (
        <LoadingState rows={6} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(u) => u.id}
            pageSize={PAGE_SIZE}
          />
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p role="status">
              Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
              {(page - 1) * PAGE_SIZE + filtered.length} of {total} users
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                Previous
              </Button>
              <span aria-live="polite">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* View user dialog */}
      <Dialog open={!!viewUser} onOpenChange={(open) => !open && setViewUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>Account information</DialogDescription>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar alt={viewUser.fullName} fallback={viewUser.fullName} size="lg" />
                <div>
                  <p className="font-semibold">{viewUser.fullName}</p>
                  <p className="text-sm text-muted-foreground">{viewUser.email}</p>
                  <Badge variant={roleBadgeVariant(viewUser.role)} className="mt-1">
                    {roleLabel(viewUser.role)}
                  </Badge>
                </div>
              </div>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{viewUser.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Department</dt>
                  <dd>{viewUser.departmentName ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize">{viewUser.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatDate(viewUser.createdAt)}</dd>
                </div>
              </dl>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewUser(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setActionError(null);
          }
        }}
        title={
          confirmAction?.type === "delete"
            ? "Delete user?"
            : confirmAction?.type === "deactivate"
              ? "Deactivate user?"
              : "Activate user?"
        }
        description={
          confirmAction ? (
            actionError ??
            (confirmAction.type === "delete"
              ? `Delete ${confirmAction.user.fullName}? This action cannot be undone.`
              : confirmAction.type === "deactivate"
                ? `Deactivate ${confirmAction.user.fullName}? They will no longer be able to sign in.`
                : `Activate ${confirmAction.user.fullName}? They will regain access to the system.`)
          ) : undefined
        }
        confirmLabel={
          confirmAction?.type === "delete"
            ? "Delete"
            : confirmAction?.type === "deactivate"
              ? "Deactivate"
              : "Activate"
        }
        variant={confirmAction?.type === "activate" ? "default" : "destructive"}
        onConfirm={handleConfirm}
      />
    </div>
  );
}