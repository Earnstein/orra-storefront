"use client";

import { useDebouncedCallback } from "@tanstack/react-pacer";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper, rowPaginationFeature, rowSortingFeature, tableFeatures, useTable, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminProductRow } from "@/lib/admin/products/queries";
import { ADMIN_PAGE_SIZE, ADMIN_PRODUCT_SORTS, adminProductParsers, adminProductsPath, sortDirection, type AdminProductSort } from "@/lib/admin/table-params";
import { signInPath } from "@/lib/auth/return-to";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AdminProductsPage = { rows: AdminProductRow[]; total: number; page: number };

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
const helper = createColumnHelper<typeof features, AdminProductRow>();
const columns = helper.columns([
  helper.accessor("name", { header: "Product" }),
  helper.accessor("category", { header: "Category", enableSorting: false }),
  helper.accessor("price", { header: "Price" }),
  helper.accessor("stock", { header: "Stock" }),
]);
const noRows: AdminProductRow[] = [];

async function fetchPage(path: string, signal: AbortSignal): Promise<AdminProductsPage> {
  const response = await fetch(path, { signal });
  if (response.status === 401) {
    window.location.assign(signInPath(`${window.location.pathname}${window.location.search}`));
    throw new Error("signed out");
  }
  if (!response.ok) throw new Error(`Products request failed: ${response.status}`);
  return (await response.json()) as AdminProductsPage;
}

/**
 * The admin's products: search (name or slug), Active / Archived, sorting by name, price or
 * stock, 25 a page. State lives in the URL (src/lib/admin/table-params.ts); the server does the
 * searching, sorting and paging (TanStack Table in manual mode), and the page's first load comes
 * from the server render (`initial`). Rows stack below md.
 */
export function ProductsTable({ initial, initialPath }: { initial: AdminProductsPage; initialPath: string }) {
  const [params, setParams] = useQueryStates(adminProductParsers, { history: "push" });
  const [text, setText] = useState(params.q);
  // Back and Forward change ?q without typing: show what the URL searches for.
  const [shownQ, setShownQ] = useState(params.q);
  if (params.q !== shownQ) {
    setShownQ(params.q);
    if (params.q !== text.trim()) setText(params.q);
  }
  const search = useDebouncedCallback((q: string) => void setParams({ q: q.trim() || null, page: null }, { history: "replace" }), { wait: 300 });

  const path = adminProductsPath(params);
  const { data, isPlaceholderData, isError, refetch } = useQuery({
    queryKey: ["admin-products", path],
    queryFn: ({ signal }) => fetchPage(path, signal),
    initialData: path === initialPath ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  const sorting: SortingState = params.sort === "newest" ? [] : [{ id: params.sort, desc: sortDirection(params) === "desc" }];
  const table = useTable({
    features,
    columns,
    data: data?.rows ?? noRows,
    rowCount: data?.total ?? 0,
    manualSorting: true,
    manualPagination: true,
    state: { sorting, pagination: { pageIndex: (data?.page ?? params.page) - 1, pageSize: ADMIN_PAGE_SIZE } },
    onSortingChange: (updater) => {
      const [next] = typeof updater === "function" ? updater(sorting) : updater;
      const sort = (next && ADMIN_PRODUCT_SORTS.includes(next.id as AdminProductSort) ? next.id : "newest") as AdminProductSort;
      void setParams({ sort: sort === "newest" ? null : sort, dir: next ? (next.desc ? "desc" : "asc") : null, page: null });
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: (data?.page ?? params.page) - 1, pageSize: ADMIN_PAGE_SIZE };
      const next = typeof updater === "function" ? updater(current) : updater;
      void setParams({ page: next.pageIndex > 0 ? next.pageIndex + 1 : null });
    },
  });

  const rows = table.getRowModel().rows.map((row) => row.original);
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const first = total === 0 ? 0 : (page - 1) * ADMIN_PAGE_SIZE + 1;
  const last = Math.min(page * ADMIN_PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-6" role="group" aria-label="Status">
          {(["active", "archived"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={params.status === status}
              className={cn("eyebrow", params.status === status ? "link" : "link-quiet text-muted-foreground")}
              onClick={() => void setParams({ status: status === "active" ? null : status, page: null })}
            >
              {status === "active" ? "Active" : "Archived"}
            </button>
          ))}
        </div>
        <label className="flex w-full flex-col gap-1 sm:w-72">
          <span className="sr-only">Search products</span>
          <Input
            type="search"
            placeholder="Search by name or slug"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              search(event.target.value);
            }}
          />
        </label>
      </div>

      <p className="text-caption text-muted-foreground" aria-live="polite">
        {isError ? "" : total === 0 ? "" : `Showing ${first}–${last} of ${total}`}
      </p>

      {isError && !data ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>We couldn&apos;t load the products.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-section text-center text-muted-foreground">
          {params.q ? `No products match ‘${params.q}’.` : params.status === "archived" ? "No archived products." : "No products yet."}
        </p>
      ) : (
        <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
          <Table className="max-md:hidden">
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => {
                    const direction = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
                        className={cn(header.column.id !== "name" && header.column.id !== "category" && "text-right")}
                      >
                        {header.column.getCanSort() ? (
                          <button type="button" className="eyebrow inline-flex items-center gap-1 link-quiet" onClick={header.column.getToggleSortingHandler()}>
                            <table.FlexRender header={header} />
                            {direction === "asc" && <ArrowUp aria-hidden className="size-3" />}
                            {direction === "desc" && <ArrowDown aria-hidden className="size-3" />}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <ProductName row={row} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.category}</TableCell>
                  <TableCell className="text-right">{formatPrice(row.price)}</TableCell>
                  <TableCell className="text-right">
                    <StockCell row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul className="flex flex-col md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 border-b py-4 first:border-t">
                <ProductName row={row} />
                <div className="flex shrink-0 flex-col items-end gap-1 text-caption">
                  <span>{formatPrice(row.price)}</span>
                  <StockCell row={row} labelled />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > ADMIN_PAGE_SIZE && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-4">
          <Button variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous
          </Button>
          <span className="text-caption text-muted-foreground">
            Page {page} of {table.getPageCount()}
          </span>
          <Button variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

function ProductName({ row }: { row: AdminProductRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative size-12 shrink-0 bg-surface">
        {row.image && <Image src={row.image.src} alt="" fill sizes="48px" className="object-cover" />}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Link href={`/admin/products/${row.slug}`} className="link-quiet truncate uppercase">
          {row.name}
        </Link>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="truncate">{row.slug}</span>
          {row.archived && <Badge variant="outline">Archived</Badge>}
        </span>
      </div>
    </div>
  );
}

/** Stock left, and what checkouts hold. `labelled` (stacked rows, no column header) says "in stock". */
function StockCell({ row, labelled = false }: { row: AdminProductRow; labelled?: boolean }) {
  return (
    <span className="flex flex-col items-end">
      <span className={cn(row.stock === 0 && "text-muted-foreground")}>
        {row.stock === 0 ? "Sold out" : labelled ? `${row.stock} in stock` : row.stock}
      </span>
      {row.held > 0 && <span className="text-muted-foreground">{row.held} held</span>}
    </span>
  );
}
