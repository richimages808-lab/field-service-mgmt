import React from 'react';
import { BookOpen } from 'lucide-react';
import { AgentConfig } from '../types';

interface InstructionsTabProps {
    config: AgentConfig;
    setConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export const InstructionsTab: React.FC<InstructionsTabProps> = ({ config, setConfig }) => {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-500" />
                        Custom Instructions
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Give specific rules or conversational guidelines for the agent to follow
                    </p>
                </div>
                <div className="p-6">
                    <textarea
                        value={config.specialInstructions}
                        onChange={(e) => setConfig({ ...config, specialInstructions: e.target.value })}
                        placeholder="e.g., Always refer to the technician as 'one of our licensed pros'. Never promise an exact arrival time, only a window."
                        rows={12}
                        className="w-full rounded-xl border border-gray-300 shadow-sm p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm leading-relaxed"
                    />
                    <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-indigo-900 mb-2">Tips for good instructions:</h4>
                        <ul className="text-sm text-indigo-800 space-y-1 list-disc list-inside">
                            <li>Be specific about what to say AND what NOT to say.</li>
                            <li>Keep it conversational—write the instructions as if you are coaching a real person.</li>
                            <li>Include policies about handling difficult customers or emergencies.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};
