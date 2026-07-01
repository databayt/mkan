"use client";

import React from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/components/hosting/listing/editor-context";
import { EditorSection } from "@/components/hosting/listing/editor-section";
import {
  PhotosGridIcon,
  PlusIcon,
  TrashIcon,
  EllipsisIcon,
} from "@/components/hosting/listing/editor-icons";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { uploadListingPhoto } from "@/lib/image-upload-client";
import { cn } from "@/lib/utils";

// Authentic Airbnb empty-state room suggestions (3D illustrations live in /public/hosting).
const ROOM_SUGGESTIONS = [
  { key: "bedroom", fallback: "Bedroom", image: "/hosting/bedroom.png" },
  { key: "bathroom", fallback: "Bathroom", image: "/hosting/bathroom.png" },
  { key: "additional", fallback: "Additional photos", image: null },
] as const;

const PhotoTour = () => {
  const dict = useDictionary();
  const t = dict?.listingEditor?.photoTour;
  const params = useParams<{ id: string }>();
  const { listing, save, saving } = useEditor();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [allOpen, setAllOpen] = React.useState(false);

  const photos = listing?.photoUrls ?? [];
  const numericId = listing?.id ?? Number(params?.id);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        try {
          const res = await uploadListingPhoto(file, { listingId: numericId });
          uploaded.push(res.url);
        } catch (err) {
          toast.error(
            err instanceof Error ? `${file.name}: ${err.message}` : `Could not upload ${file.name}`
          );
        }
      }
      if (uploaded.length > 0) {
        // updateListing overwrites photoUrls, so the merged array is the source of truth.
        await save({ photoUrls: [...photos, ...uploaded] });
      }
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (url: string) => {
    await save({ photoUrls: photos.filter((p) => p !== url) });
  };

  const openPicker = () => fileInputRef.current?.click();

  const busy = uploading || saving;

  const headerAction = (
    <>
      <button
        type="button"
        onClick={() => setAllOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted/70"
      >
        <PhotosGridIcon size={16} strokeWidth={3} />
        <span>{t?.allPhotos ?? "All photos"}</span>
      </button>
      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        aria-label={t?.addPhotoAria ?? "Add photo"}
        className="inline-flex size-10 items-center justify-center rounded-full border border-border text-foreground transition hover:border-foreground disabled:opacity-50"
      >
        <PlusIcon size={16} />
      </button>
    </>
  );

  return (
    <EditorSection
      title={t?.heading ?? "Photo tour"}
      subtitle={
        t?.description ??
        "Manage photos and add details. Guests will only see your tour if every room has a photo."
      }
      headerAction={headerAction}
      maxWidth="xl"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {photos.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {photos.map((url, i) => (
            <figure
              key={url}
              className={cn(
                "group relative overflow-hidden rounded-2xl bg-muted",
                i === 0 ? "sm:col-span-2 aspect-[3/2]" : "aspect-[4/3]"
              )}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover"
              />
              {/* hover controls */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 to-transparent opacity-0 transition group-hover:opacity-100" />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                disabled={busy}
                aria-label="Remove photo"
                className="absolute end-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow-md transition group-hover:opacity-100 hover:scale-105 disabled:opacity-50"
              >
                <TrashIcon size={16} />
              </button>
              {i === 0 ? (
                <span className="absolute start-3 top-3 rounded-md bg-background/90 px-2.5 py-1 text-xs font-semibold">
                  {t?.coverPhoto ?? "Cover photo"}
                </span>
              ) : null}
            </figure>
          ))}

          {/* add tile */}
          <button
            type="button"
            onClick={openPicker}
            disabled={busy}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition hover:border-foreground hover:text-foreground disabled:opacity-50"
          >
            <PlusIcon size={22} />
            <span className="text-sm font-semibold">{busy ? (t?.uploading ?? "Uploading…") : (t?.addPhotos ?? "Add photos")}</span>
          </button>
        </div>
      ) : (
        // Empty state — Airbnb's suggested room cards.
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {ROOM_SUGGESTIONS.map((room) => {
            const name =
              (t && (t as Record<string, string>)[room.key]) || room.fallback;
            return (
              <button
                key={room.key}
                type="button"
                onClick={openPicker}
                disabled={busy}
                className="text-start disabled:opacity-50"
              >
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted">
                  {room.image ? (
                    <Image
                      src={room.image}
                      alt={name}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <PlusIcon size={28} className="text-muted-foreground" />
                  )}
                </div>
                <p className="mt-3 font-semibold">{name}</p>
                <span className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                  {busy ? (t?.uploading ?? "Uploading…") : (t?.addPhotos ?? "Add photos")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* All photos modal */}
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t?.allPhotos ?? "All photos"}</DialogTitle>
          </DialogHeader>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {photos.map((url) => (
                <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  <Image src={url} alt="" fill sizes="50vw" className="object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <EllipsisIcon size={24} className="text-muted-foreground" />
              <p className="text-muted-foreground">{t?.description ?? "No photos yet"}</p>
              <button
                type="button"
                onClick={() => {
                  setAllOpen(false);
                  openPicker();
                }}
                className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
              >
                {t?.addPhotos ?? "Add photos"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </EditorSection>
  );
};

export default PhotoTour;
