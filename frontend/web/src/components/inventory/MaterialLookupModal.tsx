import React, { useState, useEffect } from 'react';
import { Search, Loader2, Package, Building2, ExternalLink, X, Sparkles, Check } from 'lucide-react';
import { db, functions } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../auth/AuthProvider';

export interface SelectedMaterialResult {
    name: string;
    baseCost: number;
    customerPrice: number;
    vendorName?: string;
    vendorProductUrl?: string;
    materialId?: string;
    unit?: string;
    alternateVendors?: Array<{
        vendorId: string;
        vendorName: string;
        unitCost: number;
        vendorProductUrl?: string;
        estimatedDeliveryDays?: number;
    }>;
}

interface MaterialLookupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMaterial: (material: SelectedMaterialResult) => void;
    initialSearchTerm?: string;
    markupPercent?: number;
}

interface Vendor {
    id: string;
    name: string;
    website?: string;
}

interface CatalogProduct {
    title: string;
    price: string;
    url: string;
    description: string;
}

export const MaterialLookupModal: React.FC<MaterialLookupModalProps> = ({
    isOpen,
    onClose,
    onSelectMaterial,
    initialSearchTerm = '',
    markupPercent = 30
}) => {
    const { user, organization } = useAuth();
    const [activeTab, setActiveTab] = useState<'inventory' | 'catalog'>('inventory');
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

    // Company Inventory State
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);

    // Live Vendor Catalog Search State
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [selectedVendorName, setSelectedVendorName] = useState<string>('All Vendors');
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
    const [searchError, setSearchError] = useState('');

    useEffect(() => {
        if (initialSearchTerm) {
            setSearchTerm(initialSearchTerm);
        }
    }, [initialSearchTerm]);

    // Fetch org vendors and initial inventory
    useEffect(() => {
        if (!isOpen || !user?.org_id) return;

        const orgId = user.org_id;

        // Fetch vendors
        const fetchVendors = async () => {
            try {
                const q = query(collection(db, 'vendors'), where('organizationId', '==', orgId));
                const snap = await getDocs(q);
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[];
                setVendors(list);
            } catch (err) {
                console.warn('Error fetching vendors for lookup:', err);
            }
        };

        // Fetch company inventory
        const fetchInventory = async () => {
            setInventoryLoading(true);
            try {
                const q = query(collection(db, 'materials'), where('org_id', '==', orgId));
                const snap = await getDocs(q);
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setInventoryItems(list);
            } catch (err) {
                console.warn('Error fetching inventory for lookup:', err);
            } finally {
                setInventoryLoading(false);
            }
        };

        fetchVendors();
        fetchInventory();
    }, [isOpen, user?.org_id]);

    if (!isOpen) return null;

    // Filter inventory locally by search term
    const filteredInventory = inventoryItems.filter(item => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        const name = (item.name || '').toLowerCase();
        const category = (item.category || '').toLowerCase();
        const sku = (item.sku || '').toLowerCase();
        return name.includes(term) || category.includes(term) || sku.includes(term);
    });

    // Handle catalog search via Gemini searchVendorCatalog
    const handleSearchCatalog = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) return;

        setCatalogLoading(true);
        setSearchError('');
        setCatalogProducts([]);

        try {
            const searchFn = httpsCallable(functions, 'searchVendorCatalog');
            const targetVendor = selectedVendorName === 'All Vendors' ? (vendors[0]?.name || 'Home Depot') : selectedVendorName;
            const targetWebsite = vendors.find(v => v.name === targetVendor)?.website || '';

            const result = await searchFn({
                vendorName: targetVendor,
                website: targetWebsite,
                searchTerm: searchTerm.trim()
            });

            const data = (result.data as any).products;
            if (Array.isArray(data)) {
                setCatalogProducts(data);
            } else {
                setCatalogProducts([]);
            }
        } catch (err: any) {
            console.error('Catalog search error:', err);
            setSearchError(err?.message || 'Failed to search vendor catalogs.');
        } finally {
            setCatalogLoading(false);
        }
    };

    const handleSelectInventoryItem = (item: any) => {
        const baseCost = item.unitCost || item.unitPrice || 0;
        const price = Math.round(baseCost * (1 + markupPercent / 100) * 100) / 100;

        // Build alternate vendors from assigned vendors
        const assignedVendors = (item.vendors || []).map((v: any) => ({
            vendorId: v.vendorId || '',
            vendorName: v.vendorName || 'Vendor',
            unitCost: v.unitCost || baseCost,
            vendorProductUrl: v.vendorProductUrl,
            estimatedDeliveryDays: v.estimatedDeliveryDays,
        }));

        const preferredVendor = item.preferredVendorId
            ? assignedVendors.find((v: any) => v.vendorId === item.preferredVendorId)
            : assignedVendors[0];

        onSelectMaterial({
            name: item.name,
            baseCost,
            customerPrice: price,
            vendorName: preferredVendor?.vendorName || item.vendorName,
            vendorProductUrl: preferredVendor?.vendorProductUrl || item.vendorProductUrl,
            materialId: item.id,
            unit: item.unit || 'each',
            alternateVendors: assignedVendors.length > 0 ? assignedVendors : undefined
        });
        onClose();
    };

    const handleSelectCatalogProduct = (product: CatalogProduct) => {
        const priceStr = product.price?.replace(/[^0-9.]/g, '') || '0';
        const baseCost = parseFloat(priceStr) || 0;
        const price = Math.round(baseCost * (1 + markupPercent / 100) * 100) / 100;

        onSelectMaterial({
            name: product.title,
            baseCost,
            customerPrice: price,
            vendorName: selectedVendorName === 'All Vendors' ? (vendors[0]?.name || 'Vendor') : selectedVendorName,
            vendorProductUrl: product.url,
            unit: 'each',
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                            <Package className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">Search & Add Material</h2>
                            <p className="text-xs text-blue-100">Select from company inventory or live vendor catalogs</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 bg-gray-50/80 px-5 pt-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('inventory')}
                        className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                            activeTab === 'inventory'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Building2 className="w-4 h-4" /> Company Inventory ({inventoryItems.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('catalog');
                            if (catalogProducts.length === 0 && searchTerm) {
                                handleSearchCatalog();
                            }
                        }}
                        className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                            activeTab === 'catalog'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <Sparkles className="w-4 h-4 text-amber-500" /> Search Vendor Catalogs
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-4 border-b border-gray-100 bg-white">
                    <form onSubmit={activeTab === 'catalog' ? handleSearchCatalog : (e) => e.preventDefault()} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={activeTab === 'inventory' ? "Filter inventory by name, category, or SKU..." : "Search live vendor catalogs (e.g. 1/2 in copper pipe, toilet flapper)..."}
                                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                                autoFocus
                            />
                        </div>

                        {activeTab === 'catalog' && (
                            <>
                                <select
                                    value={selectedVendorName}
                                    onChange={(e) => setSelectedVendorName(e.target.value)}
                                    className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="All Vendors">All Vendors</option>
                                    {vendors.map(v => (
                                        <option key={v.id} value={v.name}>{v.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="submit"
                                    disabled={catalogLoading || !searchTerm.trim()}
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center gap-2 shadow-sm transition-all"
                                >
                                    {catalogLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    Search
                                </button>
                            </>
                        )}
                    </form>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[450px]">
                    {activeTab === 'inventory' ? (
                        inventoryLoading ? (
                            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                <span>Loading company materials...</span>
                            </div>
                        ) : filteredInventory.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 space-y-2">
                                <Package className="w-10 h-10 mx-auto text-gray-300" />
                                <p className="font-medium text-gray-600">No matching materials found in inventory</p>
                                <p className="text-xs text-gray-400">Switch to the "Search Vendor Catalogs" tab to find live pricing from suppliers</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {filteredInventory.map(item => {
                                    const baseCost = item.unitCost || item.unitPrice || 0;
                                    const price = Math.round(baseCost * (1 + markupPercent / 100) * 100) / 100;
                                    const qty = item.quantity ?? 0;
                                    const isLowStock = qty > 0 && qty <= 5;
                                    const isOutOfStock = qty <= 0;

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleSelectInventoryItem(item)}
                                            className="p-3 bg-white hover:bg-blue-50/50 border border-gray-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm hover:shadow"
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-2">
                                                    <span className="font-semibold text-gray-900 text-sm group-hover:text-blue-600 transition-colors line-clamp-1">
                                                        {item.name}
                                                    </span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                                                        isOutOfStock ? 'bg-red-100 text-red-700' : isLowStock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {isOutOfStock ? 'Out of Stock' : `${qty} in stock`}
                                                    </span>
                                                </div>
                                                {item.category && (
                                                    <span className="text-xs text-gray-400">{item.category}</span>
                                                )}
                                            </div>

                                            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <span className="text-xs text-gray-500">Cost: ${baseCost.toFixed(2)}</span>
                                                    <span className="text-sm font-bold text-gray-900 ml-2">${price.toFixed(2)} price</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="px-3 py-1 bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                                                >
                                                    Select <Check className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        /* Vendor Catalog Search Results */
                        catalogLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <p className="text-sm font-medium text-gray-600">Searching live vendor catalogs for "{searchTerm}"...</p>
                                <p className="text-xs text-gray-400">Fetching real-time pricing and product links via AI</p>
                            </div>
                        ) : searchError ? (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                                {searchError}
                            </div>
                        ) : catalogProducts.length === 0 ? (
                            <div className="text-center py-16 text-gray-400 space-y-2">
                                <Sparkles className="w-10 h-10 mx-auto text-amber-400" />
                                <p className="font-medium text-gray-600">Search Live Vendor Catalogs</p>
                                <p className="text-xs text-gray-400 max-w-md mx-auto">Type an item name above and click "Search" to fetch real live pricing and product links directly from your connected suppliers.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
                                    Found {catalogProducts.length} live catalog matches
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {catalogProducts.map((product, idx) => {
                                        const priceStr = product.price?.replace(/[^0-9.]/g, '') || '0';
                                        const baseCost = parseFloat(priceStr) || 0;
                                        const price = Math.round(baseCost * (1 + markupPercent / 100) * 100) / 100;

                                        return (
                                            <div
                                                key={idx}
                                                className="p-3 bg-white border border-gray-200 hover:border-blue-300 rounded-xl transition-all flex flex-col justify-between group shadow-sm hover:shadow"
                                            >
                                                <div>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className="font-semibold text-gray-900 text-sm line-clamp-2">
                                                            {product.title}
                                                        </span>
                                                        {product.url && (
                                                            <a
                                                                href={product.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-blue-600 hover:text-blue-800 shrink-0 p-1 hover:bg-blue-50 rounded"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mt-1">{product.description}</p>
                                                </div>

                                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                    <div>
                                                        <span className="text-xs text-gray-500">Cost: ${baseCost.toFixed(2)}</span>
                                                        <span className="text-sm font-bold text-gray-900 ml-2">${price.toFixed(2)} price</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectCatalogProduct(product)}
                                                        className="px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 shadow-sm"
                                                    >
                                                        Select <Check className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
                    <span>Organized by company preferences ({organization?.settings?.materialMarkup || 30}% markup applied)</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
