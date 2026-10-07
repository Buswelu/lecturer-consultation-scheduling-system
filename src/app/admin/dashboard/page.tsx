"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Users,
  GraduationCap,
  CalendarDays,
  FileClock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { getUsers } from "@/lib/services/users";
import { getAppointments } from "@/lib/services/appointments";
import type { Appointment } from "@/lib/types";

/** Controlled table overview: name + purpose (counts come from the API). */
const TABLE_PURPOSES: [string, string][] = [
  ["users", "Login identity (identifier, email, password hash)"],
  ["profiles", "Display name + authoritative role"],
  ["students", "Student details + registration numbers"],
  ["lecturers", "Lecturer details + staff numbers"],
  ["departments", "Academic departments"],
  ["courses", "Courses"],
  ["lecturer_courses", "Lecturer–course assignments"],
  ["availability", "Recurring weekly availability"],
  ["availability_exceptions", "One-off unavailable periods"],
  ["appointments", "Consultation bookings"],
  ["appointment_history", "Immutable appointment audit trail"],
  ["notifications", "In-app notifications"],
  ["sessions", "Active login sessions (hashes only)"],
  ["auth_rate_limits", "Brute-force counters (no secrets)"],
  ["schema_migrations", "Applied migration tracking"],
];

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof getUsers>>>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [overview, setOverview] = useState<{
    tables: Record<string, number>;
    usersByRole: Record<string, number>;
    usersActive: number;
    usersInactive: number;
    appointmentsByStatus: Record<string, number>;
    availability: { lecturersWithAvailability: number; rules: number; exceptions: number };
    notifications: { total: number; unread: number };
    activeSessions: number;
    rateLimits: { keys: number; blocked: number };
  } | null>(null);

  useEffect(() => {
    Promise.all([getUsers(), getAppointments()]).then(([u, a]) => {
      setUsers(u);
      setAppointments(a);
    });
    // PostgreSQL system overview (admin-only endpoint, counts only — no
    // secrets, no SQL execution). Failures hide the section, not the page.
    fetch("/api/admin/overview")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok) setOverview(data);
      })
      .catch(() => undefined);
  }, []);

  const students = users.filter((u) => u.role === "student");
  const lecturers = users.filter((u) => u.role === "lecturer");
  const pending = appointments.filter((a) => a.status === "pending");
  const completed = appointments.filter((a) => a.status === "completed");
  const cancelled = appointments.filter((a) => a.status === "cancelled");

  // Chart: appointments by month (last 6 months from appointment dates)
  const monthData = (() => {
    const map = new Map<string, number>();
    appointments.forEach((a) => {
      const month = a.date.slice(0, 7);
      map.set(month, (map.get(month) ?? 0) + 1);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, count]) => ({
        label: month, // yyyy-MM
        count,
      }));
  })();

  // Chart: appointments by status
  const statusData = [
    { label: "Pending", count: pending.length, color: "#f59e0b" },
    { label: "Approved", count: appointments.filter((a) => a.status === "approved").length, color: "#22c55e" },
    { label: "Completed", count: completed.length, color: "#3b82f6" },
    { label: "Cancelled", count: cancelled.length, color: "#9ca3af" },
    { label: "Rejected", count: appointments.filter((a) => a.status === "rejected" || a.status === "no-show").length, color: "#ef4444" },
  ];
  const totalStatus = Math.max(1, statusData.reduce((sum, s) => sum + s.count, 0));

  const maxMonth = Math.max(1, ...monthData.map((d) => d.count));

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of the consultation scheduling system.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Students" value={students.length} icon={GraduationCap} />
        <StatCard title="Total Lecturers" value={lecturers.length} icon={Users} />
        <StatCard title="Total Appointments" value={appointments.length} icon={CalendarDays} />
        <StatCard
          title="Pending Requests"
          value={pending.length}
          icon={FileClock}
          iconClassName="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          title="Completed"
          value={completed.length}
          icon={CheckCircle2}
          iconClassName="bg-green-500/10 text-green-600"
        />
        <StatCard
          title="Cancelled"
          value={cancelled.length}
          icon={XCircle}
          iconClassName="bg-destructive/10 text-destructive"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appointments by month */}
        <Card>
          <CardHeader>
            <CardTitle>Appointments by Month</CardTitle>
            <CardDescription>Consultation volume over the last months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No data available yet.
              </p>
            ) : (
              <div className="flex h-48 items-end gap-3">
                {monthData.map((d, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-md bg-primary/80"
                      style={{ height: `${Math.max(5, (d.count / maxMonth) * 100)}%` }}
                      title={`${d.count} appointments`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {monthLabel(d.label)}
                    </span>
                    <span className="text-xs font-medium">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Appointment Status</CardTitle>
            <CardDescription>Distribution across all appointments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statusData.map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                    </span>
                    <span className="font-medium">
                      {s.count} ({Math.round((s.count / totalStatus) * 100)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.count / totalStatus) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System overview (PostgreSQL, admin-only counts) */}
      {overview && (
        <Card>
          <CardHeader>
            <CardTitle>System Overview</CardTitle>
            <CardDescription>
              Live PostgreSQL counts. The web admin never exposes credentials,
              hashes, tokens, or SQL execution — use pgAdmin for database
              management.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Admin Accounts"
                value={overview.usersByRole.admin ?? 0}
                icon={Users}
              />
              <StatCard
                title="Active Users"
                value={overview.usersActive}
                icon={CheckCircle2}
              />
              <StatCard
                title="Inactive Users"
                value={overview.usersInactive}
                icon={XCircle}
                iconClassName="bg-destructive/10 text-destructive"
              />
              <StatCard
                title="Active Sessions"
                value={overview.activeSessions}
                icon={CheckCircle2}
              />
              <StatCard
                title="Pending Appointments"
                value={overview.appointmentsByStatus.pending ?? 0}
                icon={FileClock}
                iconClassName="bg-amber-500/10 text-amber-600"
              />
              <StatCard
                title="Approved Appointments"
                value={overview.appointmentsByStatus.approved ?? 0}
                icon={CheckCircle2}
              />
              <StatCard
                title="Lecturers w/ Availability"
                value={overview.availability.lecturersWithAvailability}
                icon={CalendarDays}
              />
              <StatCard
                title="Unread Notifications"
                value={overview.notifications.unread}
                icon={FileClock}
              />
              <StatCard
                title="Rate-Limit Keys"
                value={overview.rateLimits.keys}
                icon={FileClock}
              />
              <StatCard
                title="Blocked Keys"
                value={overview.rateLimits.blocked}
                icon={XCircle}
                iconClassName="bg-destructive/10 text-destructive"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Table</th>
                    <th className="py-2 pr-4 font-medium">Rows</th>
                    <th className="py-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_PURPOSES.map(([table, purpose]) => (
                    <tr key={table} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{table}</td>
                      <td className="py-2 pr-4 font-medium">
                        {overview.tables[table] ?? "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick links */}      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Manage Users", href: "/admin/users", icon: Users, desc: "View and manage accounts" },
          { label: "View Appointments", href: "/admin/appointments", icon: CalendarDays, desc: "Track all consultations" },
          { label: "Manage Departments", href: "/admin/departments", icon: GraduationCap, desc: "Configure departments" },
        ].map((link) => (
          <Card key={link.href}>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <link.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold">{link.label}</h3>
                <p className="text-sm text-muted-foreground">{link.desc}</p>
              </div>
              <Link
                href={link.href}
                className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={link.label}
              >
                <ArrowUpRight className="h-5 w-5" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}