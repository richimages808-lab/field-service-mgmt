import React from 'react';
import { Settings, Wrench, HelpCircle, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { AgentConfig } from '../types';

interface PreviewTabProps {
    config: AgentConfig;
    buildPreviewPrompt: (c: AgentConfig) => string;
    hasUnsavedChanges: boolean;
    handleSave: () => Promise<void>;
    saving: boolean;
}

export const PreviewTab: React.FC<PreviewTabProps> = ({
    config,
    buildPreviewPrompt,
    hasUnsavedChanges,
    handleSave,
    saving
}) => {
    return (
        <div className="space-y-6">
            {/* System Prompt Preview */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-violet-500" />
                        System Prompt Preview
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        This is what your AI agent knows, compiled from all your settings
                    </p>
                </div>
                <div className="p-6">
                    <div className="bg-slate-900 text-slate-100 rounded-xl p-5 text-sm font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                        {buildPreviewPrompt(config)}
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-violet-100 p-2 rounded-lg">
                            <Wrench className="w-4 h-4 text-violet-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Services</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{config.services.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-blue-100 p-2 rounded-lg">
                            <HelpCircle className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">FAQs</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{config.faqs.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-emerald-100 p-2 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-500">Status</span>
                    </div>
                    <p className="text-lg font-bold text-emerald-600">
                        {config.status === 'active' ? 'Active' : 'Ready'}
                    </p>
                </div>
            </div>

            {/* Unsaved changes warning */}
            {hasUnsavedChanges && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900">You have unsaved changes!</p>
                        <p className="text-xs text-amber-700 mt-1">Make sure to save your configuration so the AI agent receives the latest updates.</p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary py-2 px-4 whitespace-nowrap flex items-center gap-2"
                    >
                        {saving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};
