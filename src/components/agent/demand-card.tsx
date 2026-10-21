"use client";

import { useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { optInForDemand } from "./demand-actions";

/**
 * Under a search Mkan could not fully meet: "WhatsApp me when it's found".
 * The number goes on this chat's request only, and is used for its alerts.
 */
export function DemandCard({ taskId, optedIn, onDone }: { taskId: string; optedIn: boolean; onDone?: () => void }) {
  const d = useDictionary()?.agent?.demand;
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "done" | "phone" | "error">(optedIn ? "done" : "idle");
  const [pending, start] = useTransition();

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="size-4 text-foreground" aria-hidden />
        {d?.optedIn ?? "We'll WhatsApp you when a home comes in."}
      </p>
    );
  }

  return (
    <form
      className="space-y-2.5 rounded-2xl border p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await optInForDemand({ taskId, phone }).catch(() => ({ ok: false as const, error: "missing" as const }));
          if (res.ok) {
            setState("done");
            onDone?.();
          } else setState(res.error === "phone" ? "phone" : "error");
        });
      }}
    >
      <div className="flex items-start gap-2.5">
        <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{d?.optInTitle ?? "Get a WhatsApp when it's found"}</p>
          <p className="text-sm text-muted-foreground">{d?.optInBody ?? "Leave your number and we'll message you once a broker sends a home that fits."}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={d?.phonePlaceholder ?? "07X XXX XXXX"}
          aria-label={d?.phoneLabel ?? "WhatsApp number"}
          aria-invalid={state === "phone"}
          className="h-10 min-w-0 flex-1"
        />
        <Button type="submit" disabled={pending || phone.trim().length < 9} className="h-10 shrink-0">
          {d?.optInButton ?? "Notify me"}
        </Button>
      </div>
      {state !== "idle" && (
        <p role="alert" className="text-xs text-destructive">
          {state === "phone" ? d?.phoneError ?? "Please enter a valid WhatsApp number." : d?.error ?? "Something went wrong. Please try again."}
        </p>
      )}
    </form>
  );
}
