import React, { useState, useRef, useEffect } from 'react';
import { Store, MapPin, CheckCircle2, ChevronDown, ExternalLink, Search, Circle, Package, Truck } from 'lucide-react';
import { getVendorStockDetails, isLocalVendor } from '../utils/vendorStock';

export interface AlternateVendorItem {
    vendorId: string;
    vendorName: string;
    unitCost: number;
    vendorProductUrl?: string;
    estimatedDeliveryDays?: number;
    stockQuantity?: number;
    isLocalVendor?: boolean;
    localDistanceMiles?: number;
}

export interface OrgVendorItem {
    id: string;
    name: string;
    unitCost?: number;
    isLocal?: boolean;
}

interface RichVendorDropdownProps {
    activeVendorName?: string;
    activeBaseCost?: number;
    activeStockQuantity?: number;
    activeProductUrl?: string;
    alternateVendors?: AlternateVendorItem[];
    orgVendors?: OrgVendorItem[];
    onSelectVendor: (value: string) => void;
    itemDescription?: string;
    className?: string;
    buttonSize?: 'sm' | 'md';
}

export const RichVendorDropdown: React.FC<RichVendorDropdownProps> = ({
    activeVendorName,
    activeBaseCost = 0,
    activeStockQuantity,
    activeProductUrl,
    alternateVendors = [],
    orgVendors = [],
    onSelectVendor,
    itemDescription,
    className = '',
    buttonSize = 'sm'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const activeDetails = getVendorStockDetails(activeVendorName || 'Supplier', activeStockQuantity);

    const handleOptionClick = (val: string) => {
        onSelectVendor(val);
        setIsOpen(false);
    };

    return (
        <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`inline-flex items-center gap-1.5 font-semibold rounded-lg border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    activeDetails.isLocal
                        ? 'bg-emerald-50/90 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-blue-50/90 hover:bg-blue-100 text-blue-900 border-blue-200'
                } ${buttonSize === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
            >
                {activeDetails.isLocal ? (
                    <MapPin className="w-3 h-3 text-emerald-700 shrink-0" />
                ) : (
                    <Store className="w-3 h-3 text-blue-600 shrink-0" />
                )}

                <span className="truncate max-w-[150px]">
                    {activeVendorName ? (
                        <>
                            <strong className="font-bold">{activeVendorName}</strong>
                            {activeBaseCost > 0 && <span className="opacity-80"> (${activeBaseCost.toFixed(2)})</span>}
                        </>
                    ) : (
                        'Select Supplier...'
                    )}
                </span>

                <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Rich Popover Menu */}
            {isOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-84 bg-white/98 backdrop-blur-md rounded-xl shadow-2xl border border-blue-200 p-3.5 animate-in fade-in zoom-in-95 duration-150">
                    {/* Popover Header */}
                    {itemDescription && (
                        <div className="flex items-start gap-2.5 border-b border-gray-100 pb-2.5 mb-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-gray-900 truncate">{itemDescription}</div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    {activeDetails.isLocal && (
                                        <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded border border-emerald-300">
                                            <MapPin className="w-2.5 h-2.5 mr-0.5" /> Local Branch
                                        </span>
                                    )}
                                    <span className="text-[10px] text-gray-500 font-medium">
                                        Fulfillment: {activeDetails.deliveryText}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Vendor Comparison Header */}
                    <div className="flex items-center justify-between text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1.5">
                        <span>Supplier Price & Stock Comparison</span>
                        <span className="text-[9px] text-blue-600 normal-case font-semibold">Click to select supplier</span>
                    </div>

                    {/* Scrollable Supplier Options List */}
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        {/* Currently Active Vendor */}
                        {activeVendorName && (
                            <div
                                onClick={() => handleOptionClick(`ALT:${activeVendorName}`)}
                                className="flex items-center justify-between px-2.5 py-2 bg-blue-50/90 hover:bg-blue-100 rounded-lg border border-blue-300 text-xs font-semibold text-blue-900 cursor-pointer transition-all shadow-2xs"
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                                    {activeDetails.isLocal && (
                                        <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded shrink-0 border border-emerald-200">
                                            Local
                                        </span>
                                    )}
                                    <span className="font-bold truncate">{activeVendorName}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                        activeDetails.stockStatus === 'out_of_stock'
                                            ? 'bg-red-100 text-red-700 border-red-200'
                                            : activeDetails.isLocal
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : 'bg-blue-100 text-blue-800 border-blue-200'
                                    }`}>
                                        {activeDetails.statusBadgeText}
                                    </span>
                                    <span className="font-extrabold text-blue-950">${activeBaseCost.toFixed(2)}</span>
                                </div>
                            </div>
                        )}

                        {/* Alternate Vendors */}
                        {alternateVendors
                            .filter(av => av.vendorName !== activeVendorName)
                            .map((av, idx) => {
                                const altInfo = getVendorStockDetails(av.vendorName, av.stockQuantity, av.isLocalVendor, av.localDistanceMiles);

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => handleOptionClick(`ALT:${av.vendorId || av.vendorName}`)}
                                        className="flex items-center justify-between px-2.5 py-2 bg-gray-50 hover:bg-blue-50/70 rounded-lg text-xs transition-all border border-gray-200/80 hover:border-blue-300 cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Circle className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                                            {altInfo.isLocal && (
                                                <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded shrink-0 border border-emerald-200">
                                                    Local
                                                </span>
                                            )}
                                            <span className="font-semibold text-gray-800 group-hover:text-blue-950 truncate">{av.vendorName}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                                altInfo.stockStatus === 'out_of_stock'
                                                    ? 'bg-red-50 text-red-700 border-red-200'
                                                    : altInfo.isLocal
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                    : 'bg-gray-100 text-gray-700 border-gray-200'
                                            }`}>
                                                {altInfo.statusBadgeText}
                                            </span>
                                            <span className="font-bold text-gray-900 group-hover:text-blue-900">${av.unitCost.toFixed(2)}</span>
                                        </div>
                                    </div>
                                );
                            })}

                        {/* Connected Organization Vendors */}
                        {orgVendors
                            .filter(ov => ov.name !== activeVendorName && !alternateVendors.some(av => av.vendorName === ov.name))
                            .map(ov => {
                                const ovInfo = getVendorStockDetails(ov.name, undefined, ov.isLocal);

                                return (
                                    <div
                                        key={ov.id}
                                        onClick={() => handleOptionClick(`SEARCH:${ov.name}`)}
                                        className="flex items-center justify-between px-2.5 py-2 bg-gray-50/60 hover:bg-indigo-50/70 rounded-lg text-xs transition-all border border-gray-100 hover:border-indigo-300 cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Search className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-600 shrink-0" />
                                            {ovInfo.isLocal && (
                                                <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded shrink-0 border border-emerald-200">
                                                    Local
                                                </span>
                                            )}
                                            <span className="font-medium text-gray-700 group-hover:text-indigo-950 truncate">{ov.name}</span>
                                        </div>
                                        <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                            Search Catalog
                                        </span>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Footer Search Catalog Button */}
                    <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => handleOptionClick('SEARCH_CATALOG')}
                            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold transition-all shadow-sm"
                        >
                            <Search className="w-3.5 h-3.5" />
                            Search All Live Vendor Catalogs...
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
