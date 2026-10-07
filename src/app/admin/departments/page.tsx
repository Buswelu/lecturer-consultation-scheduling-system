"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Building2, Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from "@/lib/services/users";
import { formatDate } from "@/lib/format";
import type { Department } from "@/lib/types";

const deptSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters"),
  description: z.string().optional(),
});

type DeptValues = z.infer<typeof deptSchema>;

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Department | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DeptValues>({
    resolver: zodResolver(deptSchema),
    defaultValues: { name: "", code: "", description: "" },
  });

  React.useEffect(() => {
    getDepartments().then((data) => {
      setDepartments(data);
      setLoading(false);
    });
  }, []);

  const openAdd = () => {
    setEditing(null);
    setFormError(null);
    reset({ name: "", code: "", description: "" });
    setDialogOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setFormError(null);
    reset({
      name: dept.name,
      code: dept.code,
      description: dept.description ?? "",
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: DeptValues) => {
    setFormError(null);
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateDepartment(editing.id, {
          name: values.name,
          code: values.code || null,
          description: values.description || null,
        });
        setDepartments((prev) => prev.map((d) => (d.id === editing.id ? updated : d)));
      } else {
        const created = await createDepartment({
          name: values.name,
          code: values.code || undefined,
          description: values.description || undefined,
        });
        setDepartments((prev) => [...prev, created]);
      }
      setDialogOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the department.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setFormError(null);
    try {
      await deleteDepartment(deleteId);
      setDepartments((prev) => prev.filter((d) => d.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not delete the department.");
      setDeleteId(null);
    }
  };

  const handleToggle = async (dept: Department) => {
    const next = dept.status === "active" ? false : true;
    try {
      const updated = await updateDepartment(dept.id, { isActive: next });
      setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
    } catch {
      // Keep existing state on failure.
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Departments" />
        <LoadingState rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Manage academic departments."
        action={
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        }
      />

      {departments.length === 0 ? (
        <EmptyState
          title="No departments"
          description="Add your first department to get started."
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add Department
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((dept) => (
            <Card key={dept.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <Badge variant={dept.status === "active" ? "success" : "neutral"}>
                    {dept.status}
                  </Badge>
                </div>
                <h3 className="mt-4 font-semibold">{dept.name}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Code: {dept.code}
                </p>
                {dept.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {dept.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Created {formatDate(dept.createdAt)}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(dept)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggle(dept)}>
                    {dept.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(dept.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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
            <DialogTitle>{editing ? "Edit Department" : "Add Department"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the department details." : "Create a new department."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Department name</Label>
              <Input id="name" placeholder="e.g. Computer Science" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" placeholder="e.g. CS" {...register("code")} />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
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
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Save changes" : "Add department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete department?"
        description="Are you sure you want to delete this department? Users and courses in this department may be affected."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}