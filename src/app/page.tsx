import Link from "next/link";
import {
  GraduationCap,
  CalendarClock,
  Users,
  Bell,
  Clock,
  CalendarCheck,
  ArrowRight,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: CalendarClock,
    title: "Flexible Scheduling",
    description: "See real-time lecturer availability and book consultation slots that work for you.",
  },
  {
    icon: Users,
    title: "Find the Right Lecturer",
    description: "Browse lecturers by department, course, and availability to find the perfect match.",
  },
  {
    icon: Bell,
    title: "Instant Notifications",
    description: "Get notified the moment your request is approved, rejected, or rescheduled.",
  },
  {
    icon: ShieldCheck,
    title: "Reliable & Secure",
    description: "Your academic data is protected and only visible to those who should see it.",
  },
];

const steps = [
  {
    number: "01",
    title: "Search for a Lecturer",
    description: "Use filters to find lecturers by name, department, or course.",
  },
  {
    number: "02",
    title: "Choose Your Slot",
    description: "View their availability calendar and pick a time that suits you.",
  },
  {
    number: "03",
    title: "Submit Your Request",
    description: "Provide the reason for consultation and submit your booking request.",
  },
  {
    number: "04",
    title: "Get Approved & Meet",
    description: "Receive confirmation and attend your consultation in-person or online.",
  },
];

const studentBenefits = [
  "View lecturer availability without emails",
  "Book in-person or online consultations",
  "Track appointment status in real time",
  "Receive reminders before your meeting",
  "Manage and reschedule appointments easily",
];

const lecturerBenefits = [
  "Set weekly availability in minutes",
  "Approve or reject requests instantly",
  "Manage your full consultation calendar",
  "Mark appointments complete or no-show",
  "Reduce scheduling conflicts automatically",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">ConsultConnect</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Schedule Time With Your Lecturer
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Find lecturer availability, request consultations, and manage your academic
              meetings in one place.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/login">
                  Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/register">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <p className="mt-3 text-muted-foreground">
              A simple four-step process to connect you with your lecturers
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                  {step.number}
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need</h2>
            <p className="mt-3 text-muted-foreground">
              Features designed for modern academic consultation management
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-bold">For Students</h3>
              </div>
              <ul className="mt-6 space-y-3">
                {studentBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-muted-foreground">
                    <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-bold">For Lecturers</h3>
              </div>
              <ul className="mt-6 space-y-3">
                {lecturerBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-muted-foreground">
                    <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to get started?</h2>
          <p className="mt-3 text-muted-foreground">
            Join your institution&apos;s consultation scheduler today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">Create an Account</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Login to Your Account</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">ConsultConnect</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ConsultConnect. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
