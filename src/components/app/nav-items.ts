import {
  ArrowLeftRight,
  BarChart3,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The five primary sections. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/income", label: "Income", icon: TrendingUp },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/settings", label: "Profile & Settings", icon: Settings },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];
