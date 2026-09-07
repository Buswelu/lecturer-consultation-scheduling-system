import { getSupabase } from "@/lib/supabase/client";
import { availabilityRules } from "@/lib/mock-data";
import type { AvailabilityRule, BreakPeriod, DayOfWeek } from "@/lib/types";

const IS_MOCK = true;

export interface AvailabilityInput {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  duration: number;
  breaks?: BreakPeriod[];
}

export async function getAvailabilityForLecturer(lecturerId: string): Promise<AvailabilityRule[]> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("availability_rules")
        .select("*")
        .eq("lecturer_id", lecturerId);
      if (error) throw error;
      return data as AvailabilityRule[];
    }
  }
  return availabilityRules.filter((a) => a.lecturerId === lecturerId);
}

export async function addAvailability(
  lecturerId: string,
  input: AvailabilityInput,
): Promise<AvailabilityRule> {
  if (!IS_MOCK) {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("availability_rules")
        .insert({
          lecturer_id: lecturerId,
          day_of_week: input.dayOfWeek,
          start_time: input.startTime,
          end_time: input.endTime,
          duration: input.duration,
          breaks: input.breaks ?? [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as AvailabilityRule;
    }
  }

  return {
    id: `avail-${Date.now()}`,
    lecturerId,
    ...input,
    unavailableDates: [],
  };
}

export function getDayLabel(day: DayOfWeek): string {
  const labels: Record<DayOfWeek, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };
  return labels[day];
}

export const dayOrder: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
