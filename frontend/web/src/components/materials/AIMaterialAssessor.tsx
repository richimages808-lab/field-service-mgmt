import React, { useState } from 'react';
import { Sparkles, Package, ShoppingCart, Loader2, CheckCircle, AlertTriangle, Info, Plus } from 'lucide-react';
import { assessJobMaterials, AssessJobMaterialsResponse } from '../../lib/aiMaterialsService';
import { useAuth } from '../../auth/AuthProvider';

interface AIMaterialAssessorProps {
    jobId: string;
    onAddMaterialToJob?: (method: 'inStock' | 'purchase', name: string, quantity: number, details: any) => void;
}

export const AIMaterialAssessor: React.FC<AIMaterialAssessorProps> = ({ jobId, onAddMaterialToJob }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AssessJobMaterialsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleAssess = async () => {
        if (!user || !jobId) return;
        const orgId = (user as any).org_id;
        
        setLoading(true);
        setError(null);
        try {
            const data = await assessJobMaterials(jobId, orgId);
            setResult(data);
        } catch (err: any) {
            console.error('Error assessing materials:', err);
            setError(err.message || 'Failed to analyze job materials. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 border-b border-indigo-100 flex items-start justify-between">
                <div>
                    <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        AI Material Planner
                    </h2>
                    <p className="text-indigo-700 text-sm mt-1 max-w-2xl">
                        Let AI analyze this job's description to accurately determine the required materials, cross-reference your current inventory, and suggest the best local suppliers for out-of-stock items.
                    </p>
                </div>
                {!result && !loading && (
                    <button
                        onClick={handleAssess}
                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow flex items-center gap-2 whitespace-nowrap"
                    >
                        <Sparkles className="w-4 h-4" />
                        Analyze Job Materials
                    </button>
                )}
            </div>

            {loading && (
                <div className="p-8 text-center flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">AI is analyzing the job description...</h3>
                    <p className="text-gray-500 mt-2">Checking local inventory and estimating sourcing requirements.</p>
                </div>
            )}

            {error && (
                <div className="p-6">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div>
                            <h3 className="text-red-900 font-medium">Analysis Failed</h3>
                            <p className="text-red-700 text-sm mt-1">{error}</p>
                            <button 
                                onClick={handleAssess}
                                className="mt-3 text-sm font-medium text-red-700 hover:text-red-800 underline"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {result && !loading && (
                <div className="p-6">
                    {/* General Advice */}
                    {result.generalAdvice && (
                        <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg flex gap-3">
                            <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <p className="text-blue-900 text-sm">{result.generalAdvice}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* In Stock */}
                        <div className="border border-green-200 rounded-lg overflow-hidden bg-white">
                            <div className="bg-green-50 p-3 border-b border-green-100 flex items-center justify-between">
                                <h3 className="font-semibold text-green-900 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    Available in Inventory
                                </h3>
                                <span className="text-xs font-medium bg-green-200 text-green-800 px-2 py-1 rounded-full">
                                    {result.inStock?.length || 0} Items
                                </span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {result.inStock?.length > 0 ? (
                                    result.inStock.map((item, idx) => (
                                        <div key={idx} className="p-3 hover:bg-gray-50 flex items-start justify-between group">
                                            <div>
                                                <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                                    <span>Needed: <strong className="text-gray-900">{item.quantity} {item.unit}</strong></span>
                                                    <span>In Stock: <strong className="text-green-700">{item.currentStock} {item.unit}</strong></span>
                                                </div>
                                            </div>
                                            {onAddMaterialToJob && (
                                                <button 
                                                    onClick={() => onAddMaterialToJob('inStock', item.name, item.quantity, item)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Add to Quote"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-gray-500 text-sm italic">
                                        No required items are fully in stock.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Requires Purchase */}
                        <div className="border border-amber-200 rounded-lg overflow-hidden bg-white">
                            <div className="bg-amber-50 p-3 border-b border-amber-100 flex items-center justify-between">
                                <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4 text-amber-600" />
                                    Requires Sourcing
                                </h3>
                                <span className="text-xs font-medium bg-amber-200 text-amber-800 px-2 py-1 rounded-full">
                                    {result.requiresPurchase?.length || 0} Items
                                </span>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {result.requiresPurchase?.length > 0 ? (
                                    result.requiresPurchase.map((item, idx) => (
                                        <div key={idx} className="p-4 hover:bg-gray-50 group">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                                                        {onAddMaterialToJob && (
                                                            <button 
                                                                onClick={() => onAddMaterialToJob('purchase', item.name, item.quantity, item)}
                                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-blue-600 hover:bg-blue-50 rounded ml-2"
                                                                title="Add to Quote"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-600 mt-1">Needed: <strong>{item.quantity} {item.unit}</strong></p>
                                                    <div className="mt-3 bg-white border border-gray-200 rounded p-2 shadow-sm">
                                                        <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-indigo-700">
                                                            <ShoppingCart className="w-3.5 h-3.5" />
                                                            Suggested Supplier: {item.suggestedSupplier}
                                                        </div>
                                                        <p className="text-xs text-gray-600 italic">"{item.reasoning}"</p>
                                                        {item.estimatedUnitCost > 0 && (
                                                            <p className="text-xs text-gray-500 mt-1.5 font-medium border-t border-gray-100 pt-1">
                                                                Est. Unit Cost: ${item.estimatedUnitCost.toFixed(2)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-gray-500 text-sm italic">
                                        All required items are mapped to existing inventory!
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
