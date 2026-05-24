"use client";

import { LogOut, User } from "lucide-react"

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
import { useDictionary } from "@/components/internationalization/dictionary-context";

export const UserButton = () => {
  const user = useCurrentUser();
  const dict = useDictionary();
  const t = dict?.auth?.userButton;

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
            {t?.logout ?? "Logout"}
          </DropdownMenuItem>
        </LogoutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
