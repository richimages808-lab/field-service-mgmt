import React, { useState, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, Columns, GripVertical } from 'lucide-react';
import { ExportColumn, formatCellValue } from '../../utils/exportUtils';

interface DraggableTableProps {
    data: Record<string, any>[];
    columns: ExportColumn[];
    onColumnsChange?: (columns: ExportColumn[]) => void;
    maxHeight?: string;
}

export const DraggableTable: React.FC<DraggableTableProps> = ({
    data,
    columns: initialColumns,
    onColumnsChange,
    maxHeight = '500px',
}) => {
    const [columns, setColumns] = useState(initialColumns);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
    const [showColMenu, setShowColMenu] = useState(false);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Sort data
    const sortedData = React.useMemo(() => {
        if (!sortKey) return data;
        return [...data].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }
            const cmp = String(aVal).localeCompare(String(bVal));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [data, sortKey, sortDir]);

    const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const toggleColumn = (key: string) => {
        setHiddenCols(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Drag handlers for column reordering
    const handleDragStart = useCallback((idx: number) => {
        setDragIdx(idx);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
        e.preventDefault();
        setDragOverIdx(idx);
    }, []);

    const handleDrop = useCallback((idx: number) => {
        if (dragIdx === null || dragIdx === idx) return;
        const newCols = [...columns];
        const [moved] = newCols.splice(dragIdx, 1);
        newCols.splice(idx, 0, moved);
        setColumns(newCols);
        onColumnsChange?.(newCols);
        setDragIdx(null);
        setDragOverIdx(null);
    }, [dragIdx, columns, onColumnsChange]);

    const handleDragEnd = useCallback(() => {
        setDragIdx(null);
        setDragOverIdx(null);
    }, []);

    // Status badge colors
    const statusColor = (val: string): string => {
        const s = val.toLowerCase();
        if (['completed', 'paid', 'approved', 'active'].includes(s)) return 'bg-green-100 text-green-800';
        if (['pending', 'draft', 'scheduled'].includes(s)) return 'bg-yellow-100 text-yellow-800';
        if (['overdue', 'cancelled', 'declined', 'expired'].includes(s)) return 'bg-red-100 text-red-800';
        if (['in_progress', 'sent', 'partial'].includes(s)) return 'bg-blue-100 text-blue-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="flex flex-col h-full">
            {/* Column Visibility Toggle */}
            <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs text-gray-500">{sortedData.length} records · {visibleColumns.length}/{columns.length} columns</span>
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setShowColMenu(!showColMenu)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                    >
                        <Columns className="w-3.5 h-3.5" />
                        Columns
                    </button>
                    {showColMenu && (
                        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto">
                            {columns.map(col => (
                                <label
                                    key={col.key}
                                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs"
                                >
                                    <input
                                        type="checkbox"
                                        checked={!hiddenCols.has(col.key)}
                                        onChange={() => toggleColumn(col.key)}
                                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-700">{col.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-auto border border-gray-200 rounded-lg" style={{ maxHeight }}>
                <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-200">
                            {visibleColumns.map((col, idx) => (
                                <th
                                    key={col.key}
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={() => handleDrop(idx)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => handleSort(col.key)}
                                    className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap group transition-colors hover:bg-gray-100
                                        ${dragOverIdx === idx ? 'bg-blue-50 border-l-2 border-blue-400' : ''}
                                        ${dragIdx === idx ? 'opacity-50' : ''}
                                    `}
                                >
                                    <div className="flex items-center gap-1">
                                        <GripVertical className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                                        <span>{col.label}</span>
                                        {sortKey === col.key && (
                                            sortDir === 'asc'
                                                ? <ArrowUp className="w-3 h-3 text-blue-600" />
                                                : <ArrowDown className="w-3 h-3 text-blue-600" />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((row, i) => (
                            <tr
                                key={i}
                                className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors"
                            >
                                {visibleColumns.map(col => {
                                    const val = row[col.key];
                                    const isStatus = col.key.toLowerCase().includes('status');
                                    return (
                                        <td key={col.key} className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">
                                            {isStatus && val ? (
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(String(val))}`}>
                                                    {String(val).replace(/_/g, ' ')}
                                                </span>
                                            ) : (
                                                formatCellValue(val, col.format)
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {sortedData.length === 0 && (
                            <tr>
                                <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-gray-400 text-sm">
                                    No data available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
