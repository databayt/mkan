"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Bus,
  CalendarRange,
  CreditCard,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NAVBAR_HEIGHT } from "@/lib/constants";

type AdminSidebarProps = {
  lang: string;
  labels: {
    platform: string;
    overview: string;
    users: string;
    homes: string;
    transport: string;
    bookings: string;
    payments: string;
    settings: string;
    header: string;
  };
};

export function AdminSidebar({ lang, labels }: AdminSidebarProps) {
  const pathname = usePathname();

  const base = `/${lang}/admin`;
  const items = [
    { icon: BarChart3, label: labels.overview, href: base },
    { icon: Users, label: labels.users, href: `${base}/users` },
    { icon: Building2, label: labels.homes, href: `${base}/homes` },
    { icon: Bus, label: labels.transport, href: `${base}/transport` },
    { icon: CalendarRange, label: labels.bookings, href: `${base}/bookings` },
    { icon: CreditCard, label: labels.payments, href: `${base}/payments` },
    { icon: Settings, label: labels.settings, href: `${base}/settings` },
  ];

  return (
    <Sidebar
      collapsible="icon"
      className="border-r bg-white"
      style={{
        top: `${NAVBAR_HEIGHT}px`,
        height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
      }}
    >
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">{labels.header}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{labels.platform}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  item.href === base
                    ? pathname === base || pathname === `${base}/`
                    : pathname?.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "px-3 py-2",
                        active ? "bg-muted text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Link href={item.href} scroll={false}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
