"use client";

import * as React from "react";
import { useState } from "react";
import { CheckCircle2, Building2 } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allowOnline, setAllowOnline] = useState(true);
  const [autoReminders, setAutoReminders] = useState(true);
  const [institutionName, setInstitutionName] = useState("University of Technolog");

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs items={[{ label: "Settings" }]} />
      <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Institution Settings</CardTitle>
          <CardDescription>General system configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="institutionName">Institution name</Label>
            <Input
              id="institutionName"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="e.g. University of Technology"
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Used in emails and system messaging.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consultation Policies</CardTitle>
          <CardDescription>System-wide consultation rules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow online consultations</p>
              <p className="text-sm text-muted-foreground">Enable online consultation type</p>
            </div>
            <Switch checked={allowOnline} onCheckedChange={setAllowOnline} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Automatic reminders</p>
              <p className="text-sm text-muted-foreground">
                Send reminder notifications before appointments
              </p>
            </div>
            <Switch checked={autoReminders} onCheckedChange={setAutoReminders} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <p className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Settings saved
          </p>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}