"use client";

import * as React from "react";
import { useEffect } from "react";
import { FileBarChart, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getDepartments } from "@/lib/services/users";
import { getCourses } from "@/lib/services/courses";
import { apiGet } from "@/lib/services/http";
import type { ReportsSummary } from "@/lib/db/repositories/reports";

export default function AdminReportsPage() {
  const [reports, setReports] = React.useState<ReportsSummary | null>(null);
  const [deptCount, setDeptCount] = React.useState(0);
  const [courseCount, setCourseCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  useEffect(() => {
    // Server-computed aggregates (SQL COUNT/GROUP BY) — the browser never
    // calculates authoritative totals from raw rows.
    Promise.all([
      apiGet<{ reports: ReportsSummary }>("/api/admin/reports").then((r) => r.reports),
      getDepartments().catch(() => []),
      getCourses().catch(() => []),
    ])
      .then(([rep, depts, courses]) => {
        setReports(rep);
        setDeptCount(depts.length);
        setCourseCount(courses.length);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Reports" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError || !reports) {
    return (
      <div>
        <PageHeader title="Reports" />
        <p className="text-sm text-destructive">
          Couldn&apos;t load the reports. Please try again.
        </p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // Summary metrics (all server-aggregated).
  const byStatus = reports.appointmentsByStatus;
  const approved = byStatus.approved ?? 0;
  const completed = byStatus.completed ?? 0;
  const pending = byStatus.pending ?? 0;
  const cancelled = byStatus.cancelled ?? 0;
  const noShow = byStatus.no_show ?? 0;
  const online = reports.appointmentsByType.online;
  const inPerson = reports.appointmentsByType.inPerson;
  const total = Math.max(1, reports.totals.appointments);

  // Appointments by month (EAT wall-clock months, newest last).
  const monthData = reports.appointmentsByMonth.map((m) => [m.month, m.count] as [string, number]);
  const maxMonth = Math.max(1, ...monthData.map(([, c]) => c));

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-");
    return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(m, 10) - 1]} '${y.slice(2)}`;
  };

  // Most popular courses (server-ranked with names).
  const topCourses = reports.topCourses.map(
    (c) => [c.courseId, c.count, c.courseName] as [string, number, string],
  );

  const statusData = [
    { label: "Approved", count: approved, color: "bg-green-500" },
    { label: "Completed", count: completed, color: "bg-blue-500" },
    { label: "Pending", count: pending, color: "bg-amber-500" },
    { label: "Cancelled", count: cancelled, color: "bg-gray-400" },
    { label: "Rejected", count: byStatus.rejected ?? 0, color: "bg-red-500" },
    { label: "No-show", count: noShow, color: "bg-red-400" },
  ];

  const typeData = [
    { label: "Online", count: online, color: "bg-purple-500" },
    { label: "In-person", count: inPerson, color: "bg-cyan-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="System-wide statistics and analytics."
        action={
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Appointments" value={reports.totals.appointments} />
        <MetricCard label="Approval Rate" value={`${Math.round((approved / total) * 100)}%`} />
        <MetricCard label="Completion Rate" value={`${Math.round((completed / total) * 100)}%`} />
        <MetricCard label="No-show Rate" value={`${Math.round((noShow / total) * 100)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appointments by month */}
        <Card>
          <CardHeader>
            <CardTitle>Consultations by Month</CardTitle>
            <CardDescription>Consultation volume over time</CardDescription>
          </CardHeader>
          <CardContent>
            {monthData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data available yet.
              </p>
            ) : (
              <div className="flex h-52 items-end gap-3">
                {monthData.map(([month, count]) => (
                  <div key={month} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-md bg-primary/80"
                      style={{ height: `${Math.max(5, (count / maxMonth) * 100)}%` }}
                    />
                    <span className="text-xs text-muted-foreground">{monthLabel(month)}</span>
                    <span className="text-xs font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top courses */}
        <Card>
          <CardHeader>
            <CardTitle>Top Courses by Consultations</CardTitle>
            <CardDescription>Courses with the most requests</CardDescription>
          </CardHeader>
          <CardContent>
            {topCourses.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data available yet.
              </p>
            ) : (
              <div className="space-y-4">
                {topCourses.map(([courseId, count, courseName]) => {
                  const max = topCourses[0][1];
                  return (
                    <div key={courseId}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="truncate pr-4">{courseName}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
            <CardDescription>All appointments by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statusData.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${s.color}`} />
                  <span className="w-24 text-sm">{s.label}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${(s.count / total) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Platform stats */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Overview</CardTitle>
            <CardDescription>Key platform statistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <MetricMini label="Students" value={reports.studentStats.length} />
              <MetricMini label="Lecturers" value={reports.lecturerStats.length} />
              <MetricMini label="Departments" value={deptCount} />
              <MetricMini label="Courses" value={courseCount} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Consultation Types</p>
              <div className="space-y-2">
                {typeData.map((t) => (
                  <div key={t.label} className="flex items-center gap-3">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${t.color}`} />
                    <span className="w-24 text-sm">{t.label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${t.color}`}
                        style={{ width: `${(t.count / total) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-medium">
                      {t.count} ({Math.round((t.count / total) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold">{value}</p>
          </div>
          <FileBarChart className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}