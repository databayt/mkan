"use client";

import { ExtendedUser } from "../../../next-auth";
import {
  Card,
  CardContent,
  CardHeader
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDictionary } from "@/components/internationalization/use-dictionary";

interface UserInfoProps {
  user?: ExtendedUser;
  label: string;
};

export const UserInfo = ({
  user,
  label,
}: UserInfoProps) => {
  const dict = useDictionary();
  return (
    <Card className="border-none shadow-none">
      <CardHeader>
        <p className="text-2xl font-semibold text-center">
          {label}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 tracking-wider">
        
          <p className="text-lg font-light flex gap-4"><strong className="font-semibold">{dict?.auth?.userInfo?.id ?? "ID"}: </strong> {user?.id}</p>
          <p className="text-lg font-light flex gap-4"><strong className="font-semibold">{dict?.auth?.userInfo?.name ?? "Name"}: </strong> {user?.name}</p>
          <p className="text-lg font-light flex gap-4"><strong className="font-semibold">{dict?.auth?.userInfo?.email ?? "Email"}: </strong> {user?.email}</p>
          <p className="text-lg font-light flex gap-4"><strong className="font-semibold">{dict?.auth?.userInfo?.role ?? "Role"}: </strong> {user?.role}</p>

          <div className="flex gap-4 text-lg font-light">
             <strong className="font-semibold">{dict?.auth?.userInfo?.twoFactor ?? "2FA"}: </strong>
             <Badge 
               className={`px-2 ${user?.isTwoFactorEnabled ? "bg-green-500" : "bg-red-500"} text-white`}
             >
            {user?.isTwoFactorEnabled ? (dict?.auth?.userInfo?.on ?? "ON") : (dict?.auth?.userInfo?.off ?? "OFF")}
          </Badge>
          </div>
          
      </CardContent>
    </Card>
  )
}
