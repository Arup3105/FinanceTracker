import Link from "next/link";
import { Suspense } from "react";
import { Wallet } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { MobileMenu } from "@/components/app/mobile-menu";
import { MobileTabBar, SidebarNav } from "@/components/app/sidebar-nav";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh w-full">
      {/* Static chrome: prerendered, no user data. */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-4" />
          </span>
          Finance Tracker
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-6">
          <div className="absolute left-4 top-4 md:hidden">
            <MobileMenu />
          </div>
          {/* Request-time content: session, user data and the page itself. */}
          <Suspense
            fallback={
              <>
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="size-8 rounded-full" />
                </div>
                <div className="mt-6">
                  <PageSkeleton />
                </div>
              </>
            }
          >
            <AppShell>{children}</AppShell>
          </Suspense>
        </div>
      </div>
      <MobileTabBar />
    </div>
  );
}
