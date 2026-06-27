import React, { useState, useMemo } from 'react';
import { MaterialItem } from '../../types';
import { WarehouseBin } from '../../pages/WarehouseManager';
import {
    MapPin, Layers, ChevronRight, Package, Search, Filter,
    ArrowLeft, X, Printer, ClipboardCheck, ArrowUpDown,
    Box, Eye, Tag, BarChart3, Clock, Truck
} from 'lucide-react';
import { format } from 'date-fns';

/* ═══════════════════════════════════════════════════════════
 *  BIN CONTENTS TAB
 *  Hierarchical drill-down: Location → Zone → Aisle → Bin → Products
 *  Inspired by Fishbowl bin management and NetSuite WMS drill-down
 * ═══════════════════════════════════════════════════════════ */

interface BinContentsTabProps {
    bins: WarehouseBin[];
    materials: MaterialItem[];
    onPrintBin?: (bin: WarehouseBin) => void;
    onCycleCountBin?: (bin: WarehouseBin) => void;
}

type DrillLevel = 'locations' | 'zones' | 'aisles' | 'bins';

interface BreadcrumbItem {
    level: DrillLevel;
    label: string;
    value: string;
}

// Map a material to its bin label (matching WarehouseBin.label format)
function materialBinLabel(m: MaterialItem): string {
    return [m.aisle, m.rack, m.shelf, m.level].filter(Boolean).join('-') || m.binLocation || '';
}

