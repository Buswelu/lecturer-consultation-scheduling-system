"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BookOpen, Plus, Pencil } from "lucide-react";
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
import { getDepartments, getCourses, getUsers } from "@/lib/services/users";
import {
  createCourse,
  updateCourse,
  assignLecturerToCourse,
  unassignLecturerFromCourse,
} from "@/lib/services/courses";
import type { Department, Course } from "@/lib/types";
import type { UserWithDepartment } from "@/lib/services/users";

const courseSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters"),
  departmentId: z.string().min(1, "Select a department"),
  credits: z.string().optional(),
  description: z.string().optional(),
  lecturerIds: z.array(z.string()).optional(),
});

type CourseValues = z.infer<typeof courseSchema>;

export default function AdminCoursesPage() {
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [lecturers, setLecturers] = React.useState<UserWithDepartment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Course | null>(null);
  const [assignedLecturers, setAssignedLecturers] = React.useState<string[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: "",
      code: "",
      departmentId: "",
      credits: "3",
      description: "",
      lecturerIds: [],
    },
  });

  React.useEffect(() => {
    Promise.all([getCourses(), getDepartments(), getUsers({ role: "lecturer" })]).then(
      ([c, d, l]) => {
        setCourses(c);
        setDepartments(d);
        setLecturers(l);
        setLoading(false);
      },
    );
  }, []);

  const openAdd = () => {
    setEditing(null);
    setAssignedLecturers([]);
    setFormError(null);
    reset({
      title: "",
      code: "",
      departmentId: "",
      credits: "3",
      description: "",
      lecturerIds: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setAssignedLecturers(course.lecturerIds);
    setFormError(null);
    reset({
      title: course.title,
      code: course.code,
      departmentId: course.departmentId,
      credits: String(course.credits ?? 3),
      description: course.description ?? "",
      lecturerIds: course.lecturerIds,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: CourseValues) => {
    setFormError(null);
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateCourse(editing.id, {
          title: values.title,
          code: values.code,
          departmentId: values.departmentId,
          description: values.description,
          credits: values.credits ? parseInt(values.credits, 10) : undefined,
        });
        // Sync assignments: add new links, remove dropped ones.
        const before = new Set(editing.lecturerIds);
        const after = new Set(assignedLecturers);
        for (const id of after) {
          if (!before.has(id)) await assignLecturerToCourse(editing.id, id);
        }
        for (const id of before) {
          if (!after.has(id)) await unassignLecturerFromCourse(editing.id, id);
        }
        const refreshed = { ...updated, lecturerIds: [...assignedLecturers] };
        setCourses((prev) => prev.map((c) => (c.id === editing.id ? refreshed : c)));
      } else {
        const created = await createCourse(
          {
            title: values.title,
            code: values.code,
            departmentId: values.departmentId,
            description: values.description,
            credits: values.credits ? parseInt(values.credits, 10) : undefined,
          },
        );
        for (const id of assignedLecturers) {
          await assignLecturerToCourse(created.id, id);
        }
        setCourses((prev) => [...prev, { ...created, lecturerIds: [...assignedLecturers] }]);
      }
      setDialogOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the course.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (course: Course) => {
    try {
      const updated = await updateCourse(course.id, {
        isActive: course.status !== "active",
      });
      setCourses((prev) => prev.map((c) => (c.id === course.id ? updated : c)));
    } catch {
      // Keep existing state on failure.
    }
  };

  const toggleLecturer = (id: string) => {
    setAssignedLecturers((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Courses" />
        <LoadingState rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description="Manage courses and their assigned lecturers."
        action={
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Course
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses"
          description="Add your first course to get started."
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Course
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                  {departments.find((d) => d.id === course.departmentId)?.name ?? "—"} · {course.credits} credits
                </p>
                {course.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {course.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {course.lecturerIds.map((id) => (
                    <Badge key={id} variant="outline" className="text-xs">
                      {lecturers.find((l) => l.id === id)?.fullName ?? "Unknown"}
                    </Badge>
                  ))}
                  {course.lecturerIds.length === 0 && (
                    <span className="text-xs text-muted-foreground">No lecturers assigned</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => openEdit(course)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 ml-2"
                  onClick={() => handleToggleActive(course)}
                >
                  {course.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Course" : "Add Course"}</DialogTitle>
            <DialogDescription>Configure the course details and lecturers.</DialogDescription>
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
            <div className="grid grid-cols-2 gap-4">
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
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.departmentId && (
                  <p className="text-sm text-destructive">{errors.departmentId.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="credits">Credits</Label>
                <Input id="credits" type="number" min={1} max={6} {...register("credits")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assigned Lecturers</Label>
              <div className="flex flex-wrap gap-2">
                {lecturers.map((l) => {
                  const isAssigned = assignedLecturers.includes(l.id);
                  return (
                    <Button
                      key={l.id}
                      type="button"
                      size="sm"
                      variant={isAssigned ? "default" : "outline"}
                      onClick={() => toggleLecturer(l.id)}
                    >
                      {l.fullName}
                    </Button>
                  );
                })}
              </div>
              {lecturers.length === 0 && (
                <p className="text-xs text-muted-foreground">No lecturers available.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder="Short description..."
                {...register("description")}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Add course"}
              </Button>
            </DialogFooter>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}