import { describe, expect, it } from "vitest";

import { blobStoreHost, isAllowedPhoto, isUploadPathname, uploadPathname, uploadProblem, UPLOAD_MAX_BYTES } from "./uploads";

describe("uploads", () => {
  it("allows JPEG, PNG and WebP up to 4 MB", () => {
    expect(uploadProblem({ type: "image/jpeg", size: UPLOAD_MAX_BYTES })).toBeNull();
    expect(uploadProblem({ type: "image/webp", size: 1 })).toBeNull();
    expect(uploadProblem({ type: "image/gif", size: 1 })).toBe("Use a JPEG, PNG or WebP photo.");
    expect(uploadProblem({ type: "image/svg+xml", size: 1 })).toBe("Use a JPEG, PNG or WebP photo.");
    expect(uploadProblem({ type: "image/png", size: UPLOAD_MAX_BYTES + 1 })).toBe("Use a photo of at most 4 MB.");
  });

  it("puts every upload under products/ with a safe name and the type's extension", () => {
    expect(uploadPathname("My Tote (front).JPG", "image/jpeg")).toBe("products/my-tote-front.jpg");
    expect(uploadPathname("../../etc/passwd", "image/png")).toBe("products/passwd.png");
    expect(uploadPathname("....", "image/webp")).toBe("products/photo.webp");
    for (const name of ["a.jpg", "x y.png", "../../z.webp"]) expect(isUploadPathname(uploadPathname(name, "image/jpeg"))).toBe(true);
  });

  it("refuses any other pathname a client asks for", () => {
    for (const pathname of ["avatars/x.jpg", "products/../x.jpg", "products/x.svg", "products/x", "products/a/b.jpg", "/products/x.jpg"]) {
      expect(isUploadPathname(pathname), pathname).toBe(false);
    }
  });
});

describe("our Blob store", () => {
  it("is found from the token, and only its products/ uploads are allowed", () => {
    const host = blobStoreHost("vercel_blob_rw_AbC123_s3cret");
    expect(host).toBe("abc123.public.blob.vercel-storage.com");
    expect(blobStoreHost(undefined)).toBeNull();
    expect(blobStoreHost("not-a-token")).toBeNull();
    expect(isAllowedPhoto("https://images.unsplash.com/photo-1", null)).toBe(true);
    expect(isAllowedPhoto(`https://${host}/products/a-x1.webp`, host)).toBe(true);
    expect(isAllowedPhoto(`https://${host}/other/a.webp`, host)).toBe(false);
    expect(isAllowedPhoto("https://zzz.public.blob.vercel-storage.com/products/a.webp", host)).toBe(false);
    expect(isAllowedPhoto(`https://${host}/products/a.webp`, null)).toBe(false);
  });
});
