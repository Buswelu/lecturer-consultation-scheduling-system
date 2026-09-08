"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  CalendarOff,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  getAvailabilityForLecturer,
  addAvailability,
  updateAvailability,
  deleteAvailability,
  getAvailabilityExceptions,
  addAvailabilityException,
  deleteAvailabilityException,
  getDayLabel,
  dayOrder,
} from "@/lib/services/availability";
import { getCurrentLecturer } from "@/lib/supabase/auth";
import { formatTime } from "@/lib/format";
import { formatDateInTZ, formatTimeInTZ } from "@/lib/scheduling/datetime";
import type { AvailabilityException, AvailabilityRule, DayOfWeek } from "@/lib/types";

const MOCK_LECTURER_ID = "lec-1";

const availabilitySchema = z
  .object({
    dayOfWeek: z.string().min(1, "Select a day"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
    duration: z.string().min(1, "Select a duration"),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "End time must be after start time.",
    path: ["endTime"],
  });

type AvailabilityValues = z.infer<typeof availabilitySchema>;

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a date"),
    fullDay: z.boolean().optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
    reason: z.string().max(200, "Reason is too long").optional(),
  })
  .refine(
    (data) => data.fullDay || data.startTime < data.endTime,
    {
      message: "End time must be after start time.",
      path: ["endTime"],
    },
  );

type ExceptionValues = z.infer<typeof exceptionSchema>;

