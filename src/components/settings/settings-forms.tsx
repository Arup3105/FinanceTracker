"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAppData } from "@/components/app/app-data-provider";
import { TextField } from "@/components/finance/fields";
import { handleFormError } from "@/components/finance/form-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, errorMessage } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import type { ExpenseTypeDTO } from "@/lib/finance/types";
import { settingsSchema, type SettingsInput } from "@/lib/validation/schemas";

// ---------------------------------------------------------------- profile

export function ProfileForm() {
  const { user } = useAppData();
  const router = useRouter();
  const form = useForm<{ name: string }>({
    resolver: zodResolver(z.object({ name: z.string().trim().min(1, "Enter your name.").max(80) })),
    defaultValues: { name: user.name },
  });

  async function onSubmit({ name }: { name: string }) {
    const { error } = await authClient.updateUser({ name });
    if (error) {
      toast.error("Could not update your profile.");
      return;
    }
    toast.success("Profile updated");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FieldGroup>
        <TextField control={form.control} name="name" label="Name" autoComplete="name" />
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" value={user.email} disabled readOnly />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
        Save profile
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- password

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Use at least 8 characters.").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

export function PasswordForm() {
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: z.infer<typeof passwordSchema>) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      form.setError("currentPassword", { message: error.status === 429 ? "Too many attempts. Try again later." : "Current password is incorrect." });
      return;
    }
    toast.success("Password changed. Other devices have been signed out.");
    form.reset();
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FieldGroup>
        <TextField control={form.control} name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
        <TextField control={form.control} name="newPassword" label="New password" type="password" autoComplete="new-password" />
        <TextField control={form.control} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
      </FieldGroup>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Change password
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- preferences

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Kolkata", "UTC"];
  }
}

export function PreferencesForm() {
  const { settings } = useAppData();
  const router = useRouter();
  const zones = useMemo(() => timeZones(), []);
  const form = useForm<SettingsInput>({ resolver: zodResolver(settingsSchema), defaultValues: settings });

  async function onSubmit(values: SettingsInput) {
    try {
      await apiRequest("/api/settings", { method: "PUT", body: values });
      toast.success("Preferences saved");
      form.reset(values);
      router.refresh();
    } catch (error) {
      handleFormError(form, error);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="currency">Currency</FieldLabel>
          <Controller
            control={form.control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="currency" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">Indian Rupee (₹ INR)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>All amounts are stored and shown in Indian Rupees.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="timezone">Time zone</FieldLabel>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="timezone" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription>Used to show times and to decide which day, month or year a transaction belongs to.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>ATM cash withdrawals</FieldLabel>
          <Controller
            control={form.control}
            name="cashWithdrawalMode"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-3">
                <Label className="flex items-start gap-3 rounded-lg border p-3 font-normal has-data-[state=checked]:border-primary">
                  <RadioGroupItem value="expense" className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block font-medium">Simple: count withdrawals as expenses (default)</span>
                    <span className="block text-sm text-muted-foreground">
                      The cash is treated as spent when you withdraw it. Don&apos;t record what you buy with that cash again,
                      or it will be counted twice.
                    </span>
                  </span>
                </Label>
                <Label className="flex items-start gap-3 rounded-lg border p-3 font-normal has-data-[state=checked]:border-primary">
                  <RadioGroupItem value="transfer" className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block font-medium">Detailed: move withdrawals into a cash account</span>
                    <span className="block text-sm text-muted-foreground">
                      The withdrawal is a transfer (not spending). Record each cash purchase as an expense from your Cash
                      account.
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            )}
          />
          <FieldDescription>Changing this only affects new withdrawals.</FieldDescription>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
        Save preferences
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- expense types

function ExpenseTypeRow({ type }: { type: ExpenseTypeDTO }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(type.name);
  const [busy, setBusy] = useState(false);

  async function run(request: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await request();
      toast.success(success);
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2 py-2">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => apiRequest(`/api/expense-types/${type.id}`, { method: "PATCH", body: { name } }), "Renamed");
          }}
        >
          <Input aria-label="Expense type name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          <Button type="submit" size="icon" variant="ghost" aria-label="Save" disabled={busy || !name.trim()}>
            <Check />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => { setEditing(false); setName(type.name); }}>
            <X />
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm">
            {type.name} {type.isArchived && <Badge variant="outline" className="ml-1">Archived</Badge>}
          </span>
          <Button size="icon" variant="ghost" aria-label={`Rename ${type.name}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={type.isArchived ? `Restore ${type.name}` : `Archive ${type.name}`}
            disabled={busy}
            onClick={() =>
              void run(
                () => apiRequest(`/api/expense-types/${type.id}`, { method: "PATCH", body: { isArchived: !type.isArchived } }),
                type.isArchived ? "Restored" : "Archived",
              )
            }
          >
            {type.isArchived ? <ArchiveRestore /> : <Archive />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`Delete ${type.name}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{type.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Only unused expense types can be deleted. If expenses use it, archive it instead so your history stays intact.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void run(() => apiRequest(`/api/expense-types/${type.id}`, { method: "DELETE" }), "Deleted")}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}

export function ExpenseTypeManager() {
  const { expenseTypes } = useAppData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiRequest("/api/expense-types", { method: "POST", body: { name } });
      toast.success("Expense type added");
      setName("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <Input
          aria-label="New expense type"
          placeholder="New expense type, e.g. Pets"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus /> Add
        </Button>
      </form>
      <ul className="divide-y">
        {expenseTypes.map((type) => (
          <ExpenseTypeRow key={type.id} type={type} />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- danger zone

export function DeleteDataButton() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await apiRequest("/api/data", { method: "DELETE", body: { confirm } });
      toast.success("All financial data deleted");
      setConfirm("");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog onOpenChange={() => setConfirm("")}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete all financial data</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all financial data?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes every account, transaction, expense type and preference. Your login stays. Export
            your data first if you may need it. Type DELETE to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input aria-label="Type DELETE to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy || confirm !== "DELETE"}
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            {busy ? "Deleting…" : "Delete everything"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteAccountButton() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.status === 429 ? "Too many attempts. Try again later." : "Password is incorrect.");
      return;
    }
    toast.success("Your account has been deleted");
    router.replace("/");
    router.refresh();
  }

  return (
    <AlertDialog onOpenChange={() => setPassword("")}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-destructive text-destructive">
          Delete my account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            Your login and all of your financial data will be permanently deleted. Enter your password to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          type="password"
          aria-label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy || !password}
            onClick={(e) => {
              e.preventDefault();
              void remove();
            }}
          >
            {busy ? "Deleting…" : "Delete account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
