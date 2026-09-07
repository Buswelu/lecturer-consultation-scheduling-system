import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default function LecturerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DashboardLayout role="lecturer">{children}</DashboardLayout>;
}
