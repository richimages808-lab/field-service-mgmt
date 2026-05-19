import React from 'react';
import { Settings, Plus, Trash2 } from 'lucide-react';
import { AgentConfig, CallWorkflow } from '../types';

interface WorkflowsTabProps {
    config: AgentConfig;
    setConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
}

export const WorkflowsTab: React.FC<WorkflowsTabProps> = ({ config, setConfig }) => {
    
    const addWorkflow = () => {
        const newWorkflow: CallWorkflow = {
            id: Date.now().toString(),
            intent: '',
            instructions: '',
        };
        setConfig({ ...config, workflows: [...(config.workflows || []), newWorkflow] });
    };

    const addTemplateWorkflow = (intent: string, instructions: string) => {
        const newWorkflow: CallWorkflow = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            intent,
            instructions,
        };
        setConfig({ ...config, workflows: [...(config.workflows || []), newWorkflow] });
    };

    const TEMPLATES = [
        {
            label: 'Quote',
            intent: 'Requesting a quote',
            instructions: 'Ask for details of the quote, location, contact information, and requested contact method. Recap the request. Ask for any follow-up questions and if none, say "We will get back with you shortly. Thank you and have a great day. Goodbye."'
        },
        {
            label: 'Scheduling',
            intent: 'Scheduling or rescheduling an appointment',
            instructions: 'Ask for the customer\'s name and with that check the schedule for their appointment. Ask them to provide some alternative dates and times. Tell them we will get back to them with the updated appointment. Repeat until the customer has at least one available date and time to confirm. Then recap and say "Thank you and have a great day. Goodbye."'
        },
        {
            label: 'Question',
            intent: 'Asking a question',
            instructions: 'Answer the question based on the FAQs or other business information available. Ask if there are any other questions. If so, answer them. If not, say "Thank you and have a great day. Goodbye."'
        }
    ];

    const updateWorkflow = (id: string, field: keyof CallWorkflow, value: string) => {
        setConfig({
            ...config,
            workflows: config.workflows.map(wf =>
                wf.id === id ? { ...wf, [field]: value } : wf
            ),
        });
    };

    const deleteWorkflow = (id: string) => {
        setConfig({
            ...config,
            workflows: config.workflows.filter(wf => wf.id !== id),
        });
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-indigo-500" />
                        Call Workflows
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Define dynamic AI logic based on the reason the customer is calling.
                    </p>
                </div>
                <button
                    onClick={addWorkflow}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Workflow
                </button>
            </div>
            <div className="p-6">
                <div className="mb-6">
                    <p className="text-sm text-gray-600 mb-3">Quick Start Templates:</p>
                    <div className="flex flex-wrap gap-2">
                        {TEMPLATES.map((tmpl, idx) => (
                            <button
                                key={idx}
                                onClick={() => addTemplateWorkflow(tmpl.intent, tmpl.instructions)}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
                            >
                                + {tmpl.label}
                            </button>
                        ))}
                    </div>
                </div>

                {(!config.workflows || config.workflows.length === 0) ? (
                    <div className="text-center py-8 text-gray-500">
                        No custom workflows defined. The AI will default to taking general messages.
                    </div>
                ) : (
                    <div className="space-y-6">
                        {config.workflows.map((wf, index) => (
                            <div key={wf.id} className="p-5 border border-gray-200 rounded-xl relative group bg-gray-50/50">
                                <button
                                    onClick={() => deleteWorkflow(wf.id)}
                                    className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    title="Remove workflow"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            If the caller's intent is...
                                        </label>
                                        <input
                                            type="text"
                                            value={wf.intent}
                                            onChange={(e) => updateWorkflow(wf.id, 'intent', e.target.value)}
                                            placeholder="e.g. Requesting a new quote, Scheduling a service, Reporting an emergency"
                                            className="w-full border border-gray-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            The AI MUST follow these instructions:
                                        </label>
                                        <textarea
                                            value={wf.instructions}
                                            onChange={(e) => updateWorkflow(wf.id, 'instructions', e.target.value)}
                                            placeholder="e.g. Ask for photos of the issue, their budget, and timeline. Recap their request at the end."
                                            rows={4}
                                            className="w-full border border-gray-300 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
