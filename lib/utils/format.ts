import { format } from "date-fns";

export function formatDate(value: string, pattern = "yyyy.MM.dd") {
  return format(new Date(value), pattern);
}

export function formatPercent(value?: number) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}
