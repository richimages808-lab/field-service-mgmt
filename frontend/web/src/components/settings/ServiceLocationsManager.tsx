import React, { useState } from 'react';
import {
    MapPin,
    Plus,
    X,
    Navigation,
    Compass,
    Building,
    Check
} from 'lucide-react';

export interface PrimaryLocation {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    radiusMiles?: number;
}

interface ServiceLocationsManagerProps {
    primaryLocation: PrimaryLocation;
    onPrimaryLocationChange: (loc: PrimaryLocation) => void;
    serviceAreas: string[];
    onServiceAreasChange: (areas: string[]) => void;
}

export const ServiceLocationsManager: React.FC<ServiceLocationsManagerProps> = ({
    primaryLocation,
    onPrimaryLocationChange,
    serviceAreas = [],
    onServiceAreasChange
}) => {
    const [newAreaInput, setNewAreaInput] = useState('');

    const handleAddArea = () => {
        if (!newAreaInput.trim()) return;

        // Support comma-separated batch input e.g. "Honolulu, Kailua, Pearl City"
        const incoming = newAreaInput
            .split(',')
            .map(a => a.trim())
            .filter(a => a.length > 0 && !serviceAreas.includes(a));

        if (incoming.length > 0) {
            onServiceAreasChange([...serviceAreas, ...incoming]);
        }
        setNewAreaInput('');
    };

    const handleRemoveArea = (areaToRemove: string) => {
        onServiceAreasChange(serviceAreas.filter(a => a !== areaToRemove));
    };

    const handleFieldChange = (field: keyof PrimaryLocation, value: any) => {
        onPrimaryLocationChange({
            ...primaryLocation,
            [field]: value
        });
    };

    const radius = primaryLocation.radiusMiles || 30;

    return (
        <div className="space-y-6">
            {/* Primary Headquarters / Base Address */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-sm font-semibold text-slate-900">
                        Primary Dispatch Base & Headquarters
                    </h4>
                </div>
                <p className="text-xs text-slate-500">
                    Your primary operational base used for travel time estimation, driving distances, and dispatch center mapping.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Street Address
                        </label>
                        <input
                            type="text"
                            value={primaryLocation.street || ''}
                            onChange={(e) => handleFieldChange('street', e.target.value)}
                            placeholder="e.g. 1045 Bishop St, Suite 300"
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            City / Town
                        </label>
                        <input
                            type="text"
                            value={primaryLocation.city || ''}
                            onChange={(e) => handleFieldChange('city', e.target.value)}
                            placeholder="e.g. Honolulu"
                            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                    State / Prov
                                </label>
                                <input
                                    type="text"
                                    value={primaryLocation.state || ''}
                                    onChange={(e) => handleFieldChange('state', e.target.value.toUpperCase())}
                                    placeholder="HI"
                                    maxLength={2}
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-center font-semibold focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                    ZIP Code
                                </label>
                                <input
                                    type="text"
                                    value={primaryLocation.zip || ''}
                                    onChange={(e) => handleFieldChange('zip', e.target.value)}
                                    placeholder="96813"
                                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-center focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Service Radius Slider */}
                <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-700 flex items-center gap-1.5">
                            <Compass className="w-3.5 h-3.5 text-indigo-600" />
                            Dispatch Service Radius:
                        </span>
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            {radius} miles from base
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min="5"
                            max="150"
                            step="5"
                            value={radius}
                            onChange={(e) => handleFieldChange('radiusMiles', Number(e.target.value))}
                            className="w-full accent-indigo-600 cursor-pointer"
                        />
                        <span className="text-xs text-slate-400 w-12 text-right">{radius} mi</span>
                    </div>
                </div>
            </div>

            {/* Service Areas Served (Cities, Counties, Towns, ZIPs) */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-600" />
                            Covered Cities, Towns & ZIP Codes
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Specific neighborhoods or cities where you offer service. Used for online booking validation and customer matching.
                        </p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {serviceAreas.length} Areas
                    </span>
                </div>

                {/* Tag Input */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Navigation className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={newAreaInput}
                            onChange={(e) => setNewAreaInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddArea();
                                }
                            }}
                            placeholder="Type a city, town, or ZIP code (or paste comma-separated list)..."
                            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleAddArea}
                        disabled={!newAreaInput.trim()}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-colors flex items-center gap-1 shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Area
                    </button>
                </div>

                {/* Active Tag Chips */}
                {serviceAreas.length > 0 ? (
                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[50px] items-center">
                        {serviceAreas.map((area, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white text-slate-800 border border-slate-200 shadow-xs hover:border-slate-300 transition-colors"
                            >
                                <MapPin className="w-3 h-3 text-indigo-500" />
                                <span>{area}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveArea(area)}
                                    className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-rose-500 transition-colors ml-0.5"
                                    title={`Remove ${area}`}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                        <p className="text-xs text-slate-500">
                            No individual service areas added yet. Enter cities or ZIP codes above.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
