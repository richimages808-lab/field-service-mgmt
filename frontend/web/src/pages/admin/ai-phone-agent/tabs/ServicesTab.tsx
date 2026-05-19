import React from 'react';
import { Wrench, Plus, GripVertical, Trash2 } from 'lucide-react';
import { AgentConfig } from '../types';

interface ServicesTabProps {
    config: AgentConfig;
    updateService: (index: number, field: string, value: string) => void;
    addService: () => void;
    removeService: (index: number) => void;
}

export const ServicesTab: React.FC<ServicesTabProps> = ({
    config,
    updateService,
    addService,
    removeService
}) => {
    return (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
            <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-violet-500" />
                            Services & Pricing
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            List the services you offer so your AI agent can explain them to callers
                        </p>
                    </div>
                    <button
                        onClick={addService}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-100 transition-colors"
                        id="add-service-btn"
                    >
                        <Plus className="w-4 h-4" /> Add Service
                    </button>
                </div>
            </div>
            <div className="p-6">
                {config.services.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-lg font-medium">No services added yet</p>
                        <p className="text-sm mt-1">Add your services so your AI agent can tell callers about them</p>
                        <button
                            onClick={addService}
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-violet-100 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-200 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Your First Service
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {config.services.map((service, index) => (
                            <div key={index} className="flex gap-3 items-start p-4 bg-gray-50 rounded-xl group">
                                <div className="text-gray-300 mt-2 cursor-grab">
                                    <GripVertical className="w-4 h-4" />
                                </div>
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                        type="text"
                                        value={service.name}
                                        onChange={e => updateService(index, 'name', e.target.value)}
                                        placeholder="Service name"
                                        className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                    />
                                    <input
                                        type="text"
                                        value={service.description}
                                        onChange={e => updateService(index, 'description', e.target.value)}
                                        placeholder="Brief description"
                                        className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                    />
                                    <input
                                        type="text"
                                        value={service.priceRange}
                                        onChange={e => updateService(index, 'priceRange', e.target.value)}
                                        placeholder="e.g. $75-$150"
                                        className="border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                                    />
                                </div>
                                <button
                                    onClick={() => removeService(index)}
                                    className="text-gray-400 hover:text-red-500 transition-colors mt-2 opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