export default function LecturerAvailabilityPage() {
  const [lecturerId, setLecturerId] = React.useState<string | null>(null);
  const [rules, setRules] = React.useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = React.useState<AvailabilityException[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AvailabilityRule | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [exceptionOpen, setExceptionOpen] = React.useState(false);
  const [exceptionError, setExceptionError] = React.useState<string | null>(null);
  const [savingException, setSavingException] = React.useState(false);
  const [deleteExceptionId, setDeleteExceptionId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<AvailabilityValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: {
      dayOfWeek: "monday",
      startTime: "09:00",
      endTime: "12:00",
      duration: "30",
    },
  });

  const {
    register: registerEx,
    handleSubmit: handleSubmitEx,
    setValue: setValueEx,
    reset: resetEx,
    watch: watchEx,
    formState: { errors: errorsEx },
  } = useForm<ExceptionValues>({
    resolver: zodResolver(exceptionSchema),
    defaultValues: {
      date: "",
      fullDay: true,
      startTime: "09:00",
      endTime: "17:00",
      reason: "",
    },
  });

  // Ownership: the lecturer id comes from the session when signed in,
  // otherwise the mock demo id (RLS still enforces ownership server-side).
  React.useEffect(() => {
    getCurrentLecturer()
      .then((current) => setLecturerId(current?.lecturer.id ?? MOCK_LECTURER_ID))
      .catch(() => setLecturerId(MOCK_LECTURER_ID));
  }, []);

  const load = React.useCallback(async () => {
    if (!lecturerId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [ruleData, exceptionData] = await Promise.all([
        getAvailabilityForLecturer(lecturerId),
        getAvailabilityExceptions(lecturerId),
      ]);
      setRules(ruleData);
      setExceptions(exceptionData);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [lecturerId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setFormError(null);
    reset({
      dayOfWeek: "monday",
      startTime: "09:00",
      endTime: "12:00",
      duration: "30",
    });
    setDialogOpen(true);
  };

  const openEdit = (rule: AvailabilityRule) => {
    setEditing(rule);
    setFormError(null);
    reset({
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
      duration: String(rule.duration),
    });
    setDialogOpen(true);
  };

  const onSubmit = async () => {
    if (!lecturerId) return;
    const day = watch("dayOfWeek") as DayOfWeek;
    const start = watch("startTime");
    const end = watch("endTime");
    const duration = parseInt(watch("duration"), 10);

    if (start >= end) {
      setError("endTime", { message: "End time must be after start time." });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAvailability(editing.id, lecturerId, {
          dayOfWeek: day,
          startTime: start,
          endTime: end,
          duration,
        });
      } else {
        await addAvailability(lecturerId, {
          dayOfWeek: day,
          startTime: start,
          endTime: end,
          duration,
        });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save availability.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId || !lecturerId) return;
    try {
      await deleteAvailability(deleteId, lecturerId);
      setDeleteId(null);
      await load();
    } catch (e) {
      setDeleteId(null);
      setFormError(e instanceof Error ? e.message : "Could not delete availability.");
    }
  };

  const openAddException = () => {
    setExceptionError(null);
    resetEx({ date: "", fullDay: true, startTime: "09:00", endTime: "17:00", reason: "" });
    setExceptionOpen(true);
  };

  const onSubmitException = async (values: ExceptionValues) => {
    if (!lecturerId) return;
    const start = values.fullDay ? "00:00" : values.startTime;
    const end = values.fullDay ? "23:59" : values.endTime;
    setSavingException(true);
    setExceptionError(null);
    try {
      await addAvailabilityException(lecturerId, {
        startDatetime: `${values.date}T${start}:00`,
        endDatetime: `${values.date}T${end}:00`,
        reason: values.reason || undefined,
      });
      setExceptionOpen(false);
      await load();
    } catch (e) {
      setExceptionError(e instanceof Error ? e.message : "Could not save exception.");
    } finally {
      setSavingException(false);
    }
  };

  const handleDeleteException = async () => {
    if (!deleteExceptionId || !lecturerId) return;
    try {
      await deleteAvailabilityException(deleteExceptionId, lecturerId);
      setDeleteExceptionId(null);
      await load();
    } catch (e) {
      setDeleteExceptionId(null);
      setExceptionError(e instanceof Error ? e.message : "Could not delete exception.");
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Availability" />
        <LoadingState rows={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Availability" />
        <ErrorState
          title="Could not load availability"
          description="Please check your connection and try again."
          onRetry={load}
        />
      </div>
    );
  }

  const rulesByDay = dayOrder
    .map((day) => ({
      day,
      label: getDayLabel(day),
      items: rules.filter((r) => r.dayOfWeek === day),
    }))
    .filter((group) => group.items.length > 0);

  const fullDayEx = watchEx("fullDay");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Set your weekly consultation availability."
        action={
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Availability
          </Button>
        }
      />

      {formError && !dialogOpen && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}

      {rulesByDay.length === 0 ? (
        <EmptyState
          title="No availability set"
          description="Add your weekly consultation hours to let students book appointments."
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Availability
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rulesByDay.map((group) => (
            <Card key={group.day}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {group.label}
                </CardTitle>
                <CardDescription>
                  {group.items.length} time slot{group.items.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.items.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">
                          {formatTime(rule.startTime)} — {formatTime(rule.endTime)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {rule.duration} min consultations
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(rule)}
                          aria-label={`Edit ${group.label} slot`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(rule.id)}
                          aria-label={`Delete ${group.label} slot`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unavailable dates */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Unavailable dates</h2>
            <p className="text-sm text-muted-foreground">
              Block specific dates that differ from your weekly schedule. Blocked
              time is subtracted from generated slots.
            </p>
          </div>
          <Button variant="outline" onClick={openAddException}>
            <CalendarOff className="mr-2 h-4 w-4" />
            Add exception
          </Button>
        </div>

        {exceptionError && !exceptionOpen && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {exceptionError}
          </div>
        )}

        {exceptions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No exceptions. Your weekly schedule applies to every date.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {exceptions.map((ex) => (
                <div key={ex.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">
                      {formatDateInTZ(ex.startDatetime)} · {formatTimeInTZ(ex.startDatetime)} —{" "}
                      {formatTimeInTZ(ex.endDatetime)}
                    </p>
                    {ex.reason && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{ex.reason}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteExceptionId(ex.id)}
                    aria-label="Delete exception"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Availability" : "Add Availability"}</DialogTitle>
            <DialogDescription>
              Configure your consultation hours for the selected day.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Day</Label>
              <Select
                value={watch("dayOfWeek")}
                onValueChange={(v) => setValue("dayOfWeek", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {dayOrder.map((d) => (
                    <SelectItem key={d} value={d}>
                      {getDayLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.dayOfWeek && (
                <p className="text-sm text-destructive">{errors.dayOfWeek.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start time</Label>
                <Input id="startTime" type="time" {...register("startTime")} />
                {errors.startTime && (
                  <p className="text-sm text-destructive">{errors.startTime.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End time</Label>
                <Input id="endTime" type="time" {...register("endTime")} />
                {errors.endTime && (
                  <p className="text-sm text-destructive">{errors.endTime.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Consultation duration</Label>
              <Select
                value={watch("duration")}
                onValueChange={(v) => setValue("duration", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
              {errors.duration && (
                <p className="text-sm text-destructive">{errors.duration.message}</p>
              )}
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Overlapping ranges on the same day are rejected automatically.
            </p>

            {formError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Add slot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add exception dialog */}
      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add unavailable time</DialogTitle>
            <DialogDescription>
              Block a specific date or time range. Blocked time is removed from
              the slots students can see.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEx(onSubmitException)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ex-date">Date</Label>
              <Input id="ex-date" type="date" {...registerEx("date")} />
              {errorsEx.date && (
                <p className="text-sm text-destructive">{errorsEx.date.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="ex-fullday"
                checked={fullDayEx}
                onCheckedChange={(checked) => setValueEx("fullDay", Boolean(checked))}
              />
              <Label htmlFor="ex-fullday" className="text-sm font-normal">
                Whole day unavailable
              </Label>
            </div>

            {!fullDayEx && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ex-start">Start time</Label>
                  <Input id="ex-start" type="time" {...registerEx("startTime")} />
                  {errorsEx.startTime && (
                    <p className="text-sm text-destructive">{errorsEx.startTime.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ex-end">End time</Label>
                  <Input id="ex-end" type="time" {...registerEx("endTime")} />
                  {errorsEx.endTime && (
                    <p className="text-sm text-destructive">{errorsEx.endTime.message}</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ex-reason">Reason (optional)</Label>
              <Input
                id="ex-reason"
                placeholder="Conference, leave, meeting…"
                {...registerEx("reason")}
              />
              {errorsEx.reason && (
                <p className="text-sm text-destructive">{errorsEx.reason.message}</p>
              )}
            </div>

            {exceptionError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {exceptionError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExceptionOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingException}>
                {savingException ? "Saving..." : "Add exception"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete availability?"
        description="Are you sure you want to remove this availability slot? Existing appointments will not be affected."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <ConfirmationDialog
        open={!!deleteExceptionId}
        onOpenChange={(open) => !open && setDeleteExceptionId(null)}
        title="Delete exception?"
        description="This date will follow your weekly schedule again."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteException}
      />
    </div>
  );
}
