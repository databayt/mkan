"use client";

import { LogOut, User } from "lucide-react"
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";

import { LogoutButton } from "@/components/auth/logout-button";
import { useCurrentUser } from "./use-current-user";

const translations = {
  en: {
    logout: "Logout",
  },
  ar: {
    logout: "تسجيل الخروج",
  },
} as const;

export const UserButton = () => {
  const user = useCurrentUser();
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Avatar>
          <AvatarImage src={user?.image || ""} />
          <AvatarFallback className="bg-black">
            <User className="text-[#fcfcfc] p-[2px]" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" align="end">
        <LogoutButton>
          <DropdownMenuItem>
            <LogOut className="h-4 w-4 me-2" />
            {t.logout}
          </DropdownMenuItem>
        </LogoutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
