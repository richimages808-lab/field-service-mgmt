import React, { useState, useEffect } from 'react';
import { Search, Loader2, Building2, ExternalLink, X, ShoppingCart, Plus, Minus, Trash2, ArrowRight, PackageOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, functions } from '../../firebase';
import { collection, query, where, onSnapshot, addDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../auth/AuthProvider';
import { Vendor, PurchaseOrder } from '../../types/Vendor';

interface VendorSearchModalProps {
    onClose: () => void;
}

interface SearchResult {
    title: string;
    price: string;
    url: string;
    description: string;
}

interface CartItem {
    name: string;
    sku: string;
    unitPrice: number;
    quantity: number;
}

const parsePrice = (priceStr: string): number => {
    if (!priceStr || priceStr.toLowerCase().includes('unavailable') || priceStr.toLowerCase() === 'not listed') return 0;
    const match = priceStr.match(/[\d,.]+/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, ''));
};

export const VendorSearchModal: React.FC<VendorSearchModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [selectedVendorId, setSelectedVendorId] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [error, setError] = useState('');

    const [cart, setCart] = useState<CartItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!user?.org_id) return;
        const q = query(collection(db, 'vendors'), where('organizationId', '==', user.org_id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[];
            list.sort((a, b) => a.name.localeCompare(b.name));
            setVendors(list);
            if (list.length > 0) {
                setSelectedVendorId(list[0].id!);
            }
        });
        return () => unsubscribe();
    }, [user?.org_id]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const vendor = vendors.find(v => v.id === selectedVendorId);
        if (!vendor || !searchTerm.trim()) return;

        setIsSearching(true);
        setError('');
        setResults(null);

        try {
            const searchFunction = httpsCallable(functions, 'searchVendorCatalog');
            const result = await searchFunction({
                vendorName: vendor.name,
                website: vendor.website || '',
                searchTerm: searchTerm.trim()
            });

            const data = (result.data as any).products;
            if (Array.isArray(data)) {
                setResults(data);
            } else {
                setResults([]);
            }
        } catch (err: any) {
            console.error('Vendor search error:', err);
            setError(err.message || 'Failed to search vendor catalog.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddToCart = (item: SearchResult) => {
        const price = parsePrice(item.price);
        setCart(prev => {
            const existing = prev.find(p => p.name === item.title);
            if (existing) {
                return prev.map(p => p.name === item.title ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { name: item.title, sku: 'N/A', unitPrice: price, quantity: 1 }];
        });
    };

    const handleUpdateQuantity = (name: string, delta: number) => {
        setCart(prev => prev.map(p => {
            if (p.name === name) {
                const newQuantity = Math.max(0, p.quantity + delta);
                return { ...p, quantity: newQuantity };
            }
            return p;
        }).filter(p => p.quantity > 0));
    };

    const handleRemoveCartItem = (name: string) => {
        setCart(prev => prev.filter(p => p.name !== name));
    };

    const handleCreateDraftPO = async () => {
        if (cart.length === 0 || !user || !user.org_id) return;
        
        setIsSaving(true);
        setError('');
        
        try {
            const vendor = vendors.find(v => v.id === selectedVendorId);
            if (!vendor) throw new Error("Vendor not selected");

            const subtotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
            
            const poData: Omit<PurchaseOrder, 'id'> = {
                organizationId: user.org_id,
                vendorId: vendor.id!,
                vendorName: vendor.name,
                status: 'draft',
                items: cart.map(item => ({
                    materialId: '',
                    name: item.name,
                    sku: item.sku,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    totalPrice: item.unitPrice * item.quantity
                })),
                subtotal: subtotal,
                tax: 0,
                shipping: 0,
                total: subtotal,
                sentAt: null,
                createdAt: Timestamp.now(),
                createdBy: user.uid,
            };

            const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
            onClose();
            navigate(`/purchase-orders/${docRef.id}`);
        } catch (err: any) {
            setError(err.message || "Failed to save PO.");
            setIsSaving(false);
        }
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 flex-none bg-white z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                            <ShoppingCart className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">New Purchase Order</h2>
                            <p className="text-sm text-gray-500">Search catalogs and add items to order</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-gray-50/50">
                    {/* Left Pane - Search & Results */}
                    <div className="flex-1 flex flex-col h-full border-r border-gray-200">
                        <div className="p-6 border-b border-gray-100 bg-white flex-none tracking-tight">
                            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
                                <div className="w-full sm:w-1/3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Vendor</label>
                                    <div className="relative">
                                        <Building2 className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                                        <select
                                            value={selectedVendorId}
                                            onChange={(e) => {
                                                setSelectedVendorId(e.target.value);
                                                setResults(null); 
                                                setCart([]); // Reset cart on vendor change logic? Let's leave it up to user if they want to mix vendors. Wait, a PO can only be single-vendor.
                                            }}
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                        >
                                            {vendors.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {cart.length > 0 && <p className="text-xs text-orange-500 mt-1">Warning: Changing vendors will apply these cart items to the new selected vendor's PO.</p>}
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Product or Keyword</label>
                                    <div className="relative flex gap-2">
                                        <div className="relative flex-1">
                                            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                                            <input
                                                type="text"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                placeholder="e.g. Milwaukee M18 Fuel Drill"
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!searchTerm.trim() || !selectedVendorId || isSearching}
                                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2 font-medium shadow-sm"
                                        >
                                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            Search
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30">
                            {error && (
                                <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-100 mb-6">
                                    {error}
                                </div>
                            )}

                            {isSearching ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 py-12">
                                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                                    <p className="text-lg font-medium text-gray-900">Scanning Vendor Catalog...</p>
                                    <p className="text-sm mt-1 max-w-sm text-center">Using AI to analyze real-time pricing and availability from the vendor's domain.</p>
                                </div>
                            ) : results ? (
                                results.length > 0 ? (
                                    <div className="space-y-4">
                                        {results.map((item, idx) => (
                                            <div key={idx} className="p-4 border border-gray-200 rounded-xl hover:border-indigo-300 transition-colors group bg-white shadow-sm">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">{item.title}</h3>
                                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description || 'No description provided.'}</p>
                                                        {item.url && (
                                                            <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mt-3 font-medium">
                                                                View on Vendor Site
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <div className="text-right flex-none flex flex-col items-end gap-3">
                                                        <div className="inline-block font-bold text-gray-900 text-lg bg-green-50 text-green-700 px-3 py-1 rounded-lg border border-green-100">
                                                            {item.price === 'Price unavailable' ? (
                                                                <span className="text-sm text-gray-600 font-normal">Not listed</span>
                                                            ) : (
                                                                item.price
                                                            )}
                                                        </div>
                                                        <button 
                                                            onClick={(_) => handleAddToCart(item)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors shadow-sm"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                            Add to Order
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-500 py-12">
                                        <Search className="w-12 h-12 text-gray-300 mb-4" />
                                        <p className="text-lg font-medium text-gray-900">No products found</p>
                                        <p className="text-sm mt-1 text-center">We couldn't find pricing for that item at this vendor currently.</p>
                                    </div>
                                )
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                    <PackageOpen className="w-16 h-16 text-gray-200 mb-4" />
                                    <p className="text-gray-500 font-medium">Select a vendor and search for items</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Pane - Cart */}
                    <div className="w-full md:w-96 flex flex-col bg-white border-l border-gray-100 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 hidden md:flex">
                        <div className="p-6 border-b border-gray-100 bg-white">
                            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                <ShoppingCart className="w-5 h-5 text-indigo-500" />
                                Current Order
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">{cart.length} unique item{cart.length === 1 ? '' : 's'}</p>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6">
                            {cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center py-12 text-gray-400">
                                    <ShoppingCart className="w-12 h-12 text-gray-200 mb-3" />
                                    <p className="text-center text-sm font-medium">Your order summary is empty</p>
                                    <p className="text-center text-xs mt-1">Search and add items to get started.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {cart.map((item, idx) => (
                                        <div key={idx} className="bg-white border text-sm border-gray-200 rounded-lg p-3 shadow-sm relative group">
                                            <div className="pr-6">
                                                <h4 className="font-semibold text-gray-900 leading-tight mb-1">{item.name}</h4>
                                                <p className="text-gray-500 tabular-nums">${item.unitPrice.toFixed(2)}/ea</p>
                                            </div>
                                            
                                            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                                                <div className="flex items-center gap-2 bg-gray-50 rounded-md border border-gray-200 p-0.5">
                                                    <button onClick={() => handleUpdateQuantity(item.name, -1)} className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-600">
                                                        <Minus className="w-3.5 h-3.5" />
                                                    </button>
                                                    <span className="w-6 text-center font-medium tabular-nums">{item.quantity}</span>
                                                    <button onClick={() => handleUpdateQuantity(item.name, 1)} className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-600">
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <span className="font-bold text-gray-900 tabular-nums">${(item.unitPrice * item.quantity).toFixed(2)}</span>
                                            </div>

                                            <button 
                                                onClick={() => handleRemoveCartItem(item.name)} 
                                                className="absolute top-3 right-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-gray-600 font-medium">Estimated Subtotal</span>
                                <span className="text-xl font-bold text-gray-900 tracking-tight">${cartTotal.toFixed(2)}</span>
                            </div>
                            <button
                                onClick={handleCreateDraftPO}
                                disabled={cart.length === 0 || isSaving}
                                className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 gap-2"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <><ShoppingCart className="w-5 h-5" /> Compile Draft Order</>
                                )}
                            </button>
                            {cart.length > 0 && <p className="text-center text-xs text-gray-500 mt-2">Tax and shipping can be applied during review.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
