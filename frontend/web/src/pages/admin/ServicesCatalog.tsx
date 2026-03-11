import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ProductService } from '../../types';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Edit2, Trash2, Package, Wrench, Loader2, Save, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const ServicesCatalog: React.FC = () => {
    const { user } = useAuth();
    const [items, setItems] = useState<ProductService[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ProductService | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [unitPrice, setUnitPrice] = useState(0);
    const [type, setType] = useState<'service' | 'material'>('service');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            const snap = await getDocs(collection(db, 'products_services'));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ProductService[];
            setItems(data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load catalog');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (item?: ProductService) => {
        if (item) {
            setEditingItem(item);
            setName(item.name);
            setDescription(item.description || '');
            setUnitPrice(item.unit_price);
            setType(item.type);
        } else {
            setEditingItem(null);
            setName('');
            setDescription('');
            setUnitPrice(0);
            setType('service');
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSubmitting(true);

        try {
            const itemData = {
                name,
                description,
                unit_price: Number(unitPrice),
                type,
                org_id: 'default', // TODO: user.orgId
                updatedAt: serverTimestamp()
            };

            if (editingItem) {
                await updateDoc(doc(db, 'products_services', editingItem.id), itemData);
                toast.success('Item updated');
            } else {
                await addDoc(collection(db, 'products_services'), {
                    ...itemData,
                    createdAt: serverTimestamp()
                });
                toast.success('Item created');
            }
            setIsModalOpen(false);
            fetchItems();
        } catch (error) {
            console.error(error);
            toast.error('Failed to save item');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;
        try {
            await deleteDoc(doc(db, 'products_services', id));
            toast.success('Item deleted');
            fetchItems();
        } catch (error) {
            console.error(error);
            toast.error('Failed to delete item');
        }
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <header className="mb-8 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link to="/admin" className="text-gray-500 hover:text-gray-700">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Services Catalog</h1>
                        <p className="text-gray-600">Manage your standard products and service rates.</p>
                    </div>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Add Item
                </button>
            </header>

            <div className="bg-white rounded-lg shadow mb-6">
                <div className="p-4 border-b">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search catalog..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                        <tr>
                            <th className="p-4">Type</th>
                            <th className="p-4">Name</th>
                            <th className="p-4">Description</th>
                            <th className="p-4 text-right">Unit Price</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map(item => (
                            <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-4">
                                    {item.type === 'service' ? (
                                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">
                                            <Wrench className="w-3 h-3" /> Service
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-semibold">
                                            <Package className="w-3 h-3" /> Material
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 font-medium text-gray-900">{item.name}</td>
                                <td className="p-4 text-gray-500 text-sm max-w-md truncate">{item.description}</td>
                                <td className="p-4 text-right font-medium">${item.unit_price.toFixed(2)}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => handleOpenModal(item)}
                                            className="p-1 text-gray-400 hover:text-blue-600"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="p-1 text-gray-400 hover:text-red-600"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredItems.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                        No items found. Add your first service or product!
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-lg font-bold text-gray-800">
                                {editingItem ? 'Edit Item' : 'New Catalog Item'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)}><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="type"
                                            value="service"
                                            checked={type === 'service'}
                                            onChange={() => setType('service')}
                                            className="text-blue-600"
                                        />
                                        <span className="text-sm">Service (Labor, Fees)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="type"
                                            value="material"
                                            checked={type === 'material'}
                                            onChange={() => setType('material')}
                                            className="text-blue-600"
                                        />
                                        <span className="text-sm">Material (Parts)</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g. Standard Service Call"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={unitPrice}
                                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    rows={3}
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                                    Save Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
