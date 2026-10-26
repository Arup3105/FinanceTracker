import { loadAppContext } from "@/server/app-context";
import { AppDataProvider } from "./app-data-provider";
import { QuickAdd } from "./quick-add";
import { UserMenu } from "./user-menu";

/**
 * Request-time part of the authenticated layout: verifies the session, loads
 * shared reference data, and renders the header actions around the page.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const { user, accounts, expenseTypes, settings } = await loadAppContext();
  return (
    <AppDataProvider value={{ user, accounts, expenseTypes, settings }}>
      <div className="flex items-center justify-end gap-2">
        <QuickAdd compact />
        <UserMenu />
      </div>
      <div className="mt-6">{children}</div>
    </AppDataProvider>
  );
}
