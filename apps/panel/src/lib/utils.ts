import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

/** Formats a MiB value (the unit used for all panel limits). */
export function formatMib(mib: number): string {
  if (mib === 0) return "Unlimited";
  if (mib < 1024) return `${mib} MiB`;
  return `${(mib / 1024).toFixed(mib % 1024 === 0 ? 0 : 1)} GiB`;
}

export function formatCpu(percent: number): string {
  if (percent === 0) return "Unlimited";
  return `${percent}%`;
}

export function formatUptime(ms: number): string {
  if (!ms || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function percent(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

const BILLING_CYCLE_SUFFIX: Record<string, string> = {
  monthly: "/mo",
  yearly: "/yr",
  once: "",
  free: "",
};

/**
 * Formats an integer-cents price for display, e.g. formatPrice(999, "USD",
 * "monthly") → "$9.99/mo". A free/zero-priced plan renders as "Free".
 */
export function formatPrice(priceCents: number, currency = "USD", billingCycle = "monthly"): string {
  if (billingCycle === "free" || priceCents <= 0) return "Free";
  let body: string;
  try {
    body = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
  } catch {
    body = `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
  return `${body}${BILLING_CYCLE_SUFFIX[billingCycle] ?? ""}`;
}
