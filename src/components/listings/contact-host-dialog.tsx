"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { createConversation } from "@/lib/actions/message-actions";

/**
 * "Message host" — the guest side of the inquiry funnel.
 *
 * The button existed on the listing page long before this dialog did, but it
 * had no handler and no action behind it: `sendMessage` needs a conversation
 * that only a seed script could create. `createConversation` closed that gap;
 * this is its entry point.
 *
 * Auth is checked by the action rather than by a prop, so this component can be
 * dropped into any tree without threading a session through it. An
 * unauthenticated guest is sent to login instead of being shown an error.
 */
export default function ContactHostDialog({
  listingId,
  className,
}: {
  listingId: number;
  className?: string;
}) {
  const dict = useDictionary();
  const host = dict.rental?.host as Record<string, string> | undefined;
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) || "ar";

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const result = await createConversation({ listingId, body: trimmed });

      if (result.ok) {
        setOpen(false);
        setBody("");
        toast.success(host?.messageSent ?? "Message sent. The host will reply in your inbox.");
        return;
      }

      if (result.error === "Unauthenticated") {
        // Locale prefix is mandatory on every route in this app.
        router.push(`/${lang}/login`);
        return;
      }

      toast.error(host?.messageError ?? "Couldn't send your message. Please try again.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={
            className ??
            "bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-lg font-medium flex items-center gap-2"
          }
        >
          {host?.messageHost ?? "Message host"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{host?.messageDialogTitle ?? "Message the host"}</DialogTitle>
          <DialogDescription>
            {host?.messageDialogDescription ??
              "Ask about availability, the neighbourhood, or anything else you want to know."}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder={host?.messagePlaceholder ?? "Hi! Is this place available on the dates I need?"}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {host?.messageCancel ?? "Cancel"}
          </Button>
          <Button onClick={submit} disabled={pending || body.trim().length === 0}>
            {pending
              ? (host?.messageSending ?? "Sending…")
              : (host?.messageSend ?? "Send message")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
