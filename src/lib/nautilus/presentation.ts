import type { InputType } from "@/lib/nautilus/types";
import { sortObjectKeys } from "@/lib/nautilus/utils";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateForInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTimeForInput(date: Date): string {
  return `${formatDateForInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeForInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function stringifyValue(
  value: unknown,
  options?: {
    inputType?: InputType | null;
    mode?: "display" | "input";
  },
): string {
  const inputType = options?.inputType ?? null;
  const mode = options?.mode ?? "display";

  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return String(value);

  if (value instanceof Date) {
    if (mode === "input") {
      return inputType === "date"
        ? formatDateForInput(value)
        : inputType === "time"
          ? formatTimeForInput(value)
          : formatDateTimeForInput(value);
    }
    return value.toISOString();
  }

  return typeof value === "object"
    ? JSON.stringify(sortObjectKeys(value))
    : String(value);
}

export const formatCell = stringifyValue;
export const serializeRelationValue = stringifyValue;
export const inputValue = (value: unknown, inputType?: InputType | null) =>
  stringifyValue(value, { inputType, mode: "input" });
