"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";

import {
  NON_CONTAINS_FILTER_OPERATORS,
  findFilterColumn,
  formatFilterInput,
  getFilterOperatorLabel,
  getFilterOperatorSyntax,
  parseFilterInput,
  type FilterOperator,
} from "@/lib/nautilus/filter";
import type { ColumnDefinition } from "@/lib/nautilus/types";

interface FilterInputProps {
  columns: ColumnDefinition[];
  initialFilterText?: string;
  initialFilterColumn?: string;
  initialFilterOperator?: string;
  onSearch: (filterText: string, filterColumn: string | null, filterOperator: string | null) => void;
}

type FilterOptionType =
  | "general"
  | "specific"
  | "column-search"
  | "column-suggestion"
  | "operator-suggestion"
  | "logical-suggestion";

interface FilterOption {
  type: FilterOptionType;
  label: string;
  text: string;
  column: string | null;
  operator: FilterOperator | null;
}

const OPTION_HINT: Partial<Record<FilterOptionType, string>> = {
  "column-suggestion": "Autocomplete column",
  "column-search": "Specific column filtering",
  "logical-suggestion": "Combine query conditions",
};

function matchingColumns(columns: ColumnDefinition[], value: string): ColumnDefinition[] {
  const query = value.toLowerCase();
  return columns.filter(
    (column) =>
      column.name.toLowerCase().startsWith(query)
      || column.label.toLowerCase().startsWith(query),
  );
}

function buildOptions(columns: ColumnDefinition[], inputValue: string): FilterOption[] {
  const parsed = parseFilterInput(inputValue);
  const options: FilterOption[] = [];
  const columnSuggestions = parsed.hasColon ? columns : matchingColumns(columns, parsed.columnName);

  if (!inputValue.trim()) {
    return columns.slice(0, 3).map((column) => ({
      type: "column-suggestion",
      label: `Filter by ${column.label}...`,
      text: "",
      column: column.name,
      operator: null,
    }));
  }

  if (!parsed.hasColon) {
    const exactMatch = columns.find(
      (column) => column.name.toLowerCase() === parsed.columnName.toLowerCase(),
    );

    if (!parsed.columnName.includes(" ")) {
      const suggestedColumns = exactMatch ? [exactMatch] : columnSuggestions.slice(0, 3);
      for (const column of suggestedColumns) {
        options.push({
          type: "column-suggestion",
          label: `Filter by ${column.label}...`,
          text: "",
          column: column.name,
          operator: null,
        });
      }
    }

    options.push({
      type: "general",
      label: `Search all columns for "${parsed.columnName}"`,
      text: parsed.columnName,
      column: null,
      operator: null,
    });

    for (const column of columnSuggestions.slice(0, 3)) {
      if (!parsed.columnName) break;
      options.push({
        type: "column-search",
        label: `Search in ${column.label} for "${parsed.columnName}"`,
        text: parsed.columnName,
        column: column.name,
        operator: "contains",
      });
    }
  } else {
    const column = columns.find(
      (candidate) => candidate.name.toLowerCase() === parsed.columnName.toLowerCase(),
    );

    if (column) {
      options.push({
        type: "specific",
        label: `Where ${column.label} ${getFilterOperatorLabel(parsed.operator)} "${parsed.searchValue}"`,
        text: parsed.searchValue,
        column: column.name,
        operator: parsed.operator,
      });

      if (parsed.rawOperator === ":" && !parsed.searchValue) {
        for (const operator of NON_CONTAINS_FILTER_OPERATORS) {
          options.push({
            type: "operator-suggestion",
            label: `${column.label} ${getFilterOperatorSyntax(operator).slice(1)}`,
            text: getFilterOperatorSyntax(operator),
            column: column.name,
            operator,
          });
        }
      }
    }
  }

  if (inputValue.endsWith(" ") && parsed.hasColon && parsed.searchValue) {
    for (const logical of ["AND", "OR"] as const) {
      options.push({
        type: "logical-suggestion",
        label: `${logical} (${logical === "AND" ? "Match all conditions" : "Match any condition"})`,
        text: logical,
        column: null,
        operator: null,
      });
    }
  }

  return options;
}

