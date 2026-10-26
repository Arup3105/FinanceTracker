import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  DeleteAccountButton,
  DeleteDataButton,
  ExpenseTypeManager,
  PasswordForm,
  PreferencesForm,
  ProfileForm,
} from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Profile & Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Profile & Settings" description="Your profile, preferences, expense types and data." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs you out on other devices.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>

        <Card id="preferences" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <PreferencesForm />
          </CardContent>
        </Card>

        <Card id="expense-types">
          <CardHeader>
            <CardTitle>Expense types</CardTitle>
            <CardDescription>
              Broad categories for your expenses. You type each expense&apos;s name yourself; the type groups them in reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpenseTypeManager />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Add, rename, correct or archive your bank accounts, cash and cards.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href="/accounts">Manage accounts</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export & backup</CardTitle>
              <CardDescription>
                Download your records as CSV (opens in Excel or Google Sheets). Free database tiers have no guaranteed
                backups, so export regularly and keep a copy.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href="/api/export?type=transactions">
                  <Download /> All transactions
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/api/export?type=report&period=year">
                  <Download /> This year&apos;s report
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How amounts are counted</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Refunds</span> reduce the original expense (₹1,000 with a
                ₹300 refund counts as ₹700). They are never counted as income.
              </p>
              <p>
                <span className="font-medium text-foreground">Credit cards:</span> each purchase is an expense when you
                make it. Paying the card bill is a transfer from your bank account to the card, not another expense.
              </p>
              <p>
                <span className="font-medium text-foreground">Opening balances and transfers</span> change balances but
                never count as income, expenses or savings.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-destructive/40 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>These actions are permanent.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <DeleteDataButton />
            <DeleteAccountButton />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
