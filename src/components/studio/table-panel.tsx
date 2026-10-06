"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { DataGrid, SelectColumn, type Column } from "react-data-grid";
import "react-data-grid/lib/styles.css";

import {
  applyInlineEditsAction,
  createRowAction,
  deleteRowsAction,
  updateRowAction,
} from "@/app/actions";
import { CopyValue } from "@/components/studio/copy-value";
import { DeleteRowForm } from "@/components/studio/delete-row-form";
import { FilterInput } from "@/components/studio/filter-input";
import { InlineCellEditor } from "@/components/studio/inline-cell-editor";
import { RowFormPanel } from "@/components/studio/row-form-panel";
import { serializeRelationValue } from "@/lib/nautilus/presentation";
import { readFieldValue } from "@/lib/nautilus/field-value";
import type {
  ColumnDefinition,
  InlineEditEntry,
  InlineEditOperation,
  TableView,
} from "@/lib/nautilus/types";

type RowRecord = Record<string, unknown>;
type StagedInlineEdit = InlineEditOperation & {
  key: string;
  columnName: string;
  previewValue: unknown;
};

function inlineEditKey(rowKey: string, columnName: string): string {
  return `${rowKey}:${columnName}`;
}

function serializeInlineEntries(formData: FormData): InlineEditEntry[] {
  return Array.from(formData.entries()).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

function rowKeyFor(primaryKey: string | null, row: RowRecord): string {
  return serializeRelationValue(row[primaryKey ?? ""]);
}

function PanelMessage({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "warning";
}) {
  const toneClass = tone === "warning"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
    : "border-red-500/40 bg-red-500/10 text-red-200";

  return (
    <div className="px-6 pt-4">
      <div className={`rounded-[1.25rem] border px-4 py-3 text-sm ${toneClass}`}>{children}</div>
    </div>
  );
}

export function TablePanel({ view }: { view: TableView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const table = view.table;
  const primaryKey = table.primaryKey;
  const searchParamsStr = searchParams.toString();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasOpenInlineEditor, setHasOpenInlineEditor] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [stagedEdits, setStagedEdits] = useState<StagedInlineEdit[]>([]);
  const [isPending, startTransition] = useTransition();
  const stagedEditsByKey = useMemo(
    () => new Map(stagedEdits.map((edit) => [edit.key, edit])),
    [stagedEdits],
  );
  const displayedRows = useMemo(
    () => view.rows.map((row) => ({
      ...row,
      ...Object.fromEntries(stagedEdits.filter((edit) => edit.pk === rowKeyFor(primaryKey, row))
        .map((edit) => [edit.columnName, edit.previewValue])),
    })),
    [primaryKey, stagedEdits, view.rows],
  );
  const stagedEditCount = stagedEdits.length;
  const hasStagedEdits = stagedEditCount > 0;
  const firstSelectedKey = selectedRowKeys.values().next().value as string | undefined;
  const selectedRow = firstSelectedKey
    ? displayedRows.find((row) => rowKeyFor(primaryKey, row as RowRecord) === firstSelectedKey)
    : null;

  const updateSearch = (updates: Record<string, string | null>, keepPage = false) => {
    const nextSearchParams = new URLSearchParams(searchParamsStr);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        nextSearchParams.delete(key);
      } else {
        nextSearchParams.set(key, value);
      }
    }
    if (!keepPage && !("page" in updates)) {
      nextSearchParams.set("page", "1");
    }
    startTransition(() => {
      router.push(`${pathname}?${nextSearchParams.toString()}`);
    });
  };

  const stageInlineEdit = (
    rowKey: string,
    column: ColumnDefinition,
    currentValue: unknown,
    formData: FormData,
  ) => {
    const nextEdit: StagedInlineEdit = {
      key: inlineEditKey(rowKey, column.name),
      pk: rowKey,
      columnName: column.name,
      entries: serializeInlineEntries(formData),
      previewValue: readFieldValue(column, formData, true),
    };

    setStagedEdits((current) => {
      const nextEdits = current.filter((edit) => edit.key !== nextEdit.key);
      return serializeRelationValue(nextEdit.previewValue) !== serializeRelationValue(currentValue)
        ? [...nextEdits, nextEdit]
        : nextEdits;
    });
    setInlineError(null);
  };

  const applyInlineEdits = (useTransaction: boolean) => {
    if (!stagedEdits.length || hasOpenInlineEditor) {
      return;
    }

    startTransition(async () => {
      setInlineError(null);
      const result = await applyInlineEditsAction(
        table.slug,
        stagedEdits.map(({ pk, entries }) => ({ pk, entries })),
        useTransaction,
      );
      setStagedEdits((current) => result.errorMessage ? current.slice(result.appliedCount) : []);
      setInlineError(result.errorMessage);
      if (result.appliedCount > 0 || !result.errorMessage) router.refresh();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">{table.displayName}</h2>
          <p className="mt-2 text-sm text-(--muted)">{view.totalRows} rows</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {table.supportsCrud && selectedRowKeys.size > 0 ? (
            <>
              {selectedRowKeys.size === 1 ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="cursor-pointer rounded-lg border border-(--line) px-2 py-1 text-[11px] tracking-wide transition hover:border-zinc-500 hover:text-white"
                >
                  Edit
                </button>
              ) : null}
              <DeleteRowForm
                count={selectedRowKeys.size}
                action={async () => {
                  startTransition(async () => {
                    await deleteRowsAction(table.slug, Array.from(selectedRowKeys), searchParamsStr);
                    setSelectedRowKeys(new Set());
                  });
                }}
              />
              <div className="mx-1 h-8 w-px bg-(--line)" />
            </>
          ) : null}

          {hasStagedEdits ? (
            <>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] tracking-wide text-emerald-200">
                {stagedEditCount} pending {stagedEditCount === 1 ? "edit" : "edits"}
              </div>
              <button
                type="button"
                onClick={() => applyInlineEdits(false)}
                disabled={isPending || hasOpenInlineEditor}
                className="rounded-lg border border-emerald-500/40 px-2.5 py-1 text-[11px] tracking-wide transition hover:border-emerald-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply edits
              </button>
              <button
                type="button"
                onClick={() => applyInlineEdits(true)}
                disabled={isPending || hasOpenInlineEditor}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] tracking-wide text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply in transaction
              </button>
              <button
                type="button"
                onClick={() => {
                  setStagedEdits([]);
                  setInlineError(null);
                }}
                disabled={isPending}
                className="rounded-lg border border-red-500/40 px-2.5 py-1 text-[11px] tracking-wide transition hover:border-red-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <div className="mx-1 h-8 w-px bg-(--line)" />
            </>
          ) : null}

          {table.supportsCrud ? (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="cursor-pointer rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium tracking-wide text-black transition hover:bg-zinc-200"
            >
              Create row
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex border-t border-(--line) bg-zinc-900 px-2">
        <FilterInput
          columns={table.columns}
          initialFilterText={view.filterText}
          initialFilterColumn={view.filterColumn}
          initialFilterOperator={view.filterOperator}
          onSearch={(filterText, filterColumn, filterOperator) =>
            updateSearch({
              filter_text: filterText || null,
              filter_column: filterColumn,
              filter_operator: filterOperator,
            })}
        />
      </div>

      {view.errorMessage ? <PanelMessage>{view.errorMessage}</PanelMessage> : null}
      {inlineError ? <PanelMessage>{inlineError}</PanelMessage> : null}
      {hasStagedEdits && hasOpenInlineEditor ? (
        <PanelMessage tone="warning">
          Stage or cancel the open cell before applying the pending edits.
        </PanelMessage>
      ) : null}

      <DataGrid<RowRecord, unknown, string>
        className="studio-grid min-h-0 flex-1"
        aria-label={table.displayName}
        columns={[
          { ...SelectColumn, width: 48, minWidth: 48, maxWidth: 48 },
          ...table.columns.map((column): Column<RowRecord> => ({
            key: column.name,
            name: <div className="text-xs uppercase">
              {column.label}
              <div className="mt-1 text-[10px] tracking-[0.16em] text-zinc-500">{column.enumValues.length > 0 ? "enum" : column.kind}</div>
              {column.relation && <div className="mt-1 text-[10px] text-zinc-500">
                {column.relation.displayName}.{column.relation.targetColumn}
              </div>}
            </div>,
            editable: table.supportsCrud && column.name !== primaryKey && !isPending,
            cellClass: (row) => stagedEditsByKey.has(inlineEditKey(rowKeyFor(primaryKey, row), column.name))
              ? "studio-pending" : undefined,
            renderCell: ({ row }) => <CopyValue value={row[column.name]} />,
            editorOptions: { commitOnOutsideClick: false },
            renderEditCell: ({ row, rowIdx, onClose }) => <InlineCellEditor
              column={column}
              row={row}
              onClose={() => onClose(false)}
              onEditingChange={setHasOpenInlineEditor}
              onStage={(formData) => {
                stageInlineEdit(rowKeyFor(primaryKey, row), column, view.rows[rowIdx][column.name], formData);
                onClose(false);
              }}
            />,
          })),
        ]}
        rows={isPending ? [] : displayedRows}
        rowKeyGetter={(row) => rowKeyFor(primaryKey, row)}
        selectedRows={selectedRowKeys}
        onSelectedRowsChange={setSelectedRowKeys}
        defaultColumnOptions={{ width: 150, minWidth: 80, resizable: true, sortable: true }}
        headerRowHeight={table.columns.some((column) => column.relation) ? 80 : 60}
        rowHeight={40}
        sortColumns={view.orderColumn ? [{
          columnKey: view.orderColumn,
          direction: view.orderDirection === "desc" ? "DESC" : "ASC",
        }] : []}
        onSortColumnsChange={(sortColumns) => {
          const sort = sortColumns.at(-1);
          updateSearch({ order_column: sort?.columnKey ?? null, order_direction: sort?.direction.toLowerCase() ?? null });
        }}
        onCellKeyDown={({ mode }, event) => {
          if (mode === "EDIT" && ["Enter", "Escape"].includes(event.key)) event.preventGridDefault();
        }}
        renderers={{ noRowsFallback: <div className="col-span-full p-6 text-center text-(--muted)">
          {isPending ? "Loading…" : "Empty"}
        </div> }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--line) px-6 py-5 text-sm text-(--muted)">
        <div>
          {view.page}/{view.totalPages}
        </div>
        <div className="flex items-center gap-2">
          {view.page > 1 ? (
            <button
              onClick={() => updateSearch({ page: String(view.page - 1) }, true)}
              disabled={isPending}
              className="rounded-xl border border-white/30 px-3 py-2 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
          ) : null}
          {view.page < view.totalPages ? (
            <button
              onClick={() => updateSearch({ page: String(view.page + 1) }, true)}
              disabled={isPending}
              className="rounded-xl border border-white/30 px-3 py-2 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          ) : null}
        </div>
      </div>

      {isCreating ? (
        <RowFormPanel
          table={table}
          mode="create"
          onCancel={() => setIsCreating(false)}
          initialValues={{}}
          action={createRowAction.bind(null, table.slug, searchParamsStr)}
        />
      ) : null}
      {isEditing && selectedRowKeys.size === 1 && selectedRow ? (
        <RowFormPanel
          table={table}
          mode="update"
          onCancel={() => setIsEditing(false)}
          initialValues={selectedRow as RowRecord}
          action={updateRowAction.bind(null, table.slug, firstSelectedKey!, searchParamsStr)}
        />
      ) : null}
    </div>
  );
}
