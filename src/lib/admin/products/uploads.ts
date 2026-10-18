// What an admin upload may be (client-safe: the photo field checks a file before asking for a
// token, and the upload route enforces the same rules in the token it issues).

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const EXTENSIONS: Record<string, (typeof UPLOAD_TYPES)[number]> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Why a file can't be uploaded, or null. */
export function uploadProblem(file: { type: string; size: number }): string | null {
  if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) return "Use a JPEG, PNG or WebP photo.";
  if (file.size > UPLOAD_MAX_BYTES) return "Use a photo of at most 4 MB.";
  return null;
}

/** Where an upload goes: `products/<name>.<ext>` (Blob adds a random suffix). */
export function uploadPathname(fileName: string, type: string): string {
  const extension = Object.entries(EXTENSIONS).find(([, mime]) => mime === type)?.[0] ?? "jpg";
  const base =
    fileName
      .replace(/^.*[\\/]/, "")
      .replace(/\.[^.]*$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "photo";
  return `products/${base}.${extension}`;
}

/** Whether a pathname a client asked to upload to is one uploadPathname could have made. */
export function isUploadPathname(pathname: string): boolean {
  const match = /^products\/[a-z0-9]+(?:-[a-z0-9]+)*\.([a-z]+)$/.exec(pathname);
  return Boolean(match && match[1] in EXTENSIONS);
}
