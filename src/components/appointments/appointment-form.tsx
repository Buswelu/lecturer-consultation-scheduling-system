"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ChevronLeft, ChevronRight, CheckCircle2, CalendarPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { LoadingState } from "@/components/loading-state";
import { formatDate, formatTime } from "@/lib/format";
import { getLecturers } from "@/lib/services/lecturers";
import { getCourses } from "@/lib/services/users";
import {
  createAppointment,
  BookingConflictError,
} from "@/lib/services/appointments";
import {
  getAvailableSlots,
  getDayLabel,
  type Slot,
} from "@/lib/services/availability";
import { useStudentIdentity } from "@/hooks/useSessionIds";
import {
  addDaysYMD,
  dayIndexToName,
  parseYMD,
  todayYMD,
  weekdayIndexYMD,
} from "@/lib/scheduling/datetime";
import type { LecturerProfile, Course, ConsultationType } from "@/lib/types";

const bookSchema = z.object({
  lecturerId: z.string().min(1, "Please select a lecturer"),
  courseId: z.string().min(1, "Please select a course"),
  date: z.string().min(1, "Please select a date"),
  startTime: z.string().min(1, "Please select a time slot"),
  endTime: z.string().min(1, "Please select a time slot"),
  type: z.enum(["in-person", "online"], { message: "Please select consultation type" }),
  reason: z.string().min(5, "Please provide a reason (at least 5 characters)"),
  notes: z.string().optional(),
});

type BookValues = z.infer<typeof bookSchema>;

