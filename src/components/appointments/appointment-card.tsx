"use client";

import Link from "next/link";
import { CalendarDays, Clock, MapPin, Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/appointments/appointment-status";
import { formatDate, formatTime } from "@/lib/format";
import {
  getLecturerName,
  getCourseName,
} from "@/lib/services/lecturers";
import type { Appointment } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AppointmentCardProps {
  appointment: Appointment;
  detailsUrl: string;
  showActions?: boolean;
  onCancel?: (id: string) => void;
  onReschedule?: (id: string) => void;
  compact?: boolean;
}

export function AppointmentCard({
  appointment,
  detailsUrl,
  showActions = true,
  onCancel,
  onReschedule,
  compact = false,
}: AppointmentCardProps) {
  const canCancel = ["pending", "approved", "rescheduled"].includes(appointment.status);
  const canReschedule = ["pending", "approved"].includes(appointment.status);

  return (
    <Card>
      <CardContent className={cn("p-5", compact && "p-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{getLecturerName(appointment.lecturerId)}</h3>
              <StatusBadge status={appointment.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{getCourseName(appointment.courseId)}</p>
          </div>
          {!compact && appointment.type === "online" && (
            <Badge variant="outline" className="shrink-0">
              <Video className="mr-1 h-3 w-3" />
              Online
            </Badge>
          )}
        </div>

        <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            {formatDate(appointment.date)}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
          </p>
          {appointment.type === "in-person" && appointment.location && (
            <p className="flex items-center gap-1.5 sm:col-span-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {appointment.location}
            </p>
          )}
        </div>

        {!compact && appointment.reason && (
          <p className="mt-3 line-clamp-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Reason:</span> {appointment.reason}
          </p>
        )}

        {showActions && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={detailsUrl}>View Details</Link>
            </Button>
            {canReschedule && onReschedule && (
              <Button size="sm" variant="outline" onClick={() => onReschedule(appointment.id)}>
                Reschedule
              </Button>
            )}
            {canCancel && onCancel && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onCancel(appointment.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
