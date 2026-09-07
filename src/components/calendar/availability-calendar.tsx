"use client";

import * as React from "react";
import { format, addDays, isBefore, startOfDay, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailabilityRule, DayOfWeek } from "@/lib/types";
import { dayOrder } from "@/lib/services/availability";

export interface Slot {
  date: string;
  startTime: string;
  endTime: string;
  status: "available" | "booked" | "pending" | "past" | "unavailable";
}

interface AvailabilityCalendarProps {
  rules: AvailabilityRule[];
  bookedSlots?: { date: string; startTime: string; endTime: string; status?: "booked" | "pending" }[];
  onSelectSlot?: (slot: Slot) => void;
  selectedSlot?: Slot | null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function dayNameToIndex(day: DayOfWeek): number {
  const map: Record<DayOfWeek, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[day];
}

export function AvailabilityCalendar({
  rules,
  bookedSlots = [],
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
      const dayName = dayOrder.find(
        (d) => dayNameToIndex(d) === day.getDay(),
      );
      const dayKey = format(day, "yyyy-MM-dd");
      if (!dayName) return;

      const rule = rules.find((r) => r.dayOfWeek === dayName);
      if (!rule) {
        result[dayKey] = [];
        return;
      }

      const slots: Slot[] = [];
      const startMin = timeToMinutes(rule.startTime);
      const endMin = timeToMinutes(rule.endTime);
      const breakRanges = (rule.breaks ?? []).map((b) => ({
        start: timeToMinutes(b.startTime),
        end: timeToMinutes(b.endTime),
      }));

      for (let t = startMin; t + rule.duration <= endMin; t += rule.duration) {
        const slotStart = minutesToTime(t);
        const slotEnd = minutesToTime(t + rule.duration);

        const inBreak = breakRanges.some(
          (br) => !(t + rule.duration <= br.start || t >= br.end),
        );
        if (inBreak) {
          slots.push({
            date: dayKey,
            startTime: slotStart,
            endTime: slotEnd,
            status: "unavailable",
          });
          continue;
        }

        const isPast = isBefore(day, today) || (format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd") && timeToMinutes(format(new Date(), "HH:mm")) >= t + rule.duration);
        if (isPast) {
          slots.push({
            date: dayKey,
            startTime: slotStart,
            endTime: slotEnd,
            status: "past",
          });
          continue;
        }

        const booked = bookedSlots.find(
          (b) =>
            b.date.startsWith(dayKey) && format(parseISO(b.date), "HH:mm") === slotStart,
        );

        if (booked) {
          slots.push({
            date: dayKey,
            startTime: slotStart,
            endTime: slotEnd,
            status: booked.status === "pending" ? "pending" : "booked",
          });
        } else {
          slots.push({
            date: dayKey,
            startTime: slotStart,
            endTime: slotEnd,
            status: "available",
          });
        }
      }
      result[dayKey] = slots;
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
