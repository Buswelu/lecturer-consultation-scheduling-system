import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function StudentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardLayout role="student">{children}</DashboardLayout>;
}
