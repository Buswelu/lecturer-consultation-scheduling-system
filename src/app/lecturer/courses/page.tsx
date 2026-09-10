"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BookOpen, Users, Plus, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ErrorState } from "@/components/error-state";
import { useLecturerIdentity } from "@/hooks/useSessionIds";
import {
  getCoursesByLecturer,
  createCourse,
  updateCourse,
} from "@/lib/services/courses";
import { getDepartments } from "@/lib/services/users";
import { getAppointmentsByLecturer } from "@/lib/services/appointments";
import type { Course, Department } from "@/lib/types";

const courseSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters"),
  departmentId: z.string().min(1, "Select a department"),
  description: z.string().max(500, "Description is too long").optional(),
});

type CourseValues = z.infer<typeof courseSchema>;

export default function LecturerCoursesPage() {
  const { loading: identityLoading, lecturerId } = useLecturerIdentity();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [apptCounts, setApptCounts] = React.useState<Record<string, number>>({});
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: { title: "", code: "", departmentId: "", description: "" },
  });

  const load = React.useCallback(async () => {
    if (!lecturerId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [mine, deps, appts] = await Promise.all([
        getCoursesByLecturer(lecturerId),
        getDepartments(),
        getAppointmentsByLecturer(lecturerId).catch(() => []),
      ]);
      setCourses(mine);
      setDepartments(deps);
      const counts: Record<string, number> = {};
      appts.forEach((a) => {
        counts[a.courseId] = (counts[a.courseId] ?? 0) + 1;
      });
      setApptCounts(counts);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [lecturerId]);

  React.useEffect(() => {
    if (!identityLoading) {
      if (!lecturerId) {
        setLoading(false);
        setLoadError(true);
      } else {
        load();
      }
    }
  }, [identityLoading, lecturerId, load]);

  const deptNames = React.useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const openAdd = () => {
    setEditing(null);
    setFormError(null);
    reset({ title: "", code: "", departmentId: "", description: "" });
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setFormError(null);
    reset({
      title: course.title,
      code: course.code,
      departmentId: course.departmentId,
      description: course.description ?? "",
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: CourseValues) => {
    if (!lecturerId) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const updated = await updateCourse(editing.id, {
          title: values.title.trim(),
          code: values.code.trim(),
          departmentId: values.departmentId,
          description: values.description?.trim() || "",
        });
        setCourses((prev) => prev.map((c) => (c.id === editing.id ? updated : c)));
      } else {
        const created = await createCourse(
          {
            title: values.title.trim(),
            code: values.code.trim().toUpperCase(),
            departmentId: values.departmentId,
            description: values.description?.trim() || undefined,
          },
          lecturerId,
        );
        setCourses((prev) => [...prev, created]);
      }
      setDialogOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the course.");
    } finally {
      setSaving(false);
    }
  };

  if (identityLoading || loading) {
    return (
      <div>
        <PageHeader title="My Courses" />
        <LoadingState rows={3} />
      </div>
    );
  }

  if (loadError || !lecturerId) {
    return (
      <div>
        <PageHeader title="My Courses" />
        <ErrorState
          title="Could not load courses"
          description="Please check your connection and try again."
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Courses"
        description="Create courses you teach — they appear to students immediately in Find a Lecturer."
        action={
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Course
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="Create your first course so students can find and book you."
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Course
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary">{course.code}</Badge>
                </div>
                <h3 className="mt-4 font-semibold">{course.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {deptNames.get(course.departmentId) ?? "Department"}
                </p>
                {course.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {course.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {apptCounts[course.id] ?? 0} consultations
                  </span>
                  <Button size="sm" variant="outline" onClick={() => openEdit(course)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Course" : "Add Course"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the course details."
                : "Create a new course. It will be assigned to you and visible to students right away."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Course title</Label>
                <Input id="title" placeholder="e.g. Database Systems" {...register("title")} />
                {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Course code</Label>
                <Input id="code" placeholder="e.g. CS301" {...register("code")} />
                {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={watch("departmentId")}
                onValueChange={(v) => setValue("departmentId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments
                    .filter((d) => d.status === "active")
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.departmentId && (
                <p className="text-sm text-destructive">{errors.departmentId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="Short description students will see..."
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>
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
                {saving ? "Saving..." : editing ? "Save changes" : "Add course"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
