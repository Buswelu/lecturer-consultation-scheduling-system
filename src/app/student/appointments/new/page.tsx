"use client";

import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { AppointmentForm } from "@/components/appointments/appointment-form";

export default function NewAppointmentPage() {
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Appointments", href: "/student/appointments" },
          { label: "Book Consultation" },
        ]}
      />
      <Suspense fallback={<div>Loading...</div>}>
        <AppointmentForm />
      </Suspense>
    </div>
  );
}
