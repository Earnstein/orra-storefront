"use client";

import { useDebouncedCallback } from "@tanstack/react-pacer";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper, rowPaginationFeature, tableFeatures, useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useQueryStates } from "nuqs";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_ORDER_STATUS_LABELS } from "@/lib/admin/orders/labels";
import type { AdminOrderRow } from "@/lib/admin/orders/types";
import { ADMIN_ORDER_STATUSES, ADMIN_PAGE_SIZE, adminOrderParsers, adminOrdersPath } from "@/lib/admin/table-params";
import { signInPath } from "@/lib/auth/return-to";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "./order-status-badge";

export type AdminOrdersPage = { rows: AdminOrderRow[]; total: number; page: number };

const features = tableFeatures({ rowPaginationFeature });
const helper = createColumnHelper<typeof features, AdminOrderRow>();
const columns = helper.columns([
  helper.accessor("number", { header: "Order" }),
  helper.accessor("createdAt", { header: "Date" }),
  helper.accessor("email", { header: "Customer" }),
  helper.accessor("status", { header: "Status" }),
  helper.accessor("itemCount", { header: "Items" }),
  helper.accessor("total", { header: "Total" }),
]);
const RIGHT = new Set(["itemCount", "total"]);
const noRows: AdminOrderRow[] = [];
// UTC, as the detail page and the order emails, so the server and browser renders agree.
const dateFormat = new Intl.DateTimeFormat(site.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));

async function fetchPage(path: string, signal: AbortSignal): Promise<AdminOrdersPage> {
  const response = await fetch(path, { signal });
  if (response.status === 401) {
    window.location.assign(signInPath(`${window.location.pathname}${window.location.search}`));
    throw new Error("signed out");
  }
  if (!response.ok) throw new Error(`Orders request failed: ${response.status}`);
  return (await response.json()) as AdminOrdersPage;
}

/**
 * Every order, newest first: search by number (the owner also by email), filter by status, 25 a
 * page. State lives in the URL (src/lib/admin/table-params.ts); the server pages (TanStack Table in
 * manual mode) and the first load comes from the server render. For the demo admin the server
 * sends names and emails masked. Rows stack below md.
 */
export function OrdersTable({ initial, initialPath, masked }: { initial: AdminOrdersPage; initialPath: string; masked: boolean }) {
  const [params, setParams] = useQueryStates(adminOrderParsers, { history: "push" });
  const [text, setText] = useState(params.q);
  // Back and Forward change ?q without typing: show what the URL searches for.
  const [shownQ, setShownQ] = useState(params.q);
  if (params.q !== shownQ) {
    setShownQ(params.q);
    if (params.q !== text.trim()) setText(params.q);
  }
  const search = useDebouncedCallback((q: string) => void setParams({ q: q.trim() || null, page: null }, { history: "replace" }), { wait: 300 });

  const path = adminOrdersPath(params);
  const { data, isPlaceholderData, isError, refetch } = useQuery({
    queryKey: ["admin-orders", path],
    queryFn: ({ signal }) => fetchPage(path, signal),
    initialData: path === initialPath ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  const pagination = { pageIndex: (data?.page ?? params.page) - 1, pageSize: ADMIN_PAGE_SIZE };
  const table = useTable({
    features,
    columns,
    data: data?.rows ?? noRows,
    rowCount: data?.total ?? 0,
    manualPagination: true,
    state: { pagination },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2" role="group" aria-label="Status">
          {ADMIN_ORDER_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={params.status === status}
              className={cn("eyebrow", params.status === status ? "link" : "link-quiet text-muted-foreground")}
              onClick={() => void setParams({ status: status === "all" ? null : status, page: null })}
            >
              {status === "all" ? "All" : ADMIN_ORDER_STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <label className="flex w-full flex-col gap-1 sm:w-72">
          <span className="sr-only">Search orders</span>
          <Input
            type="search"
            placeholder={masked ? "Search by order number" : "Search by order number or email"}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              search(event.target.value);
            }}
          />
        </label>
      </div>

      <p className="text-caption text-muted-foreground" aria-live="polite">
        {isError || total === 0 ? "" : `Showing ${first}–${last} of ${total}`}
      </p>

      {isError && !data ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>We couldn&apos;t load the orders.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-section text-center text-muted-foreground">
          {params.q ? `No orders match ‘${params.q}’.` : params.status === "all" ? "No orders yet." : `No ${ADMIN_ORDER_STATUS_LABELS[params.status].toLowerCase()} orders.`}
        </p>
      ) : (
        <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
          <Table className="max-md:hidden">
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => (
                    <TableHead key={header.id} className={cn(RIGHT.has(header.column.id) && "text-right")}>
                      <table.FlexRender header={header} />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.number}>
                  <TableCell>
                    <OrderLink number={row.number} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <Customer row={row} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">{row.itemCount}</TableCell>
                  <TableCell className="text-right">{formatPrice(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul className="flex flex-col md:hidden">
            {rows.map((row) => (
              <li key={row.number} className="flex items-start justify-between gap-4 border-b py-4 first:border-t">
                <div className="flex min-w-0 flex-col gap-1">
                  <OrderLink number={row.number} />
                  <span className="text-caption text-muted-foreground">{formatDate(row.createdAt)}</span>
                  <Customer row={row} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-caption">
                  <OrderStatusBadge status={row.status} />
                  <span>{formatPrice(row.total)}</span>
                  <span className="text-muted-foreground">
                    {row.itemCount} {row.itemCount === 1 ? "item" : "items"}
                  </span>
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

function OrderLink({ number }: { number: string }) {
  return (
    <Link href={`/admin/orders/${number}`} className="link-quiet whitespace-nowrap uppercase">
      {number}
    </Link>
  );
}

function Customer({ row }: { row: AdminOrderRow }) {
  return (
    <span className="flex min-w-0 flex-col">
      {row.name && <span className="truncate">{row.name}</span>}
      <span className="truncate text-muted-foreground">{row.email}</span>
    </span>
  );
}
