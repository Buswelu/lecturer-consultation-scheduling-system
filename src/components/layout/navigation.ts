import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Bell,
  User,
  Settings,
  GraduationCap,
  BookOpen,
  Clock,
  FileBarChart,
  Building2,
  CalendarClock,
} from "lucide-react";
import type { UserRole } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function getNavConfig(role: UserRole): NavGroup[] {
  switch (role) {
    case "student":
      return [
        {
          items: [
            { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
            { label: "Lecturers", href: "/student/lecturers", icon: Users },
            { label: "Appointments", href: "/student/appointments", icon: CalendarDays },
            { label: "Calendar", href: "/student/calendar", icon: CalendarClock },
          ],
        },
        {
          label: "Account",
          items: [
            { label: "Notifications", href: "/student/notifications", icon: Bell },
            { label: "Profile", href: "/student/profile", icon: User },
            { label: "Settings", href: "/student/settings", icon: Settings },
          ],
        },
      ];
    case "lecturer":
      return [
        {
          items: [
            { label: "Dashboard", href: "/lecturer/dashboard", icon: LayoutDashboard },
            { label: "Appointments", href: "/lecturer/appointments", icon: CalendarDays },
            { label: "Calendar", href: "/lecturer/calendar", icon: CalendarClock },
            { label: "Availability", href: "/lecturer/availability", icon: Clock },
            { label: "Courses", href: "/lecturer/courses", icon: BookOpen },
          ],
        },
        {
          label: "Account",
          items: [
            { label: "Notifications", href: "/lecturer/notifications", icon: Bell },
            { label: "Profile", href: "/lecturer/profile", icon: User },
            { label: "Settings", href: "/lecturer/settings", icon: Settings },
          ],
        },
      ];
    case "admin":
      return [
        {
          items: [
            { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
            { label: "Users", href: "/admin/users", icon: Users },
            { label: "Students", href: "/admin/students", icon: GraduationCap },
            { label: "Lecturers", href: "/admin/lecturers", icon: GraduationCap },
            { label: "Departments", href: "/admin/departments", icon: Building2 },
            { label: "Courses", href: "/admin/courses", icon: BookOpen },
            { label: "Appointments", href: "/admin/appointments", icon: CalendarDays },
            { label: "Reports", href: "/admin/reports", icon: FileBarChart },
          ],
        },
        {
          label: "Account",
          items: [
            { label: "Settings", href: "/admin/settings", icon: Settings },
          ],
        },
      ];
  }
}
