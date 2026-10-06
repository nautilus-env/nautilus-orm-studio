"use client";

import { DataGrid, type Column } from "react-data-grid";
import "react-data-grid/lib/styles.css";

import { CopyValue } from "@/components/studio/copy-value";

type Row = Record<string, unknown>;

export function ResultGrid({ columns, rows, label, rowClass }: {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  label: string;
  rowClass?: (row: Row) => string | undefined;
}) {
  return <DataGrid<Row>
    aria-label={label}
    className="studio-grid min-h-32 rounded-xl"
    style={{ height: Math.min(480, Math.max(140, (rows.length + 1) * 40)), maxHeight: "60vh", border: "1px solid var(--line)" }}
    columns={columns.map((column): Column<Row> => ({
      headerCellClass: "text-xs uppercase text-(--muted)",
      ...column,
      renderCell: column.renderCell ?? (({ row }) => <CopyValue value={row[column.key]} />),
    }))}
    rows={rows}
    rowClass={rowClass}
    defaultColumnOptions={{ width: 180, minWidth: 80, resizable: true }}
    rowHeight={40}
    headerRowHeight={40}
    renderers={{ noRowsFallback: <div className="col-span-full p-6 text-center text-(--muted)">Empty</div> }}
  />;
}
