"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { FilterPanel, FilterField } from "@/components/filter-panel";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/appointments/appointment-status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAppointmentsPage } from "@/lib/services/appointments";
import { getDepartments, getCourses } from "@/lib/services/users";
import { LoadingState } from "@/components/loading-state";
import { formatDate, formatTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import type { Department, Course } from "@/lib/types";

const statusOptions: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "no-show", label: "No Show" },
];

export default function AdminAppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [courseFilter, setCourseFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const PAGE_SIZE = 20;

  // Debounced search so typing doesn't fan out requests.
  const [debouncedSearch, setDebouncedSearch] = React.useState(search);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-driven list: search/status/course/department/pagination in SQL.
  React.useEffect(() => {
    let cancelled = false;
    getAppointmentsPage(
      {
        search: debouncedSearch || undefined,
        status: status === "all" ? undefined : (status as Appointment["status"]),
        courseId: courseFilter === "all" ? undefined : courseFilter,
        departmentId: deptFilter === "all" ? undefined : deptFilter,
      },
      page,
      PAGE_SIZE,
    )
      .then((result) => {
        if (cancelled) return;
        setAppointments(result.items);
        setTotal(result.total);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, status, courseFilter, deptFilter, page]);

  React.useEffect(() => {
    Promise.all([getDepartments(), getCourses()]).then(([deps, crs]) => {
      setDepartments(deps);
      setCourses(crs);
    });
  }, []);

  const updateFilter = (setter: (v: string) => void) => (v: string) => {
    setLoading(true);
    setPage(1);
    setter(v);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = appointments;

  const columns: Column<Appointment>[] = [
    {
      key: "student",
      header: "Student",
      sortValue: (a) => a.studentName ?? "",
      cell: (a) => <span className="font-medium">{a.studentName ?? "Unknown"}</span>,
    },
    {
      key: "lecturer",
      header: "Lecturer",
      sortValue: (a) => a.lecturerName ?? "",
      cell: (a) => <span>{a.lecturerName ?? "Unknown"}</span>,
    },
    {
      key: "course",
      header: "Course",
      sortValue: (a) => a.courseName ?? "",
      cell: (a) => (
        <span className="text-sm text-muted-foreground">{a.courseName ?? "—"}</span>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortValue: (a) => a.date,
      cell: (a) => (
        <div>
          <p className="text-sm">{formatDate(a.date)}</p>
          <p className="text-xs text-muted-foreground">
            {formatTime(a.startTime)} - {formatTime(a.endTime)}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (a) => a.type,
      cell: (a) => <span className="capitalize text-sm">{a.type}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (a) => a.status,
      cell: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (a) => (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/appointments/${a.id}`}>View</Link>
        </Button>
      ),
    },
  ];

  const handleReset = () => {
    setSearch("");
    setStatus("all");
    setDeptFilter("all");
    setCourseFilter("all");
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="View all consultation appointments across the system."
      />

      <FilterPanel onReset={handleReset}>
        <FilterField label="Search" className="min-w-[200px] flex-1">
          <SearchBar
            placeholder="Search student, lecturer, course..."
            value={search}
            onChange={(v) => {
              setLoading(true);
              setPage(1);
              setSearch(v);
            }}
          />
        </FilterField>
        <FilterField label="Status">
          <Select value={status} onValueChange={updateFilter(setStatus)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
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
        <FilterField label="Course">
          <Select value={courseFilter} onValueChange={updateFilter(setCourseFilter)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
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
            getRowId={(a) => a.id}
            pageSize={PAGE_SIZE}
            onRowClick={(a) => {
              router.push(`/admin/appointments/${a.id}`);
            }}
          />
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p role="status">
              Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
              {(page - 1) * PAGE_SIZE + filtered.length} of {total} appointments
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
    </div>
  );
}