"use client";

import * as React from "react";
import { format, addDays, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONSULTATION_DURATION_MINUTES } from "@/lib/scheduling/config";
import {
  generateSlotsForDate,
  type AvailabilityWindow,
  type BreakWindow,
  type Slot,
} from "@/lib/scheduling/slots";
import type { AvailabilityException, AvailabilityRule } from "@/lib/types";
import { dayOrder } from "@/lib/services/availability";

// Canonical slot types live in the scheduling engine; re-exported so
// existing importers (`@/components/calendar/availability-calendar`) keep working.
export type { Slot, SlotStatus } from "@/lib/scheduling/slots";

interface AvailabilityCalendarProps {
  rules: AvailabilityRule[];
  bookedSlots?: { date: string; startTime: string; endTime: string; status?: "booked" | "pending" }[];
  /** Unavailable periods (Phase 4); subtract from generated slots. */
  exceptions?: AvailabilityException[];
  /** Default slot length; per-rule durations win when present. */
  durationMinutes?: number;
  onSelectSlot?: (slot: Slot) => void;
  selectedSlot?: Slot | null;
}

export function AvailabilityCalendar({
  rules,
  bookedSlots = [],
  exceptions = [],
  durationMinutes = CONSULTATION_DURATION_MINUTES,
  onSelectSlot,
  selectedSlot,
}: AvailabilityCalendarProps) {
  const today = startOfDay(new Date());
  const [weekOffset, setWeekOffset] = React.useState(0);

  const startDate = addDays(today, weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const slotsByDay = (() => {
    const result: Record<string, Slot[]> = {};

    weekDays.forEach((day) => {
      const dayKey = format(day, "yyyy-MM-dd");
      const weekday = day.getDay(); // 0=Sunday, local week grid
      const dayRules = rules.filter(
        (r) => dayOrder.indexOf(r.dayOfWeek) === (weekday + 6) % 7,
      );
      if (dayRules.length === 0) {
        result[dayKey] = [];
        return;
      }

      const blocking = bookedSlots
        .filter((b) =>
          b.date.includes("T") ? b.date.slice(0, 10) === dayKey : b.date === dayKey,
        )
        .map((b) => ({
          startTime: b.startTime,
          endTime: b.endTime,
          status: b.status ?? "booked",
        }));

      // Group rules by effective duration so mixed grids (e.g. 30-min and
      // 45-min rules) each generate correctly, then merge deterministically.
      const groups = new Map<number, { windows: AvailabilityWindow[]; breaks: BreakWindow[] }>();
      for (const rule of dayRules) {
        const duration = rule.duration || durationMinutes;
        let group = groups.get(duration);
        if (!group) {
          group = { windows: [], breaks: [] };
          groups.set(duration, group);
        }
        group.windows.push({ startTime: rule.startTime, endTime: rule.endTime });
        for (const b of rule.breaks ?? []) {
          group.breaks.push({ startTime: b.startTime, endTime: b.endTime });
        }
      }

      const merged: Slot[] = [];
      const seen = new Set<string>();
      for (const [duration, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
        const generated = generateSlotsForDate({
          date: dayKey,
          windows: group.windows,
          breaks: group.breaks,
          exceptions: exceptions.map((e) => ({
            startDatetime: e.startDatetime,
            endDatetime: e.endDatetime,
          })),
          appointments: blocking,
          durationMinutes: duration,
        });
        for (const slot of generated) {
          const key = `${slot.startTime}-${slot.endTime}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(slot);
        }
      }
      merged.sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
      result[dayKey] = merged;
    });

    return result;
  })();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Week of {format(startDate, "MMM d")}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {weekDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const slots = slotsByDay[dayKey] ?? [];

          if (slots.length === 0) {
            return (
              <div key={dayKey} className="rounded-lg border border-dashed p-3">
                <p className="mb-1 font-medium">{format(day, "EEEE, MMMM d")}</p>
                <p className="text-sm text-muted-foreground">No availability</p>
              </div>
            );
          }

          return (
            <div key={dayKey} className="rounded-lg border p-3">
              <p className="mb-2 font-medium">{format(day, "EEEE, MMMM d")}</p>
              <div className="flex flex-wrap gap-2">
                {slots.map((slot, i) => {
                  const isSelected =
                    selectedSlot?.date === slot.date &&
                    selectedSlot?.startTime === slot.startTime;

                  return (
                    <button
                      key={i}
                      disabled={slot.status !== "available"}
                      onClick={() => onSelectSlot?.(slot)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        slot.status === "available" &&
                          "border-primary/30 text-primary hover:bg-primary/10 hover:border-primary",
                        slot.status === "available" &&
                          isSelected &&
                          "bg-primary text-primary-foreground border-primary hover:bg-primary",
                        slot.status === "past" &&
                          "cursor-not-allowed border-muted bg-muted text-muted-foreground/50 line-through",
                        slot.status === "booked" &&
                          "cursor-not-allowed border-destructive/30 bg-destructive/10 text-destructive",
                        slot.status === "pending" &&
                          "cursor-not-allowed border-warning bg-amber-500/10 text-amber-700",
                        slot.status === "unavailable" &&
                          "cursor-not-allowed border-muted bg-muted/50 text-muted-foreground/40",
                      )}
                      aria-label={`${slot.startTime} - ${slot.endTime} ${slot.status}`}
                    >
                      {slot.startTime} - {slot.endTime}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Legend color="bg-primary" label="Available" />
        <Legend color="bg-destructive/20 border-destructive/30 text-destructive" label="Booked" />
        <Legend color="bg-amber-500/20 border-amber-500/30 text-amber-700" label="Pending" />
        <Legend color="bg-muted text-muted-foreground" label="Unavailable" />
        <Legend color="bg-muted text-muted-foreground line-through" label="Past" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("inline-block h-3 w-3 rounded border", color)} />
      {label}
    </div>
  );
}