export function FilterInput({
  columns,
  initialFilterText = "",
  initialFilterColumn,
  initialFilterOperator,
  onSearch,
}: FilterInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(() =>
    formatFilterInput(columns, initialFilterText, initialFilterColumn, initialFilterOperator),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => buildOptions(columns, inputValue), [columns, inputValue]);

  useEffect(() => {
    setInputValue(formatFilterInput(columns, initialFilterText, initialFilterColumn, initialFilterOperator));
  }, [columns, initialFilterColumn, initialFilterOperator, initialFilterText]);

  const submitCurrent = () => {
    setIsOpen(false);
    const parsed = parseFilterInput(inputValue);
    onSearch(
      parsed.prefix || !parsed.hasColon ? inputValue : parsed.searchValue,
      parsed.prefix || !parsed.hasColon ? null : findFilterColumn(columns, parsed.columnName)?.name ?? null,
      parsed.prefix || !parsed.hasColon ? null : parsed.operator,
    );
  };

  const selectOption = (option: FilterOption) => {
    const parsed = parseFilterInput(inputValue);
    if (["column-suggestion", "operator-suggestion", "logical-suggestion"].includes(option.type)) {
      setInputValue(option.type === "logical-suggestion"
        ? `${inputValue.trim()} ${option.text} `
        : `${parsed.prefix}${option.column}${option.type === "column-suggestion" ? ":" : option.text}`);
      inputRef.current?.focus();
      return;
    }

    const nextValue = option.column
      ? `${parsed.prefix}${option.column}${getFilterOperatorSyntax(option.operator)}${option.text}`
      : `${parsed.prefix}${option.text}`;
    setInputValue(nextValue);
    setIsOpen(false);
    onSearch(parsed.prefix ? nextValue : option.text, parsed.prefix ? null : option.column, parsed.prefix ? null : option.operator);
  };

  return (
    <Command
      label="Filter rows"
      shouldFilter={false}
      vimBindings={false}
      className="relative w-full flex-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setIsOpen(false);
        } else if (event.key === "Enter" && (!isOpen || options.length === 0)) {
          event.preventDefault();
          submitCurrent();
        } else if (event.key !== "Enter") {
          setIsOpen(true);
        }
      }}
    >
      <div className="relative flex w-full items-center px-4 py-1.5 text-zinc-400 focus-within:bg-zinc-800/50 focus-within:text-white">
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
          <path d="M14.386 14.386L18.5 18.5M16.416 9.208A7.208 7.208 0 112 9.208a7.208 7.208 0 0114.416 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Command.Input
          ref={inputRef}
          value={inputValue}
          onValueChange={(value) => {
            setInputValue(value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Filter rows..."
          className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
        />
        {inputValue && <button
          type="button"
          aria-label="Clear filter"
          onClick={() => {
            setInputValue("");
            onSearch("", null, null);
            inputRef.current?.focus();
          }}
          className="transition-colors hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>}
      </div>
      {isOpen && <div className="absolute top-full left-0 z-50 mt-2 w-full overflow-hidden rounded-xl border border-(--line) bg-(--panel-2) shadow-xl">
        <Command.List className="max-h-64 overflow-y-auto p-1" onMouseDown={(event) => event.preventDefault()}>
          {options.map((option, index) => <Command.Item
            key={`${option.type}-${option.label}-${index}`}
            value={String(index)}
            onSelect={() => selectOption(option)}
            className="flex w-full cursor-pointer flex-col rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white"
          >
            <span>{option.label}</span>
            {OPTION_HINT[option.type] && <span className="mt-0.5 text-[10px] uppercase tracking-widest text-(--muted)">
              {OPTION_HINT[option.type]}
            </span>}
          </Command.Item>)}
          <Command.Empty className="px-4 py-3 text-sm text-(--muted)">
            No specific filters matched... Hit Enter to search anyway.
          </Command.Empty>
        </Command.List>
        {options.length > 0 && <div className="border-t border-(--line) bg-zinc-900 px-3 py-2 text-xs text-(--muted)">
          Tip: Type <span className="font-mono text-zinc-300">columnName:</span> to narrow search
        </div>}
      </div>}
    </Command>
  );
}
