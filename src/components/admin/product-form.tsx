"use client";

import { useForm, useStore } from "@tanstack/react-form";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AddPhoto, ListItemActions } from "@/components/admin/image-field";
import { describedBy, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { archiveProduct, restoreProduct, saveProduct } from "@/lib/admin/products/actions";
import { DETAILS_MAX, productFormSchema, slugify, toProductInput, type ProductField, type ProductFormValues } from "@/lib/admin/products/schema";
import { signInPath } from "@/lib/auth/return-to";
import type { CatalogImage } from "@/lib/catalog/types";
import { AUDIENCES, COLOUR_FAMILIES, MATERIALS } from "@/lib/catalog/vocabulary";

export type EditedProduct = { id: number; expectedStock: number; held: number; archived: boolean };

type Props = {
  /** Undefined for a new product. */
  product?: EditedProduct;
  initial: ProductFormValues;
  categories: { slug: string; name: string }[];
  uploads: boolean;
  libraryPhotos: CatalogImage[];
  canArchive: boolean;
};

const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");
const options = (values: readonly string[]) => values.map((value) => ({ value, label: label(value) }));

// Fields in form order, for focusing the first invalid one (name → element id).
const ORDER: ProductField[] = ["name", "slug", "categorySlug", "audience", "colour", "colourFamily", "material", "description", "price", "stock", "details", "images"];

/**
 * Creating and editing a product: one TanStack Form, errors shown as on the auth forms (after a
 * submit attempt, then following typing). Price is entered in dollars and saved in cents; details
 * and photos are ordered lists. Saving refreshes the storefront at once (updateTag in the action).
 */
export function ProductForm({ product, initial, categories, uploads, libraryPhotos, canArchive }: Props) {
  const router = useRouter();
  const [expectedStock, setExpectedStock] = useState(product?.expectedStock);
  const [slugTouched, setSlugTouched] = useState(product !== undefined);
  const [serverError, setServerError] = useState<{ field?: ProductField; message: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm({
    defaultValues: initial,
    validators: { onChange: productFormSchema, onSubmit: productFormSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setStatus(null);
      const input = toProductInput(productFormSchema.parse(value));
      const result = await saveProduct(product ? { ...input, id: product.id, expectedStock } : input).catch(() => null);
      if (!result) return setServerError({ message: "Something went wrong. Try again." });
      if (!result.ok) {
        if (result.error === "signed-out") return window.location.assign(signInPath(window.location.pathname));
        setServerError({ field: result.field, message: result.message });
        if (result.field) document.getElementById(`product-${result.field}`)?.focus();
        return;
      }
      if (!product) return router.push(`/admin/products/${result.data.slug}`);
      setExpectedStock(input.stock);
      setStatus("Saved.");
      if (result.data.slug !== initial.slug) router.replace(`/admin/products/${result.data.slug}`);
      else router.refresh();
    },
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const submitting = useStore(form.store, (state) => state.isSubmitting);

  /** The field's errors: validation's, then the server's answer about this field until it's edited. */
  const errorsFor = (name: ProductField, meta: { errors: unknown[] }) => [
    ...shownErrors(meta, submitted),
    ...(serverError?.field === name ? [{ message: serverError.message }] : []),
  ];
  const clearServerError = (name: ProductField) => serverError?.field === name && setServerError(null);

  async function toggleArchived() {
    if (!product) return;
    setBusy(true);
    setStatus(null);
    setServerError(null);
    const result = await (product.archived ? restoreProduct(product.id) : archiveProduct(product.id)).catch(() => null);
    setBusy(false);
    if (result && !result.ok && result.error === "signed-out") return window.location.assign(signInPath(window.location.pathname));
    if (!result?.ok) return setServerError({ message: result?.message ?? "Something went wrong. Try again." });
    setStatus(product.archived ? "Restored: it's on the storefront again." : "Archived: it's off the storefront.");
    router.refresh();
  }

  function textField(name: "name" | "slug" | "colour", fieldLabel: string, hint?: string, readOnly = false) {
    return (
      <form.Field name={name}>
        {(field) => {
          const errors = errorsFor(name, field.state.meta);
          const id = `product-${name}`;
          return (
            <Field data-invalid={errors.length > 0 || undefined}>
              <FieldLabel htmlFor={id}>{fieldLabel}</FieldLabel>
              <Input
                id={id}
                readOnly={readOnly}
                value={field.state.value}
                onChange={(event) => {
                  clearServerError(name);
                  if (name === "slug") setSlugTouched(true);
                  field.handleChange(event.target.value);
                  if (name === "name" && !slugTouched) form.setFieldValue("slug", slugify(event.target.value));
                }}
                onBlur={field.handleBlur}
                aria-invalid={errors.length > 0 || undefined}
                aria-describedby={describedBy(hint && `${id}-hint`, errors.length > 0 && `${id}-error`)}
              />
              {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
              <FieldError id={`${id}-error`} errors={errors} />
            </Field>
          );
        }}
      </form.Field>
    );
  }

  function selectField(name: "categorySlug" | "audience" | "colourFamily" | "material", fieldLabel: string, items: { value: string; label: string }[]) {
    return (
      <form.Field name={name}>
        {(field) => {
          const errors = errorsFor(name, field.state.meta);
          const id = `product-${name}`;
          return (
            <Field data-invalid={errors.length > 0 || undefined}>
              <FieldLabel htmlFor={id}>{fieldLabel}</FieldLabel>
              <Select
                items={items}
                value={field.state.value}
                onValueChange={(value) => {
                  clearServerError(name);
                  if (value !== null) field.handleChange(value as never);
                }}
              >
                <SelectTrigger id={id} className="w-full" aria-invalid={errors.length > 0 || undefined} aria-describedby={describedBy(errors.length > 0 && `${id}-error`)}>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError id={`${id}-error`} errors={errors} />
            </Field>
          );
        }}
      </form.Field>
    );
  }

  return (
    <form
      noValidate
      aria-label={product ? "Edit product" : "New product"}
      className="flex flex-col gap-section"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        const first = ORDER.find((name) => hasErrors(form.getFieldMeta(name)));
        if (first) document.getElementById(`product-${first}`)?.focus();
        // Errors inside the details and photos lists sit on their own inputs.
        else (event.currentTarget.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus();
      }}
    >
      {product?.archived && (
        <p className="bg-surface px-4 py-3 text-caption">Archived — this product isn&apos;t on the storefront. Restore it to sell it again.</p>
      )}

      <FieldSet>
        <FieldLegend className="eyebrow">Basics</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
          {textField("name", "Name")}
          {product
            ? textField("slug", "Slug", "The product's address. It can't change once created: bags, saved items and links use it.", true)
            : textField("slug", "Slug", "The product's address: /products/<slug>. It can't change once created.")}
          {selectField("categorySlug", "Category", categories.map((category) => ({ value: category.slug, label: category.name })))}
          {selectField("audience", "For", options(AUDIENCES))}
          {textField("colour", "Colour", "As shoppers see it, e.g. Tan.")}
          {selectField("colourFamily", "Colour family", options(COLOUR_FAMILIES))}
          {selectField("material", "Material", options(MATERIALS))}
        </FieldGroup>
        <form.Field name="description">
          {(field) => {
            const errors = errorsFor("description", field.state.meta);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="product-description">Description</FieldLabel>
                <Textarea
                  id="product-description"
                  rows={4}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "product-description-error")}
                />
                <FieldError id="product-description-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend className="eyebrow">Price and stock</FieldLegend>
        <FieldGroup className="grid gap-6 md:grid-cols-2">
          <form.Field name="price">
            {(field) => {
              const errors = errorsFor("price", field.state.meta);
              return (
                <Field data-invalid={errors.length > 0 || undefined}>
                  <FieldLabel htmlFor="product-price">Price (USD)</FieldLabel>
                  <Input
                    id="product-price"
                    inputMode="decimal"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={errors.length > 0 || undefined}
                    aria-describedby={describedBy("product-price-hint", errors.length > 0 && "product-price-error")}
                  />
                  <FieldDescription id="product-price-hint">In dollars, e.g. 1290 or 1290.50.</FieldDescription>
                  <FieldError id="product-price-error" errors={errors} />
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="stock">
            {(field) => {
              const errors = errorsFor("stock", field.state.meta);
              const hint = product && product.held > 0 ? `${product.held} more held in checkouts.` : "Units available to sell.";
              return (
                <Field data-invalid={errors.length > 0 || undefined}>
                  <FieldLabel htmlFor="product-stock">Stock</FieldLabel>
                  <Input
                    id="product-stock"
                    inputMode="numeric"
                    value={field.state.value}
                    onChange={(event) => {
                      clearServerError("stock");
                      field.handleChange(event.target.value);
                    }}
                    onBlur={field.handleBlur}
                    aria-invalid={errors.length > 0 || undefined}
                    aria-describedby={describedBy("product-stock-hint", errors.length > 0 && "product-stock-error")}
                  />
                  <FieldDescription id="product-stock-hint">{hint}</FieldDescription>
                  <FieldError id="product-stock-error" errors={errors} />
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
      </FieldSet>

      <form.Field name="details" mode="array">
        {(list) => (
          <FieldSet>
            <FieldLegend className="eyebrow">Details</FieldLegend>
            <FieldDescription>Shown on the product page in this order, e.g. Size: 40 × 30 cm.</FieldDescription>
            <ol className="flex flex-col gap-4">
              {list.state.value.map((detail, index) => (
                <li key={index} className="grid gap-4 border-t pt-4 md:grid-cols-[1fr_2fr_auto] md:items-start">
                  {(["term", "value"] as const).map((part) => (
                    <form.Field key={part} name={`details[${index}].${part}`}>
                      {(field) => {
                        const errors = shownErrors(field.state.meta, submitted);
                        const id = `product-details-${index}-${part}`;
                        return (
                          <Field data-invalid={errors.length > 0 || undefined}>
                            <FieldLabel htmlFor={id}>{part === "term" ? `Label ${index + 1}` : `Value ${index + 1}`}</FieldLabel>
                            <Input
                              id={id}
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              aria-invalid={errors.length > 0 || undefined}
                              aria-describedby={describedBy(errors.length > 0 && `${id}-error`)}
                            />
                            <FieldError id={`${id}-error`} errors={errors} />
                          </Field>
                        );
                      }}
                    </form.Field>
                  ))}
                  <ListItemActions
                    label={`detail ${index + 1}${detail.term ? ` (${detail.term})` : ""}`}
                    index={index}
                    count={list.state.value.length}
                    onMove={(to) => list.moveValue(index, to)}
                    onRemove={() => list.removeValue(index)}
                  />
                </li>
              ))}
            </ol>
            <Button type="button" variant="outline" className="self-start" disabled={list.state.value.length >= DETAILS_MAX} onClick={() => list.pushValue({ term: "", value: "" })}>
              Add a detail
            </Button>
          </FieldSet>
        )}
      </form.Field>

      <form.Field name="images" mode="array">
        {(list) => {
          const errors = shownErrors(list.state.meta, submitted);
          return (
            <FieldSet>
              <FieldLegend className="eyebrow">Photos</FieldLegend>
              <FieldDescription>The first is the product card&apos;s photo. Describe each for people who can&apos;t see it.</FieldDescription>
              <ol id="product-images" tabIndex={-1} className="flex flex-col gap-4 outline-none">
                {list.state.value.map((image, index) => (
                  <li key={image.src} className="grid grid-cols-[5rem_1fr] gap-4 border-t pt-4 md:grid-cols-[6rem_1fr_auto] md:items-start">
                    <div className="relative aspect-square bg-surface">
                      <Image src={image.src} alt="" fill sizes="96px" className="object-cover" />
                    </div>
                    <form.Field name={`images[${index}].alt`}>
                      {(field) => {
                        const altErrors = shownErrors(field.state.meta, submitted);
                        const id = `product-images-${index}-alt`;
                        return (
                          <Field data-invalid={altErrors.length > 0 || undefined}>
                            <FieldLabel htmlFor={id}>Description of photo {index + 1}</FieldLabel>
                            <Input
                              id={id}
                              value={field.state.value}
                              onChange={(event) => field.handleChange(event.target.value)}
                              aria-invalid={altErrors.length > 0 || undefined}
                              aria-describedby={describedBy(altErrors.length > 0 && `${id}-error`)}
                            />
                            <FieldError id={`${id}-error`} errors={altErrors} />
                          </Field>
                        );
                      }}
                    </form.Field>
                    <div className="col-span-2 md:col-span-1">
                      <ListItemActions
                        label={`photo ${index + 1}`}
                        index={index}
                        count={list.state.value.length}
                        onMove={(to) => list.moveValue(index, to)}
                        onRemove={() => list.removeValue(index)}
                      />
                    </div>
                  </li>
                ))}
              </ol>
              <FieldError errors={errors.filter((error) => error.message)} />
              <AddPhoto
                count={list.state.value.length}
                uploads={uploads}
                libraryPhotos={libraryPhotos}
                onAdd={(photo) => !list.state.value.some((image) => image.src === photo.src) && list.pushValue(photo)}
              />
            </FieldSet>
          );
        }}
      </form.Field>

      <div className="flex flex-col gap-4 border-t pt-block">
        {/* The server's answers about a field show on it; about the lists (no single input), here. */}
        <FormError message={serverError && (!serverError.field || serverError.field === "details" || serverError.field === "images") ? serverError.message : null} className="mb-0" />
        <p role="status" className="text-caption empty:hidden">
          {status}
        </p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button type="submit" disabled={submitting || busy}>
            {submitting ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
          {product && canArchive && (
            <Button type="button" variant="outline" disabled={submitting || busy} onClick={() => void toggleArchived()}>
              {product.archived ? "Restore" : "Archive"}
            </Button>
          )}
          {product && !product.archived && (
            // No prefetch: it would render the storefront page just before an edit, and Next can't
            // always tell a render milliseconds before an invalidation from one after it.
            <Link href={`/products/${initial.slug}`} prefetch={false} className="eyebrow link-quiet">
              View on the store
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
