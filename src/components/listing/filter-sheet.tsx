"use client";

import { XIcon } from "lucide-react";
import { useId, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  activeFilterCount,
  emptyFilters,
  optionState,
  SORT_LABELS,
  sortsFor,
  withoutFilter,
  type FacetKey,
  type Filters,
  type ResultsQuery,
  type Sort,
} from "@/lib/catalog/filters";
import type { Facet, Results } from "@/lib/catalog/results";
import { cn } from "@/lib/utils";
import type { SheetSection } from "./listing-toolbar";
import { SWATCHES } from "./swatches";
import { summaryOf, useResults } from "./use-results";

type ListKey = Exclude<FacetKey, "stock" | "newIn">;

const SECTIONS: { key: ListKey; title: string }[] = [
  { key: "audience", title: "Audience" },
  { key: "colour", title: "Colour" },
  { key: "material", title: "Material" },
  { key: "price", title: "Price" },
  { key: "category", title: "Category" },
];

const itemsLabel = (count: number) => (count === 1 ? "1 item" : `${count} items`);

/**
 * The filter and sort sheet. It edits a draft of the query; "Show N items" (the draft's total,
 * from the same cached endpoint) applies it in one go, and closing without applying discards it.
 * Options with no results are disabled unless selected, so they can always be removed.
 */
export function FilterSheet({
  open,
  section,
  query,
  results,
  onClose,
  onApply,
}: {
  open: boolean;
  /** Which part to open on. */
  section: SheetSection;
  query: ResultsQuery;
  results: Results;
  onClose: () => void;
  onApply: (draft: ResultsQuery) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <FilterPanel section={section} query={query} results={results} onApply={onApply} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * The sheet's contents. The sheet mounts them on opening and unmounts them once its closing
 * animation ends, so each opening starts a fresh draft.
 */
function FilterPanel({
  section,
  query,
  results,
  onApply,
}: {
  section: SheetSection;
  query: ResultsQuery;
  results: Results;
  onApply: (draft: ResultsQuery) => void;
}) {
  const [draft, setDraft] = useState<ResultsQuery>(() => ({ ...query, page: 1 }));
  const { data, isPlaceholderData } = useResults(draft, results);
  const { facets, total } = data ? summaryOf(data) : results;

  const setFilters = (update: (filters: Filters) => Filters) =>
    setDraft((current) => ({ ...current, filters: update(current.filters) }));
  const toggle = (key: ListKey, value: string, on: boolean) =>
    setFilters((filters) =>
      on ? { ...filters, [key]: [...(filters[key] as string[]), value] } : withoutFilter(filters, { key, value }),
    );

  return (
    <>
      <div className="flex h-header shrink-0 items-center justify-between gap-4 border-b px-gutter">
        <SheetTitle className="eyebrow">Filter and sort</SheetTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="link"
            size="sm"
            disabled={activeFilterCount(draft.filters) === 0}
            onClick={() => setFilters(() => emptyFilters())}
          >
            Clear all
          </Button>
          <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-gutter">
        <FieldGroup className="gap-4 border-b py-5">
          {facets.stock.length > 0 && (
            <SwitchOption
              label={`In stock (${facets.stock[0].count})`}
              checked={draft.filters.stock}
              disabled={optionState(facets.stock[0].count, draft.filters.stock) === "disabled"}
              onChange={(stock) => setFilters((filters) => ({ ...filters, stock }))}
            />
          )}
          {facets.newIn.length > 0 && (
            <SwitchOption
              label={`New in (${facets.newIn[0].count})`}
              checked={draft.filters.newIn}
              disabled={optionState(facets.newIn[0].count, draft.filters.newIn) === "disabled"}
              onChange={(newIn) => setFilters((filters) => ({ ...filters, newIn }))}
            />
          )}
        </FieldGroup>

        <Accordion multiple defaultValue={section === "sort" ? ["sort"] : []}>
          <AccordionItem value="sort">
            <AccordionTrigger className="py-4 eyebrow">Sort by</AccordionTrigger>
            <AccordionContent className="pb-5">
              <RadioGroup
                aria-label="Sort by"
                value={draft.sort}
                onValueChange={(sort) => setDraft((current) => ({ ...current, sort: sort as Sort }))}
                className="gap-3"
              >
                {sortsFor(draft.scope).map((sort) => (
                  <RadioOption key={sort} value={sort} label={SORT_LABELS[sort]} />
                ))}
              </RadioGroup>
            </AccordionContent>
          </AccordionItem>

          {SECTIONS.filter(({ key }) => facets[key].length > 0).map(({ key, title }) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="py-4 eyebrow">{title}</AccordionTrigger>
              <AccordionContent className="pb-5">
                <FieldSet>
                  <FieldLegend className="sr-only">{title}</FieldLegend>
                  <FieldGroup className={cn("gap-3", key === "colour" && "grid grid-cols-2 sm:grid-cols-3")}>
                    {facets[key].map((option) => (
                      <CheckboxOption
                        key={option.value}
                        option={option}
                        swatch={key === "colour" ? SWATCHES[option.value as keyof typeof SWATCHES] : undefined}
                        checked={(draft.filters[key] as string[]).includes(option.value)}
                        onChange={(on) => toggle(key, option.value, on)}
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="shrink-0 border-t p-gutter">
        <Button className="w-full" aria-busy={isPlaceholderData} onClick={() => onApply(draft)}>
          Show {itemsLabel(total)}
        </Button>
      </div>
    </>
  );
}

function SwitchOption({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id} className="font-normal text-body">
        {label}
      </FieldLabel>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Field>
  );
}

function RadioOption({ value, label }: { value: string; label: string }) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <RadioGroupItem id={id} value={value} />
      <FieldLabel htmlFor={id} className="font-normal text-body">
        {label}
      </FieldLabel>
    </Field>
  );
}

function CheckboxOption({
  option,
  swatch,
  checked,
  onChange,
}: {
  option: Facet;
  swatch?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const disabled = optionState(option.count, checked) === "disabled";
  return (
    <Field orientation="horizontal" data-disabled={disabled || undefined}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <FieldLabel htmlFor={id} className="font-normal text-body">
        {swatch && <span aria-hidden className="size-4 shrink-0 border border-border-strong" style={{ background: swatch }} />}
        {option.label} ({option.count})
      </FieldLabel>
    </Field>
  );
}
