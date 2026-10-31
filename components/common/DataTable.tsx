import type { ReactNode } from "react";

type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
};

export function DataTable({ headers, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="h-10 whitespace-nowrap px-4 align-middle">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="text-foreground transition-colors hover:bg-muted/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
