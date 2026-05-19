import React from 'react';
import { Building2, Volume2, Clock, MapPin } from 'lucide-react';
import { AgentConfig, VoiceOption } from '../types';

interface ProfileTabProps {
    config: AgentConfig;
    setConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
    voices: VoiceOption[];
    aiVoiceProfiles: any[];
    selectedProfileId: string;
    setSelectedProfileId: (id: string) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
    config,
    setConfig,
    voices,
    aiVoiceProfiles,
    selectedProfileId,
    setSelectedProfileId
}) => {
    return (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-violet-500" />
                    Business Profile
                </h2>
                <p className="text-sm text-gray-500 mt-1">Basic information your AI agent uses to represent your business</p>
            </div>
            <div className="p-6 space-y-5">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Name</label>
                    <input
                        type="text"
                        value={config.businessName}
                        onChange={e => setConfig(prev => ({ ...prev, businessName: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Business Description</label>
                    <textarea
                        value={config.businessDescription}
                        onChange={e => setConfig(prev => ({ ...prev, businessDescription: e.target.value }))}
                        rows={3}
                        placeholder="Describe your business, specialties, and what sets you apart..."
                        className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        <span className="flex items-center gap-1.5"><Volume2 className="w-4 h-4" /> Custom Greeting</span>
                    </label>
                    <input
                        type="text"
                        value={config.greeting}
                        onChange={e => setConfig(prev => ({ ...prev, greeting: e.target.value }))}
                        placeholder={`Thank you for calling ${config.businessName || 'our company'}. How can I help you today?`}
                        className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">This is the first thing callers will hear</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Business Hours</span>
                        </label>
                        <textarea
                            value={config.businessHours}
                            onChange={e => setConfig(prev => ({ ...prev, businessHours: e.target.value }))}
                            rows={3}
                            placeholder="Mon-Fri: 8am - 5pm&#10;Sat: 9am - 1pm&#10;Sun: Closed"
                            className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Service Area</span>
                        </label>
                        <textarea
                            value={config.serviceArea}
                            onChange={e => setConfig(prev => ({ ...prev, serviceArea: e.target.value }))}
                            rows={3}
                            placeholder="We serve all of Oahu, including Honolulu, Kailua, Kaneohe..."
                            className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">AI Voice (Tone & Sound)</label>
                        <select
                            value={config.voiceId || ''}
                            onChange={e => setConfig(prev => ({ ...prev, voiceId: e.target.value }))}
                            className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        >
                            {voices.map(v => (
                                <option key={v.id} value={v.id}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">AI Call Flow Profile</label>
                        <select
                            value={selectedProfileId}
                            onChange={e => setSelectedProfileId(e.target.value)}
                            className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        >
                            <option value="">Select a flow profile...</option>
                            {aiVoiceProfiles.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        {selectedProfileId ? (
                            <div className="mt-2 p-3 bg-violet-50/50 rounded-lg border border-violet-100">
                                <p className="text-sm text-violet-800">
                                    {aiVoiceProfiles.find(p => p.id === selectedProfileId)?.description || 'No description available for this profile.'}
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 mt-1">Leave blank to use default logic</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Human Transfer Number</label>
                        <input
                            type="tel"
                            value={config.forwardingPhoneNumber || ''}
                            onChange={e => setConfig(prev => ({ ...prev, forwardingPhoneNumber: e.target.value }))}
                            placeholder="e.g. +18005551234"
                            className="w-full border border-gray-300 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">The AI will transfer the call here if the caller asks for a human or in an emergency.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
