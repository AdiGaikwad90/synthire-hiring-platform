import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  if (!name?.trim()) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ── Date formatting ──────────────────────────────────────────────────────────
//
// Always use these. A bare `toLocaleDateString()` follows the VIEWER's browser
// locale, so the same screen renders "9/8/2026" for one user and "08/09/2026"
// for another. Every helper below pins "en-US" so output is identical
// everywhere, and returns an em dash for a missing or unparseable value rather
// than the string "Invalid Date".

const EMPTY = "—";

function toDate(d: Date | string | null | undefined): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sep 8, 2026" — default for any date shown in a list or detail row. */
export function formatDate(d: Date | string | null | undefined): string {
  const date = toDate(d);
  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : EMPTY;
}

/** "Monday, September 8" — page headers only. */
export function formatDateLong(d: Date | string | null | undefined): string {
  const date = toDate(d);
  return date
    ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : EMPTY;
}

/** "02:30 PM" — when the date is already implied by context. */
export function formatTime(d: Date | string | null | undefined): string {
  const date = toDate(d);
  return date
    ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : EMPTY;
}

/** "Mon, Sep 8, 02:30 PM" — scheduling surfaces needing both. */
export function formatDateTime(d: Date | string | null | undefined): string {
  const date = toDate(d);
  return date
    ? date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : EMPTY;
}
