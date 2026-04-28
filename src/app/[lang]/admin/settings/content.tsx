"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updatePlatformSettings } from "@/lib/actions/admin-actions";

interface SettingsLabels {
  feeTitle: string;
  feeDescription: string;
  feeLabel: string;
  policyTitle: string;
  policyDescription: string;
  policyLabel: string;
  currenciesTitle: string;
  currenciesDescription: string;
  currenciesLabel: string;
  payoutsTitle: string;
  payoutsDescription: string;
  payoutsLabel: string;
  emailTitle: string;
  emailDescription: string;
  emailFromLabel: string;
  supportEmailLabel: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
}

interface PlatformSettingsValue {
  platformFeePct: number;
  defaultCancellationPolicy:
    | "Flexible"
    | "Moderate"
    | "Firm"
    | "Strict"
    | "NonRefundable";
  supportedCurrencies: string;
  payoutScheduleDays: number;
  emailFrom: string;
  supportEmail: string;
}

const POLICIES = [
  "Flexible",
  "Moderate",
  "Firm",
  "Strict",
  "NonRefundable",
] as const;

export default function AdminSettingsContent({
  initial,
  labels,
}: {
  initial: PlatformSettingsValue;
  labels: SettingsLabels;
}) {
  const [pending, start] = useTransition();
  const [v, setV] = useState<PlatformSettingsValue>(initial);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updatePlatformSettings({
        platformFeePct: Number(v.platformFeePct),
        defaultCancellationPolicy: v.defaultCancellationPolicy,
        supportedCurrencies: v.supportedCurrencies,
        payoutScheduleDays: Number(v.payoutScheduleDays),
        emailFrom: v.emailFrom,
        supportEmail: v.supportEmail,
      });
      if (r.ok) toast.success(labels.saved);
      else toast.error(labels.error);
    });
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{labels.feeTitle}</CardTitle>
          <CardDescription>{labels.feeDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="fee">{labels.feeLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="fee"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={Math.round(v.platformFeePct * 1000) / 10}
                onChange={(e) =>
                  setV({ ...v, platformFeePct: Number(e.target.value) / 100 })
                }
                className="max-w-32"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.policyTitle}</CardTitle>
          <CardDescription>{labels.policyDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>{labels.policyLabel}</Label>
            <Select
              value={v.defaultCancellationPolicy}
              onValueChange={(val) =>
                setV({ ...v, defaultCancellationPolicy: val as PlatformSettingsValue["defaultCancellationPolicy"] })
              }
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.currenciesTitle}</CardTitle>
          <CardDescription>{labels.currenciesDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="currencies">{labels.currenciesLabel}</Label>
            <Input
              id="currencies"
              value={v.supportedCurrencies}
              onChange={(e) => setV({ ...v, supportedCurrencies: e.target.value })}
              placeholder="SDG,USD,SAR"
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.payoutsTitle}</CardTitle>
          <CardDescription>{labels.payoutsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="payouts">{labels.payoutsLabel}</Label>
            <Input
              id="payouts"
              type="number"
              min={0}
              max={365}
              value={v.payoutScheduleDays}
              onChange={(e) =>
                setV({ ...v, payoutScheduleDays: Number(e.target.value) })
              }
              className="max-w-32"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.emailTitle}</CardTitle>
          <CardDescription>{labels.emailDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from">{labels.emailFromLabel}</Label>
            <Input
              id="from"
              type="email"
              value={v.emailFrom}
              onChange={(e) => setV({ ...v, emailFrom: e.target.value })}
              placeholder="hello@mkan.databayt.org"
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support">{labels.supportEmailLabel}</Label>
            <Input
              id="support"
              type="email"
              value={v.supportEmail}
              onChange={(e) => setV({ ...v, supportEmail: e.target.value })}
              placeholder="support@mkan.databayt.org"
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? labels.saving : labels.save}
        </Button>
      </div>
    </form>
  );
}