export const BinContentsTab: React.FC<BinContentsTabProps> = ({ bins, materials, onPrintBin, onCycleCountBin }) => {
    // Navigation state
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [selectedAisle, setSelectedAisle] = useState<string | null>(null);
    const [selectedBin, setSelectedBin] = useState<WarehouseBin | null>(null);

    // Filtering/sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [filterOccupancy, setFilterOccupancy] = useState<'all' | 'occupied' | 'empty' | 'low_stock'>('all');
    const [sortBy, setSortBy] = useState<'label' | 'items' | 'value'>('label');

    // ── Derived data ──

    // Materials grouped by bin label
    const materialsByBin = useMemo(() => {
        const map: Record<string, MaterialItem[]> = {};
        materials.forEach(m => {
            const binLabel = materialBinLabel(m);
            if (!binLabel) return;
            if (!map[binLabel]) map[binLabel] = [];
            map[binLabel].push(m);
        });
        return map;
    }, [materials]);

    // Bin enrichment: how many items in each bin
    const enrichedBins = useMemo(() => {
        return bins.map(b => ({
            ...b,
            products: materialsByBin[b.label] || [],
            totalItems: (materialsByBin[b.label] || []).reduce((sum, m) => sum + (m.quantity || 0), 0),
            totalValue: (materialsByBin[b.label] || []).reduce((sum, m) => sum + (m.quantity || 0) * (m.unitCost || 0), 0),
            skuCount: (materialsByBin[b.label] || []).length,
            hasLowStock: (materialsByBin[b.label] || []).some(m => m.quantity <= m.minQuantity),
        }));
    }, [bins, materialsByBin]);

    // ── Level 1: Locations ──
    const locationData = useMemo(() => {
        const map: Record<string, { bins: typeof enrichedBins; totalSKUs: number; totalItems: number; totalValue: number }> = {};
        enrichedBins.forEach(b => {
            const loc = b.location || 'Unassigned';
            if (!map[loc]) map[loc] = { bins: [], totalSKUs: 0, totalItems: 0, totalValue: 0 };
            map[loc].bins.push(b);
            map[loc].totalSKUs += b.skuCount;
            map[loc].totalItems += b.totalItems;
            map[loc].totalValue += b.totalValue;
        });
        return map;
    }, [enrichedBins]);

    // ── Level 2: Zones within selected location ──
    const zoneData = useMemo(() => {
        if (!selectedLocation) return {};
        const locationBins = enrichedBins.filter(b => b.location === selectedLocation);
        const map: Record<string, { bins: typeof enrichedBins; totalSKUs: number; totalItems: number }> = {};
        locationBins.forEach(b => {
            const zone = b.zone || 'No Zone';
            if (!map[zone]) map[zone] = { bins: [], totalSKUs: 0, totalItems: 0 };
            map[zone].bins.push(b);
            map[zone].totalSKUs += b.skuCount;
            map[zone].totalItems += b.totalItems;
        });
        return map;
    }, [selectedLocation, enrichedBins]);

    // ── Level 3: Aisles within selected zone ──
    const aisleData = useMemo(() => {
        if (!selectedLocation || !selectedZone) return {};
        const zoneBins = enrichedBins.filter(b => b.location === selectedLocation && (b.zone || 'No Zone') === selectedZone);
        const map: Record<string, { bins: typeof enrichedBins; totalSKUs: number }> = {};
        zoneBins.forEach(b => {
            const aisle = b.aisle || 'No Aisle';
            if (!map[aisle]) map[aisle] = { bins: [], totalSKUs: 0 };
            map[aisle].bins.push(b);
            map[aisle].totalSKUs += b.skuCount;
        });
        return map;
    }, [selectedLocation, selectedZone, enrichedBins]);

    // ── Level 4: Bins in selected aisle ──
    const currentBins = useMemo(() => {
        let result = enrichedBins;
        if (selectedLocation) result = result.filter(b => b.location === selectedLocation);
        if (selectedZone) result = result.filter(b => (b.zone || 'No Zone') === selectedZone);
        if (selectedAisle) result = result.filter(b => (b.aisle || 'No Aisle') === selectedAisle);

        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(b =>
                b.label.toLowerCase().includes(term) ||
                b.products.some(p => p.name.toLowerCase().includes(term) || (p.sku || '').toLowerCase().includes(term))
            );
        }

        // Filter by occupancy
        if (filterOccupancy === 'occupied') result = result.filter(b => b.skuCount > 0);
        else if (filterOccupancy === 'empty') result = result.filter(b => b.skuCount === 0);
        else if (filterOccupancy === 'low_stock') result = result.filter(b => b.hasLowStock);

        // Sort
        if (sortBy === 'label') result.sort((a, b) => a.label.localeCompare(b.label));
        else if (sortBy === 'items') result.sort((a, b) => b.totalItems - a.totalItems);
        else if (sortBy === 'value') result.sort((a, b) => b.totalValue - a.totalValue);

        return result;
    }, [enrichedBins, selectedLocation, selectedZone, selectedAisle, searchTerm, filterOccupancy, sortBy]);

    // ── Current drill level ──
    const currentLevel: DrillLevel = selectedAisle ? 'bins' : selectedZone ? 'aisles' : selectedLocation ? 'zones' : 'locations';

    // ── Breadcrumb ──
    const breadcrumbs: BreadcrumbItem[] = [
        { level: 'locations', label: 'All Locations', value: '' },
        ...(selectedLocation ? [{ level: 'zones' as DrillLevel, label: selectedLocation, value: selectedLocation }] : []),
        ...(selectedZone ? [{ level: 'aisles' as DrillLevel, label: selectedZone, value: selectedZone }] : []),
        ...(selectedAisle ? [{ level: 'bins' as DrillLevel, label: `Aisle ${selectedAisle}`, value: selectedAisle }] : []),
    ];

    const navigateTo = (crumb: BreadcrumbItem) => {
        if (crumb.level === 'locations') {
            setSelectedLocation(null); setSelectedZone(null); setSelectedAisle(null);
        } else if (crumb.level === 'zones') {
            setSelectedZone(null); setSelectedAisle(null);
        } else if (crumb.level === 'aisles') {
            setSelectedAisle(null);
        }
        setSelectedBin(null);
    };

    const goBack = () => {
        if (selectedBin) setSelectedBin(null);
        else if (selectedAisle) setSelectedAisle(null);
        else if (selectedZone) setSelectedZone(null);
        else if (selectedLocation) setSelectedLocation(null);
    };

    // ── Capacity bar ──
    const CapacityBar: React.FC<{ current: number; max?: number }> = ({ current, max }) => {
        if (!max) return null;
        const pct = Math.min(100, (current / max) * 100);
        const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : pct > 40 ? 'bg-blue-500' : 'bg-emerald-500';
        return (
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden" title={`${current}/${max} items`}>
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1 text-sm bg-white rounded-xl border border-gray-200 px-4 py-3">
                {currentLevel !== 'locations' && (
                    <button onClick={goBack} className="p-1 mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                )}
                {breadcrumbs.map((crumb, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="w-4 h-4 text-gray-300 mx-1" />}
                        <button
                            onClick={() => navigateTo(crumb)}
                            className={`px-2 py-1 rounded-md transition-colors ${
                                i === breadcrumbs.length - 1
                                    ? 'font-semibold text-blue-700 bg-blue-50'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {crumb.label}
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Search & Filters (shown at aisle/bin level) */}
            {(currentLevel === 'bins' || currentLevel === 'aisles') && (
                <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                        <input
                            type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search bins, products, or SKUs..."
                            className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <select value={filterOccupancy} onChange={e => setFilterOccupancy(e.target.value as any)}
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="all">All Bins</option>
                        <option value="occupied">Occupied</option>
                        <option value="empty">Empty</option>
                        <option value="low_stock">⚠️ Low Stock</option>
                    </select>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="label">Sort: Label A→Z</option>
                        <option value="items">Sort: Most Items</option>
                        <option value="value">Sort: Highest Value</option>
                    </select>
                </div>
            )}

            {/* ═══ LEVEL 1: Location Cards ═══ */}
            {currentLevel === 'locations' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(locationData).map(([loc, data]) => (
                        <button
                            key={loc}
                            onClick={() => setSelectedLocation(loc)}
                            className="bg-white rounded-xl border-2 border-gray-200 p-6 text-left hover:border-blue-400 hover:shadow-lg transition-all group"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                    <MapPin className="w-6 h-6 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{loc}</h3>
                                    <p className="text-sm text-gray-500">{data.bins.length} bins</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 ml-auto group-hover:text-blue-500 transition-colors" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-gray-50 rounded-lg p-2 text-center">
                                    <p className="text-lg font-bold text-gray-900">{data.totalSKUs}</p>
                                    <p className="text-[10px] text-gray-500 uppercase">SKUs</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-2 text-center">
                                    <p className="text-lg font-bold text-gray-900">{data.totalItems}</p>
                                    <p className="text-[10px] text-gray-500 uppercase">Items</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-2 text-center">
                                    <p className="text-lg font-bold text-emerald-700">${data.totalValue.toFixed(0)}</p>
                                    <p className="text-[10px] text-gray-500 uppercase">Value</p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* ═══ LEVEL 2: Zone Cards ═══ */}
            {currentLevel === 'zones' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(zoneData).map(([zone, data]) => (
                        <button
                            key={zone}
                            onClick={() => setSelectedZone(zone)}
                            className="bg-white rounded-xl border-2 border-gray-200 p-5 text-left hover:border-purple-400 hover:shadow-lg transition-all group"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                                    <Layers className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">{zone}</h3>
                                    <p className="text-xs text-gray-500">{data.bins.length} bins • {data.totalSKUs} SKUs • {data.totalItems} items</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 ml-auto group-hover:text-purple-500 transition-colors" />
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* ═══ LEVEL 3: Aisle Cards ═══ */}
            {currentLevel === 'aisles' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {Object.entries(aisleData).map(([aisle, data]) => (
                        <button
                            key={aisle}
                            onClick={() => setSelectedAisle(aisle)}
                            className="bg-white rounded-xl border-2 border-gray-200 p-4 text-center hover:border-emerald-400 hover:shadow-lg transition-all group"
                        >
                            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2 group-hover:bg-emerald-100 transition-colors">
                                <span className="text-xl font-black text-emerald-700 font-mono">{aisle}</span>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">Aisle {aisle}</p>
                            <p className="text-xs text-gray-500">{data.bins.length} bins • {data.totalSKUs} SKUs</p>
                        </button>
                    ))}
                </div>
            )}

            {/* ═══ LEVEL 4: Bin Grid ═══ */}
            {currentLevel === 'bins' && (
                <>
                    <div className="text-xs text-gray-500 mb-1">{currentBins.length} bin{currentBins.length !== 1 ? 's' : ''} found</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {currentBins.map(bin => {
                            const occupancyPct = bin.maxCapacity ? Math.min(100, (bin.totalItems / bin.maxCapacity) * 100) : null;
                            return (
                                <button
                                    key={bin.id}
                                    onClick={() => setSelectedBin(bin)}
                                    className={`bg-white rounded-xl border-2 p-4 text-left hover:shadow-lg transition-all group ${
                                        bin.skuCount === 0 ? 'border-gray-200 opacity-60' :
                                        bin.hasLowStock ? 'border-amber-300 bg-amber-50/30' :
                                        'border-gray-200 hover:border-blue-400'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-lg font-black text-gray-900 font-mono tracking-wider">{bin.label}</span>
                                        <div className="flex items-center gap-1">
                                            {bin.hasLowStock && <span className="text-amber-500 text-xs">⚠️</span>}
                                            <Eye className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                                        <span className="flex items-center gap-1"><Package className="w-3 h-3" />{bin.skuCount} SKU{bin.skuCount !== 1 ? 's' : ''}</span>
                                        <span className="flex items-center gap-1"><Box className="w-3 h-3" />{bin.totalItems} items</span>
                                    </div>
                                    {bin.products.slice(0, 2).map((p, i) => (
                                        <div key={i} className="text-xs text-gray-600 truncate flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                            {p.name} <span className="text-gray-400 ml-auto">{p.quantity} {p.unit}</span>
                                        </div>
                                    ))}
                                    {bin.products.length > 2 && (
                                        <div className="text-[10px] text-gray-400 mt-1">+{bin.products.length - 2} more</div>
                                    )}
                                    <CapacityBar current={bin.totalItems} max={bin.maxCapacity} />
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ═══ BIN DETAIL SLIDE-OUT PANEL ═══ */}
            {selectedBin && (
                <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setSelectedBin(null)}>
                    <div className="w-full max-w-lg bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
                            <div className="flex items-center justify-between mb-3">
                                <button onClick={() => setSelectedBin(null)} className="p-2 hover:bg-white/10 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                                <div className="flex gap-2">
                                    {onPrintBin && (
                                        <button onClick={() => onPrintBin(selectedBin)} className="p-2 hover:bg-white/10 rounded-lg" title="Print Label">
                                            <Printer className="w-4 h-4" />
                                        </button>
                                    )}
                                    {onCycleCountBin && (
                                        <button onClick={() => onCycleCountBin(selectedBin)} className="p-2 hover:bg-white/10 rounded-lg" title="Cycle Count This Bin">
                                            <ClipboardCheck className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <h2 className="text-3xl font-black font-mono tracking-wider">{selectedBin.label}</h2>
                            <div className="flex items-center gap-3 mt-2 text-blue-200 text-sm">
                                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedBin.location}</span>
                                {selectedBin.zone && <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5" />{selectedBin.zone}</span>}
                                <span className="px-2 py-0.5 bg-white/20 rounded text-xs font-medium">{selectedBin.binType || 'standard'}</span>
                            </div>
                            {selectedBin.maxCapacity && (
                                <div className="mt-3">
                                    <div className="flex justify-between text-xs text-blue-200 mb-1">
                                        <span>Capacity</span>
                                        <span>{(enrichedBins.find(b => b.id === selectedBin.id) as any)?.totalItems || 0} / {selectedBin.maxCapacity}</span>
                                    </div>
                                    <div className="w-full h-2 bg-blue-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-white/60 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, ((enrichedBins.find(b => b.id === selectedBin.id) as any)?.totalItems || 0) / selectedBin.maxCapacity * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Products in this bin */}
                        <div className="p-6">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <Package className="w-4 h-4 text-blue-600" />
                                Products in this bin
                                <span className="ml-auto text-xs text-gray-400 font-normal normal-case">
                                    {(materialsByBin[selectedBin.label] || []).length} item{(materialsByBin[selectedBin.label] || []).length !== 1 ? 's' : ''}
                                </span>
                            </h3>

                            {(materialsByBin[selectedBin.label] || []).length === 0 ? (
                                <div className="text-center py-8 bg-gray-50 rounded-xl">
                                    <Box className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-gray-500 text-sm font-medium">This bin is empty</p>
                                    <p className="text-gray-400 text-xs mt-1">Put away items to this bin from Receiving</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(materialsByBin[selectedBin.label] || []).map(product => (
                                        <div key={product.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h4 className="font-semibold text-gray-900 text-sm">{product.name}</h4>
                                                    {product.sku && (
                                                        <span className="text-xs text-gray-500 font-mono">{product.sku}</span>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xl font-bold text-gray-900">{product.quantity}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase">{product.unit}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Tag className="w-3 h-3" />
                                                    ${product.unitCost?.toFixed(2) || '0.00'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <BarChart3 className="w-3 h-3" />
                                                    Value: ${((product.quantity || 0) * (product.unitCost || 0)).toFixed(2)}
                                                </span>
                                                {product.lastRestockedAt?.toDate && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {format(product.lastRestockedAt.toDate(), 'MMM d')}
                                                    </span>
                                                )}
                                            </div>
                                            {product.quantity <= product.minQuantity && (
                                                <div className="mt-2 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                                                    ⚠️ Below minimum ({product.minQuantity} {product.unit})
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bin Details */}
                        <div className="p-6 border-t border-gray-200">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">Bin Details</h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {[
                                    { label: 'Aisle', value: selectedBin.aisle },
                                    { label: 'Rack', value: selectedBin.rack },
                                    { label: 'Shelf', value: selectedBin.shelf },
                                    { label: 'Level', value: selectedBin.level },
                                ].filter(f => f.value).map(f => (
                                    <div key={f.label} className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-[10px] text-gray-400 uppercase">{f.label}</p>
                                        <p className="font-mono font-bold text-gray-900">{f.value}</p>
                                    </div>
                                ))}
                            </div>
                            {selectedBin.description && (
                                <p className="text-xs text-gray-500 mt-3 italic">{selectedBin.description}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
