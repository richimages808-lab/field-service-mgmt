// ─── Export Utilities ───────────────────────────────────────────────────────────
// CSV, Excel, and PDF export for report data

import { saveAs } from 'file-saver';

export interface ExportColumn {
    key: string;
    label: string;
    format?: 'currency' | 'number' | 'date' | 'percent' | 'text';
}

// ─── CSV Export ─────────────────────────────────────────────────────────────────

export function exportToCSV(data: Record<string, any>[], columns: ExportColumn[], filename: string): void {
    const header = columns.map(c => `"${c.label}"`).join(',');
    const rows = data.map(row =>
        columns.map(col => {
            const val = row[col.key];
            if (val == null) return '""';
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return `"${val}"`;
        }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${filename}.csv`);
}

// ─── Excel Export ───────────────────────────────────────────────────────────────

export async function exportToExcel(data: Record<string, any>[], columns: ExportColumn[], filename: string): Promise<void> {
    const XLSX = await import('xlsx');

    // Build worksheet data with formatted headers
    const wsData = [
        columns.map(c => c.label),
        ...data.map(row => columns.map(col => {
            const val = row[col.key];
            if (col.format === 'currency' && typeof val === 'number') return val;
            if (col.format === 'percent' && typeof val === 'number') return val / 100;
            return val ?? '';
        }))
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-width columns
    ws['!cols'] = columns.map((col, i) => {
        const maxLen = Math.max(
            col.label.length,
            ...data.map(row => String(row[col.key] ?? '').length)
        );
        return { wch: Math.min(maxLen + 2, 40) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report Data');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${filename}.xlsx`);
}

// ─── PDF Export ─────────────────────────────────────────────────────────────────

export async function exportToPDF(
    data: Record<string, any>[],
    columns: ExportColumn[],
    filename: string,
    title: string
): Promise<void> {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ orientation: 'landscape' });

    // Title
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text(title, 14, 20);

    // Date
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // gray-500
    doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 28);
    doc.text(`${data.length} records`, 14, 34);

    // Table
    autoTable(doc, {
        startY: 40,
        head: [columns.map(c => c.label)],
        body: data.map(row => columns.map(col => {
            const val = row[col.key];
            if (val == null) return '';
            if (col.format === 'currency') return `$${Number(val).toFixed(2)}`;
            if (col.format === 'percent') return `${Number(val).toFixed(1)}%`;
            if (col.format === 'number') return Number(val).toLocaleString();
            return String(val);
        })),
        styles: {
            fontSize: 8,
            cellPadding: 3,
        },
        headStyles: {
            fillColor: [37, 99, 235],
            textColor: 255,
            fontStyle: 'bold',
        },
        alternateRowStyles: {
            fillColor: [243, 244, 246],
        },
        margin: { top: 40 },
    });

    doc.save(`${filename}.pdf`);
}

// ─── Format Cell Value ──────────────────────────────────────────────────────────

export function formatCellValue(value: any, format?: ExportColumn['format']): string {
    if (value == null || value === '') return '—';
    switch (format) {
        case 'currency':
            return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        case 'number':
            return Number(value).toLocaleString();
        case 'percent':
            return `${Number(value).toFixed(1)}%`;
        case 'date':
            if (value instanceof Date) return value.toLocaleDateString();
            if (typeof value === 'string') {
                try { return new Date(value).toLocaleDateString(); } catch { return value; }
            }
            return String(value);
        default:
            return String(value);
    }
}
