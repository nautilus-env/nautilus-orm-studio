import type { ColumnDefinition } from "@/lib/nautilus/types";

export class InvalidFieldValueError extends Error {}

export function coerceFieldValue(
  rawValue: FormDataEntryValue | null,
  column: ColumnDefinition,
  preview = false,
): unknown {
  if (column.inputType === "checkbox" && rawValue === null) return column.nullable ? null : false;
  const input = rawValue === null ? null : String(rawValue);
  const emptyRelation = input === "" && column.nullable && (column.relation || column.enumValues.length > 0);
  const literalNull = !preview && input === "NULL" && column.nullable && ["string", "json", "list"].includes(column.kind);
  const normalized = emptyRelation || literalNull
    ? null
    : !preview && column.kind !== "string" ? input?.trim() || null : input;
  if (normalized === null) {
    if (!preview && column.required && !column.nullable) {
      throw new InvalidFieldValueError(`${column.label} is required.`);
    }
    return null;
  }
  try {
    if (!preview && column.enumValues.length > 0) {
      if (!column.enumValues.includes(normalized)) {
        throw new InvalidFieldValueError(`${column.label} must be one of: ${column.enumValues.join(", ")}.`);
      }
      return normalized;
    }
    switch (column.kind) {
      case "boolean": {
        if (preview) return normalized;
        const value = normalized.toLowerCase();
        if (["1", "true", "yes", "on"].includes(value)) return true;
        if (["0", "false", "no", "off"].includes(value)) return false;
        throw new InvalidFieldValueError(`${column.label} must be a valid boolean value.`);
      }
      case "int":
      case "float":
      case "decimal": {
        const value = column.kind === "int" && !preview ? Number.parseInt(normalized, 10) : Number(normalized);
        return preview && Number.isNaN(value) ? normalized : value;
      }
      case "date":
      case "datetime":
      case "time":
        return preview ? normalized : new Date(normalized);
      case "json":
      case "list": {
        const parsed = JSON.parse(normalized);
        if (preview) return parsed;
        const valid = column.kind === "list"
          ? Array.isArray(parsed)
          : parsed && typeof parsed === "object" && !Array.isArray(parsed);
        if (valid) return parsed;
        throw new InvalidFieldValueError(`${column.label} must be a JSON ${column.kind === "list" ? "array" : "object"}.`);
      }
      default:
        return normalized;
    }
  } catch (error) {
    if (preview) return normalized;
    if (error instanceof InvalidFieldValueError) throw error;
    throw new InvalidFieldValueError(`${column.label} has an invalid value.`);
  }
}

export function readFieldValue(column: ColumnDefinition, formData: FormData, preview = false): unknown {
  if (formData.has(`${column.name}-is-null`)) {
    if (!preview && !column.nullable) throw new InvalidFieldValueError(`${column.label} cannot be null.`);
    return null;
  }
  const rawValue = formData.get(column.name);
  return column.inputType === "checkbox" && (preview || rawValue === null)
    ? rawValue !== null
    : coerceFieldValue(rawValue, column, preview);
}
