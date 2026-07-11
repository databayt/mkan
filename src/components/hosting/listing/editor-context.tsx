"use client";

/**
 * Editor data context — the single source of truth for the listing editor.
 *
 * Mounted once in the editor layout, it loads the listing a single time and
 * exposes it (plus a `save(patch)` helper) to every section page. This replaces
 * the per-page `useEffect(() => params.then(...))` + ad-hoc fetch boilerplate
 * that each of the ~26 sections used to carry.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { getListing, updateListing } from "@/lib/actions/listing-actions";
import { useDictionary } from "@/components/internationalization/use-dictionary";

export type EditorListing = Awaited<ReturnType<typeof getListing>>;
export type ListingPatch = Record<string, unknown>;

interface EditorContextValue {
  listingId: number | null;
  listing: EditorListing | null;
  isLoading: boolean;
  error: string | null;
  saving: boolean;
  /** Persist a partial update. Returns true on success. */
  save: (patch: ListingPatch) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  listingId,
  children,
}: {
  listingId: number;
  children: React.ReactNode;
}) {
  const [listing, setListing] = useState<EditorListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dict = useDictionary();

  const load = useCallback(async () => {
    if (!listingId || Number.isNaN(listingId)) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getListing(listingId);
      setListing(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing");
    } finally {
      setIsLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: ListingPatch): Promise<boolean> => {
      if (!listingId) return false;
      setSaving(true);
      try {
        const res = await updateListing(listingId, patch);
        if (res?.success && res.listing) {
          setListing(res.listing as EditorListing);
          toast.success(dict?.listingEditor?.common?.savedToast ?? "Changes saved");
          return true;
        }
        toast.error(dict?.listingEditor?.common?.saveFailedToast ?? "Could not save changes");
        return false;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : (dict?.listingEditor?.common?.saveFailedToast ?? "Could not save changes")
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [listingId, dict]
  );

  const value = useMemo<EditorContextValue>(
    () => ({
      listingId: listingId ?? null,
      listing,
      isLoading,
      error,
      saving,
      save,
      refresh: load,
    }),
    [listingId, listing, isLoading, error, saving, save, load]
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return ctx;
}
