"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SearchPanel } from "./search-panel";

/**
 * The header's search icon. It opens the search panel: from the top, full-screen on phones and
 * as a panel over the header (with a backdrop) from md. The field takes focus on opening, and
 * Esc or Close return it to this button. Following a link, submitting, Back and Forward close it.
 */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Back or Forward navigates the page under the panel; close it so the page is visible.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Search">
        <SearchIcon />
      </SheetTrigger>
      <SheetContent
        side="top"
        showCloseButton={false}
        initialFocus={input}
        className="gap-0 p-0 max-md:data-[side=top]:h-dvh md:max-h-[85dvh]"
      >
        <SearchPanel inputRef={input} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
