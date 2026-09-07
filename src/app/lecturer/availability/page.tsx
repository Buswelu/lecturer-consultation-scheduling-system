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
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { getAvailabilityForLecturer, getDayLabel, dayOrder } from "@/lib/services/availability";
import { formatTime } from "@/lib/format";
import type { AvailabilityRule, DayOfWeek } from "@/lib/types";

const LECTURER_ID = "lec-1";

const availabilitySchema = z.object({
  dayOfWeek: z.string().min(1, "Select a day"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
  duration: z.string().min(1, "Select a duration"),
});

type AvailabilityValues = z.infer<typeof availabilitySchema>;

export default function LecturerAvailabilityPage() {
  const [rules, setRules] = React.useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AvailabilityRule | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
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

  React.useEffect(() => {
    getAvailabilityForLecturer(LECTURER_ID).then((data) => {
      setRules(data);
      setLoading(false);
    });
  }, []);

  const openAdd = () => {
    setEditing(null);
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
    reset({
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
      duration: String(rule.duration),
    });
    setDialogOpen(true);
  };

  const onSubmit = () => {
    const day = watch("dayOfWeek") as DayOfWeek;
    const start = watch("startTime");
    const end = watch("endTime");
    const duration = parseInt(watch("duration"), 10);

    if (editing) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...r, dayOfWeek: day, startTime: start, endTime: end, duration }
            : r,
        ),
      );
    } else {
      const newRule: AvailabilityRule = {
        id: `avail-${Date.now()}`,
        lecturerId: LECTURER_ID,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        duration,
        breaks: [],
        unavailableDates: [],
      };
      setRules((prev) => [...prev, newRule]);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setRules((prev) => prev.filter((r) => r.id !== deleteId));
    setDeleteId(null);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Availability" />
        <LoadingState rows={3} />
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
              Break periods and unavailable dates can be added later.
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Save changes" : "Add slot"}</Button>
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
    </div>
  );
}
