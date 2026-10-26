"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(80),
    email: z.email("Enter a valid email address."),
    password: z.string().min(8, "Use at least 8 characters.").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

/** Only allow same-site relative redirects after login. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const isLogin = mode === "login";

  const form = useForm<RegisterValues>({
    resolver: zodResolver((isLogin ? loginSchema : registerSchema) as typeof registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: LoginValues | RegisterValues) {
    setFormError(null);
    const result = isLogin
      ? await authClient.signIn.email({ email: values.email, password: values.password })
      : await authClient.signUp.email({
          name: (values as RegisterValues).name,
          email: values.email,
          password: values.password,
        });
    if (result.error) {
      setFormError(
        result.error.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : isLogin
            ? "Incorrect email or password."
            : (result.error.message ?? "Could not create your account."),
      );
      return;
    }
    router.replace(safeNext(searchParams.get("next")));
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isLogin ? "Welcome back" : "Create your account"}</CardTitle>
        <CardDescription>
          {isLogin ? "Sign in to see your finances." : "Start tracking your accounts, income and expenses."}
        </CardDescription>
      </CardHeader>
      <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <CardContent>
          <FieldGroup>
            {!isLogin && (
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
                <FieldError errors={[errors.name]} />
              </Field>
            )}
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>
            {!isLogin && (
              <Field data-invalid={!!errors.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...form.register("confirmPassword")}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>
            )}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link className="font-medium text-foreground underline underline-offset-4" href={isLogin ? "/register" : "/login"}>
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
