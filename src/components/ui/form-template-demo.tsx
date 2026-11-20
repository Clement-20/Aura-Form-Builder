"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import {
  Form,
  Field,
  FieldLabel,
  FieldError,
  Input,
  Button,
} from "@/components/ui/form";

interface FormDefaultProps {
  compact?: boolean;
  onSubmittedEmail?: (email: string) => void;
}

export default function FormDefault({
  compact = false,
  onSubmittedEmail,
}: FormDefaultProps) {
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") || "").trim();
    setLoading(true);
    setSubmittedEmail(null);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSubmittedEmail(email);
    onSubmittedEmail?.(email);
  };

  return (
    <div
      className={
        compact
          ? "flex w-full items-center justify-center rounded-2xl bg-background p-4 sm:p-5 ring-1 ring-black/[0.06]"
          : "flex min-h-[320px] w-full items-center justify-center bg-background p-8"
      }
    >
      <Form className="w-full max-w-xs" onSubmit={onSubmit}>
        <Field name="email">
          <FieldLabel>Email</FieldLabel>
          <Input placeholder="you@example.com" required type="email" />
          <FieldError>Please enter a valid email.</FieldError>
        </Field>
        <Button loading={loading} type="submit">
          Submit
        </Button>

        {submittedEmail && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-[#0F766E] ring-1 ring-[#0F766E]/20">
            <CheckCircle2Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">Captured: {submittedEmail}</span>
          </div>
        )}
      </Form>
    </div>
  );
}