const steps = ["Lecturer", "Course & Date", "Time & Type", "Reason", "Review"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Timezone-safe "Monday, September 15, 2026" label for a YMD date. */
function formatDayLabel(ymd: string): string {
  const { y, m, d } = parseYMD(ymd);
  return `${getDayLabel(dayIndexToName(weekdayIndexYMD(ymd)))}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

export function AppointmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { studentId } = useStudentIdentity();
  const [step, setStep] = React.useState(0);
  const [submitted, setSubmitted] = React.useState(false);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [lecturers, setLecturers] = React.useState<LecturerProfile[]>([]);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [slotsByDate, setSlotsByDate] = React.useState<Record<string, Slot[]>>({});
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const preselected = React.useRef(false);

  const initialLecturer = searchParams.get("lecturerId") ?? "";
  const initialDate = searchParams.get("date") ?? "";
  const initialStart = searchParams.get("startTime") ?? "";
  const initialEnd = searchParams.get("endTime") ?? "";

  React.useEffect(() => {
    Promise.all([getLecturers(), getCourses()]).then(([lecs, crs]) => {
      setLecturers(lecs);
      setCourses(crs.filter((c) => c.status === "active"));
    });
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      lecturerId: initialLecturer,
      courseId: "",
      date: initialDate,
      startTime: initialStart,
      endTime: initialEnd,
      type: "in-person",
      reason: "",
      notes: "",
    },
  });

  const values = watch();
  const lecturer = lecturers.find((l) => l.id === values.lecturerId);
  const selectedCourse = courses.find((c) => c.id === values.courseId);

  // Load real slots for the chosen lecturer (next 30 days). Resets any
  // stale date/slot when the lecturer changes (except URL preselection).
  React.useEffect(() => {
    if (!values.lecturerId) {
      setSlotsByDate({});
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    const today = todayYMD();
    getAvailableSlots({
      lecturerId: values.lecturerId,
      from: today,
      to: addDaysYMD(today, 30),
    })
      .then((map) => {
        if (cancelled) return;
        setSlotsByDate(map);
        if (!preselected.current) {
          preselected.current = true;
          // Keep URL-preselected slot only if still bookable.
          const preselectedSlot = (map[initialDate] ?? []).find(
            (s) => s.startTime === initialStart && s.status === "available",
          );
          if (!preselectedSlot && (initialDate || initialStart)) {
            setValue("date", "");
            setValue("startTime", "");
            setValue("endTime", "");
          }
        } else {
          setValue("date", "");
          setValue("startTime", "");
          setValue("endTime", "");
        }
      })
      .catch(() => {
        if (!cancelled) setSlotsByDate({});
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.lecturerId]);

  const availableDates = React.useMemo(
    () =>
      Object.keys(slotsByDate)
        .sort()
        .filter((d) => slotsByDate[d].some((s) => s.status === "available")),
    [slotsByDate],
  );

  const daySlots = values.date ? (slotsByDate[values.date] ?? []) : [];

  const validateStep = (): boolean => {
    if (step === 0) return Boolean(values.lecturerId);
    if (step === 1) return Boolean(values.courseId && values.date);
    if (step === 2) return Boolean(values.startTime && values.type);
    if (step === 3) return values.reason.length >= 5;
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, steps.length - 1));
    }
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const refreshSlots = async () => {
    if (!values.lecturerId) return;
    const today = todayYMD();
    try {
      const map = await getAvailableSlots({
        lecturerId: values.lecturerId,
        from: today,
        to: addDaysYMD(today, 30),
      });
      setSlotsByDate(map);
    } catch {
      // Keep existing slots on refresh failure.
    }
  };

  const onSubmit = async (formValues: BookValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!studentId) {
        throw new Error("Your student account could not be resolved. Please sign in again.");
      }
      const created = await createAppointment({
        studentId,
        lecturerId: formValues.lecturerId,
        courseId: formValues.courseId,
        date: formValues.date,
        startTime: formValues.startTime,
        endTime: formValues.endTime,
        type: formValues.type,
        reason: formValues.reason,
        notes: formValues.notes || undefined,
        location:
          formValues.type === "in-person" ? (lecturer?.office ?? "On campus") : undefined,
      });
      setCreatedId(created.id);
      setSubmitted(true);
    } catch (e) {
      if (e instanceof BookingConflictError) {
        setSubmitError(e.message);
        setValue("startTime", "");
        setValue("endTime", "");
        await refreshSlots();
        setStep(2);
      } else {
        setSubmitError(e instanceof Error ? e.message : "We couldn't submit your request.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectLecturerCourses = courses.filter(
    (c) => !values.lecturerId || c.lecturerIds.includes(values.lecturerId),
  );

  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Consultation request submitted successfully.</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Your consultation request is pending review. You will be notified once{" "}
            {lecturer?.fullName ?? "the lecturer"} responds.
          </p>
          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              onClick={() =>
                createdId
                  ? router.push(`/student/appointments/${createdId}`)
                  : router.push("/student/appointments")
              }
            >
              View Appointment
            </Button>
            <Button onClick={() => router.push("/student/appointments")}>
              View My Appointments
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book a Consultation</CardTitle>
        <CardDescription>Complete the form to schedule your consultation.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Step indicator */}
        <ol className="mb-6 flex items-center justify-between">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 items-center">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary text-primary-foreground ring-2 ring-ring ring-offset-2"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <div className="ml-2 hidden text-xs font-medium sm:block">{s}</div>
              {i < steps.length - 1 && <div className="mx-2 h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {step === 0 && (
            <div className="space-y-4">
              <Label htmlFor="lecturer">Select Lecturer</Label>
              <Select
                value={values.lecturerId}
                onValueChange={(v) => setValue("lecturerId", v, { shouldValidate: true })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a lecturer" />
                </SelectTrigger>
                <SelectContent>
                  {lecturers.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.lecturerId && (
                <p className="text-sm text-destructive">{errors.lecturerId.message}</p>
              )}
              {lecturer && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium">{lecturer.fullName}</p>
                  <p className="mt-1 text-muted-foreground">{lecturer.office}</p>
                  <p className="mt-1 text-muted-foreground line-clamp-2">{lecturer.bio}</p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="course">Course</Label>
                <Select
                  value={values.courseId}
                  onValueChange={(v) => setValue("courseId", v, { shouldValidate: true })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectLecturerCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.courseId && (
                  <p className="text-sm text-destructive">{errors.courseId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                {slotsLoading ? (
                  <LoadingState rows={1} />
                ) : (
                  <Select
                    value={values.date}
                    onValueChange={(v) => {
                      setValue("date", v, { shouldValidate: true });
                      setValue("startTime", "");
                      setValue("endTime", "");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a date" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDates.map((d) => (
                        <SelectItem key={d} value={d}>
                          {formatDayLabel(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.date && (
                  <p className="text-sm text-destructive">{errors.date.message}</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Available Time Slots</Label>
                {values.date ? (
                  daySlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No slots on this date. Please choose another date.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {daySlots.map((slot) => {
                        const selectable = slot.status === "available";
                        const isSelected = values.startTime === slot.startTime;
                        return (
                          <Button
                            key={slot.startTime}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            disabled={!selectable}
                            onClick={() => {
                              setValue("startTime", slot.startTime, { shouldValidate: true });
                              setValue("endTime", slot.endTime, { shouldValidate: true });
                            }}
                            className={!selectable ? "pointer-events-none opacity-50 line-through" : ""}
                          >
                            {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                          </Button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Please select a date first in the previous step.
                  </p>
                )}
                {errors.startTime && (
                  <p className="text-sm text-destructive">{errors.startTime.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Consultation Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(["in-person", "online"] as ConsultationType[]).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={values.type === type ? "default" : "outline"}
                      onClick={() => setValue("type", type, { shouldValidate: true })}
                      className="h-auto flex-col py-4"
                    >
                      <span className="text-sm font-medium">
                        {type === "in-person" ? "In-person" : "Online"}
                      </span>
                      <span className="mt-1 text-xs opacity-70">
                        {type === "in-person" ? "Meet on campus" : "Video call"}
                      </span>
                    </Button>
                  ))}
                </div>
                {errors.type && (
                  <p className="text-sm text-destructive">{errors.type.message}</p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reason">Reason / Topic</Label>
                <Input
                  id="reason"
                  placeholder="e.g. Help with database normalization"
                  {...register("reason")}
                />
                {errors.reason && (
                  <p className="text-sm text-destructive">{errors.reason.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Optional Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional details or questions..."
                  rows={4}
                  {...register("notes")}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Review Your Booking</h3>
              <div className="rounded-lg border p-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Lecturer</dt>
                    <dd className="font-medium">{lecturer?.fullName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Course</dt>
                    <dd className="font-medium">
                      {selectedCourse ? `${selectedCourse.title} (${selectedCourse.code})` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Date</dt>
                    <dd className="font-medium">
                      {values.date ? formatDate(values.date) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Time</dt>
                    <dd className="font-medium">
                      {values.startTime
                        ? `${formatTime(values.startTime)} - ${formatTime(values.endTime)}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Type</dt>
                    <dd className="font-medium capitalize">{values.type}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Location</dt>
                    <dd className="font-medium">
                      {values.type === "in-person" ? lecturer?.office ?? "On campus" : "Online"}
                    </dd>
                  </div>
                </dl>
                <Separator className="my-4" />
                <div>
                  <dt className="text-xs text-muted-foreground">Reason</dt>
                  <dd className="mt-1 text-sm">{values.reason || "—"}</dd>
                </div>
                {values.notes && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Notes</dt>
                      <dd className="mt-1 text-sm">{values.notes}</dd>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {submitError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <Separator />

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={step === 0 ? () => router.push("/student/lecturers") : handleBack}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={handleNext}>
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={submitting}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                {submitting ? "Submitting..." : "Confirm Booking"}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
