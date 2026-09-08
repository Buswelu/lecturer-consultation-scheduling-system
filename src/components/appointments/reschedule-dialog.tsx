"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/loading-state";
import { formatTime } from "@/lib/format";
import { getAvailableSlots, type Slot } from "@/lib/services/availability";
import { addDaysYMD, todayYMD } from "@/lib/scheduling/datetime";
import type { Appointment } from "@/lib/types";

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  onConfirm: (slot: { date: string; startTime: string; endTime: string }) => void | Promise<void>;
  confirming?: boolean;
  error?: string | null;
}

/**
 * Lecturer "suggest another time" dialog: pick a new available slot for an
 * existing appointment. Slots come from the shared generator (exceptions,
 * existing appointments and past times excluded).
 */
export function RescheduleDialog({
  open,
  onOpenChange,
  appointment,
  onConfirm,
  confirming = false,
  error = null,
}: RescheduleDialogProps) {
  const [slotsByDate, setSlotsByDate] = React.useState<Record<string, Slot[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [date, setDate] = React.useState("");
  const [selected, setSelected] = React.useState<Slot | null>(null);

  React.useEffect(() => {
    if (!open || !appointment) return;
    let cancelled = false;
    const today = todayYMD();
    getAvailableSlots({
      lecturerId: appointment.lecturerId,
      from: today,
      to: addDaysYMD(today, 30),
      excludeAppointmentId: appointment.id,
    })
      .then((map) => {
        if (cancelled) return;
        setSlotsByDate(map);
        const first = Object.keys(map)
          .sort()
          .find((d) => map[d].some((s) => s.status === "available"));
        if (first) setDate(first);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSlotsByDate({});
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, appointment]);

  const dates = React.useMemo(
    () =>
      Object.keys(slotsByDate)
        .sort()
        .filter((d) => slotsByDate[d].some((s) => s.status === "available")),
    [slotsByDate],
  );
  const daySlots = (date ? slotsByDate[date] : null) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Suggest another time</DialogTitle>
          <DialogDescription>
            Choose a new available slot. The student will be notified and the
            appointment marked as rescheduled.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <LoadingState rows={3} />
        ) : dates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No available slots in the next 30 days.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New date</Label>
              <Select value={date} onValueChange={(v) => { setDate(v); setSelected(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a date" />
                </SelectTrigger>
                <SelectContent>
                  {dates.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>New time slot</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {daySlots.map((slot) => {
                  const disabled = slot.status !== "available";
                  const isSelected =
                    selected?.date === slot.date && selected?.startTime === slot.startTime;
                  return (
                    <Button
                      key={`${slot.startTime}-${slot.endTime}`}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      disabled={disabled}
                      onClick={() => setSelected(slot)}
                      className={disabled ? "opacity-50 line-through" : ""}
                    >
                      {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                    </Button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selected || confirming}
            onClick={() =>
              selected &&
              onConfirm({
                date: selected.date,
                startTime: selected.startTime,
                endTime: selected.endTime,
              })
            }
          >
            {confirming ? "Saving..." : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
