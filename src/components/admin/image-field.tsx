"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { IMAGES_MAX } from "@/lib/admin/products/schema";
import { UPLOAD_TYPES, uploadPathname, uploadProblem } from "@/lib/admin/products/uploads";
import type { CatalogImage } from "@/lib/catalog/types";

/**
 * Adding photos to a product: upload one (straight to Vercel Blob, to a presigned URL from
 * /api/admin/uploads), or, when uploads aren't configured, pick one of the catalogue's existing
 * photos. The list of photos itself (alt text, order, removing) is rendered by the form.
 */
export function AddPhoto({
  count,
  uploads,
  libraryPhotos,
  onAdd,
}: {
  count: number;
  uploads: boolean;
  libraryPhotos: CatalogImage[];
  onAdd: (image: CatalogImage) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const full = count >= IMAGES_MAX;

  async function send(file: File) {
    const problem = uploadProblem(file);
    if (problem) return setStatus({ busy: false, error: problem });
    setStatus({ busy: true, error: null });
    try {
      const blob = await uploadPresigned(uploadPathname(file.name, file.type), file, {
        access: "public",
        handleUploadUrl: "/api/admin/uploads",
        contentType: file.type,
      });
      onAdd({ src: blob.url, alt: "" });
      setStatus({ busy: false, error: null });
    } catch {
      setStatus({ busy: false, error: "The photo couldn't be uploaded. Try again." });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {uploads ? (
        <div className="flex flex-wrap items-center gap-4">
          <input
            ref={input}
            type="file"
            accept={UPLOAD_TYPES.join(",")}
            className="sr-only"
            // Out of the Tab order and the accessibility tree: the button below opens it.
            tabIndex={-1}
            aria-hidden
            disabled={full || status.busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void send(file);
            }}
          />
          <Button type="button" variant="outline" disabled={full || status.busy} onClick={() => input.current?.click()}>
            {status.busy ? "Uploading…" : "Upload a photo"}
          </Button>
          <span className="text-caption text-muted-foreground">JPEG, PNG or WebP, up to 4 MB.</span>
        </div>
      ) : (
        <details className="flex flex-col gap-3">
          <summary className="eyebrow cursor-pointer link-quiet">Choose from the catalogue&apos;s photos</summary>
          <p className="mt-2 text-caption text-muted-foreground">Uploads aren&apos;t configured, so pick one of the catalogue&apos;s photos.</p>
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {libraryPhotos.map((photo) => (
              <li key={photo.src}>
                <button
                  type="button"
                  disabled={full}
                  aria-label={`Add photo: ${photo.alt}`}
                  className="relative block aspect-square w-full bg-surface outline-offset-2 disabled:opacity-40"
                  onClick={() => onAdd(photo)}
                >
                  <Image src={photo.src} alt="" fill sizes="96px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {full && <p className="text-caption text-muted-foreground">A product has at most {IMAGES_MAX} photos.</p>}
      <p role="alert" className="text-caption text-destructive empty:hidden">
        {status.error}
      </p>
    </div>
  );
}

/** Move up, move down and remove for one item of an ordered list (photos, details). */
export function ListItemActions({ label, index, count, onMove, onRemove }: { label: string; index: number; count: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} aria-label={`Move ${label} up`} onClick={() => onMove(index - 1)}>
        <ArrowUp aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} aria-label={`Move ${label} down`} onClick={() => onMove(index + 1)}>
        <ArrowDown aria-hidden />
      </Button>
      <Button type="button" variant="link" size="xs" className="ml-2" aria-label={`Remove ${label}`} onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
