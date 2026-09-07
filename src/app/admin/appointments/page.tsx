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
import { getAppointments } from "@/lib/services/appointments";
import { getUsers, getDepartments, getCourses } from "@/lib/services/users";
import { getCourseName } from "@/lib/services/lecturers";
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
  const [userNames, setUserNames] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [courseFilter, setCourseFilter] = React.useState("all");

  React.useEffect(() => {
    Promise.all([getAppointments(), getDepartments(), getCourses(), getUsers()]).then(
      ([appts, deps, crs, users]) => {
        setAppointments(appts);
        setDepartments(deps);
        setCourses(crs);
        const nameMap: Record<string, string> = {};
        users.forEach((u) => {
          nameMap[u.id] = u.fullName;
        });
        setUserNames(nameMap);
      },
    );
  }, []);

  const filtered = React.useMemo(() => {
    let result = appointments;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) => {
        const studentName = (userNames[a.studentId] ?? "").toLowerCase();
        const lecturerName = (userNames[a.lecturerId] ?? "").toLowerCase();
        const courseName = getCourseName(a.courseId).toLowerCase();
        return (
          studentName.includes(q) ||
          lecturerName.includes(q) ||
          courseName.includes(q) ||
          a.reason.toLowerCase().includes(q)
        );
      });
    }
    if (status !== "all") result = result.filter((a) => a.status === status);
    if (courseFilter !== "all") result = result.filter((a) => a.courseId === courseFilter);
    if (deptFilter !== "all") {
      const courseIdsInDept = new Set(
        courses.filter((c) => c.departmentId === deptFilter).map((c) => c.id),
      );
      result = result.filter((a) => courseIdsInDept.has(a.courseId));
    }
    return result;
  }, [appointments, search, status, courseFilter, deptFilter, courses, userNames]);

  const columns: Column<Appointment>[] = [
    {
      key: "student",
      header: "Student",
      sortValue: (a) => userNames[a.studentId] ?? "",
      cell: (a) => <span className="font-medium">{userNames[a.studentId] ?? "Unknown"}</span>,
    },
    {
      key: "lecturer",
      header: "Lecturer",
      sortValue: (a) => userNames[a.lecturerId] ?? "",
      cell: (a) => <span>{userNames[a.lecturerId] ?? "Unknown"}</span>,
    },
    {
      key: "course",
      header: "Course",
      sortValue: (a) => getCourseName(a.courseId),
      cell: (a) => (
        <span className="text-sm text-muted-foreground">{getCourseName(a.courseId)}</span>
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
            onChange={setSearch}
          />
        </FilterField>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
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
        <FilterField label="Course">
          <Select value={courseFilter} onValueChange={setCourseFilter}>
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

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(a) => a.id}
        pageSize={10}
        onRowClick={(a) => {
          router.push(`/admin/appointments/${a.id}`);
        }}
      />
    </div>
  );
}