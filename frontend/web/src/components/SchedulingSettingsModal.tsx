import React, { useState } from 'react';
import { X, Save } from 'lucide-react';

import { SchedulingSettings } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    settings: SchedulingSettings;
    onSave: (newSettings: SchedulingSettings) => void;
}

export const SchedulingSettingsModal: React.FC<Props> = ({ isOpen, onClose, settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState<SchedulingSettings>(settings);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Scheduling Settings</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Aging Thresholds */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Aging Priority (Days)</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Medium</label>
                                <input
                                    type="number"
                                    value={localSettings.agingThresholds.medium}
                                    onChange={e => setLocalSettings({
                                        ...localSettings,
                                        agingThresholds: { ...localSettings.agingThresholds, medium: parseInt(e.target.value) }
                                    })}
                                    className="w-full border rounded p-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">High</label>
                                <input
                                    type="number"
                                    value={localSettings.agingThresholds.high}
                                    onChange={e => setLocalSettings({
                                        ...localSettings,
                                        agingThresholds: { ...localSettings.agingThresholds, high: parseInt(e.target.value) }
                                    })}
                                    className="w-full border rounded p-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Critical</label>
                                <input
                                    type="number"
                                    value={localSettings.agingThresholds.critical}
                                    onChange={e => setLocalSettings({
                                        ...localSettings,
                                        agingThresholds: { ...localSettings.agingThresholds, critical: parseInt(e.target.value) }
                                    })}
                                    className="w-full border rounded p-2 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Lunch Break */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Auto-Schedule Lunch</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Start Hour (24h)</label>
                                <input
                                    type="number"
                                    min="0" max="23"
                                    value={localSettings.lunch.startHour}
                                    onChange={e => setLocalSettings({
                                        ...localSettings,
                                        lunch: { ...localSettings.lunch, startHour: parseInt(e.target.value) }
                                    })}
                                    className="w-full border rounded p-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Duration (min)</label>
                                <input
                                    type="number"
                                    step="15"
                                    value={localSettings.lunch.durationMinutes}
                                    onChange={e => setLocalSettings({
                                        ...localSettings,
                                        lunch: { ...localSettings.lunch, durationMinutes: parseInt(e.target.value) }
                                    })}
                                    className="w-full border rounded p-2 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Parts Pickup */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Logistics</h3>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Parts Pickup Buffer (min)</label>
                            <input
                                type="number"
                                step="15"
                                value={localSettings.partsPickupMinutes}
                                onChange={e => setLocalSettings({
                                    ...localSettings,
                                    partsPickupMinutes: parseInt(e.target.value)
                                })}
                                className="w-full border rounded p-2 text-sm"
                            />
                            <p className="text-xs text-gray-400 mt-1">Added to job duration when "Parts Needed" is checked.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={handleSave}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};
