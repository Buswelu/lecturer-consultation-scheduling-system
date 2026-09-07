"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Camera, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/services/users";
import { departments } from "@/lib/mock-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/lib/types";

const profileSchema = z.object({
  fullName: z.string().min(3, "Name must be at least 3 characters"),
  phone: z.string().min(7, "Please enter a valid phone number").optional().or(z.literal("")),
  departmentId: z.string().optional(),
  programme: z.string().optional(),
  office: z.string().optional(),
  bio: z.string().max(500, "Bio must be under 500 characters").optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  role: UserRole;
}

export function ProfileForm({ role }: ProfileFormProps) {
  const user = getCurrentUser(role);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [photo, setPhoto] = React.useState<string | null>(user.photoUrl ?? null);

  const isStudent = role === "student";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user.fullName,
      phone: user.phone ?? "",
      departmentId: user.departmentId ?? "",
      programme: isStudent && "programme" in user ? user.programme ?? "" : undefined,
      office: !isStudent && "office" in user ? user.office ?? "" : undefined,
      bio: !isStudent && "bio" in user ? user.bio ?? "" : undefined,
    },
  });

  const activeDepartments = departments.filter((d) => d.status === "active");

  const onSubmit = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setPhoto(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>Update your profile picture</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar src={photo ?? undefined} alt={user.fullName} fallback={user.fullName} size="lg" />
          <div>
            <label
              htmlFor="photo"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Camera className="h-4 w-4" />
              Upload Photo
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePhotoUpload}
            />
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          {isStudent && (
            <div className="space-y-2">
              <Label>Email</Label>
              <Input defaultValue={user.email} disabled />
              <p className="text-xs text-muted-foreground">Email changes require verification.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="+233 XX XXX XXXX" {...register("phone")} />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Select
              value={watch("departmentId") ?? ""}
              onValueChange={(v) => setValue("departmentId", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {activeDepartments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isStudent && (
            <div className="space-y-2">
              <Label htmlFor="programme">Programme</Label>
              <Input id="programme" placeholder="e.g. BSc Computer Science" {...register("programme")} />
            </div>
          )}

          {!isStudent && (
            <div className="space-y-2">
              <Label htmlFor="office">Office</Label>
              <Input id="office" placeholder="e.g. CS Building, Room 304" {...register("office")} />
            </div>
          )}

          {!isStudent && (
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                rows={4}
                placeholder="Tell students about yourself..."
                {...register("bio")}
              />
              {errors.bio && (
                <p className="text-sm text-destructive">{errors.bio.message}</p>
              )}
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <p className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved successfully
              </p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
