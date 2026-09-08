"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: (inputValue?: string) => void;
  loading?: boolean;
  /** Optional free-text input (e.g. rejection reason). Value passed to onConfirm. */
  input?: {
    label?: string;
    placeholder?: string;
    required?: boolean;
    defaultValue?: string;
  };
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  loading = false,
  input,
}: ConfirmationDialogProps) {
  // Uncontrolled input keyed by open state: remounts (and resets) every
  // time the dialog opens — no effect needed.
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {input && (
          <div className="space-y-2">
            {input.label && <Label>{input.label}</Label>}
            <Textarea
              key={open ? "open" : "closed"}
              ref={inputRef}
              placeholder={input.placeholder}
              defaultValue={input.defaultValue ?? ""}
              rows={3}
              disabled={loading}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm(input ? inputRef.current?.value.trim() || undefined : undefined);
            }}
            disabled={loading}
            className={variant === "destructive" ? "bg-destructive text-white hover:bg-destructive/90" : ""}
          >
            {loading ? "Loading..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
