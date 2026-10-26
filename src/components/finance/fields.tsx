"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/lib/money";
import type { AccountDTO } from "@/lib/finance/types";

/** Shared, accessible form fields wired to react-hook-form. */

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...input
}: BaseProps<T> & Omit<React.ComponentProps<typeof Input>, "name">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input id={name} aria-invalid={fieldState.invalid} {...input} {...field} value={field.value ?? ""} />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function AmountField<T extends FieldValues>(props: BaseProps<T> & { allowNegative?: boolean }) {
  const { allowNegative, ...rest } = props;
  return (
    <TextField
      {...rest}
      inputMode="decimal"
      autoComplete="off"
      placeholder={allowNegative ? "0.00 (use - for negative)" : "0.00"}
    />
  );
}

export function DateTimeField<T extends FieldValues>(props: BaseProps<T> & { timezone: string }) {
  const { timezone, description, ...rest } = props;
  return (
    <TextField
      {...rest}
      type="datetime-local"
      description={description ?? `Time zone: ${timezone}. Change it to record an earlier transaction.`}
    />
  );
}

export function TextAreaField<T extends FieldValues>({ control, name, label, description }: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Textarea id={name} rows={2} aria-invalid={fieldState.invalid} {...field} value={field.value ?? ""} />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  options,
}: BaseProps<T> & { placeholder: string; options: Array<{ value: string; label: string; hint?: string }> }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger id={name} aria-invalid={fieldState.invalid} className="w-full" onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span>{option.label}</span>
                  {option.hint && <span className="ml-auto pl-2 text-xs text-muted-foreground">{option.hint}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function accountOptions(accounts: AccountDTO[]) {
  return accounts.map((a) => ({ value: a.id, label: a.name, hint: formatINR(a.balancePaise) }));
}
