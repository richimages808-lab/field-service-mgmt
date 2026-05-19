import React, { useState } from 'react';
import { HelpCircle, Trash2, Plus, ArrowRight, RefreshCw, X } from 'lucide-react';
import { AgentConfig, FaqItem, FAQ_TEMPLATES } from '../types';

interface FaqsTabProps {
    config: AgentConfig;
    setConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
    customerQuestions: any[];
    loadingQuestions: boolean;
    loadCustomerQuestions: () => void;
    promoteAndDismiss: (qId: string, question: string) => void;
    dismissQuestion: (qId: string) => void;
}

export const FaqsTab: React.FC<FaqsTabProps> = ({
    config,
    setConfig,
    customerQuestions,
    loadingQuestions,
    loadCustomerQuestions,
    promoteAndDismiss,
    dismissQuestion,
}) => {
    const addFaq = (faq?: FaqItem) => {
        setConfig(prev => ({
            ...prev,
            faqs: [...prev.faqs, faq || { question: '', answer: '' }]
        }));
    };

    const updateFaq = (index: number, field: keyof FaqItem, value: string) => {
        const newFaqs = [...config.faqs];
        newFaqs[index] = { ...newFaqs[index], [field]: value };
        setConfig(prev => ({ ...prev, faqs: newFaqs }));
    };

    const removeFaq = (index: number) => {
        setConfig(prev => ({
            ...prev,
            faqs: prev.faqs.filter((_, i) => i !== index)
        }));
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <HelpCircle className="w-5 h-5 text-blue-500" />
                            Frequently Asked Questions
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Train your agent to answer common customer questions</p>
                    </div>
                    <button
                        onClick={() => addFaq()}
                        className="btn-primary py-2 text-sm flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Custom FAQ
                    </button>
                </div>
                <div className="p-6">
                    {/* Customer Questions Box */}
                    <div className="mb-8 bg-blue-50/50 border border-blue-100 rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-blue-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                    <HelpCircle className="w-4 h-4 text-blue-600" />
                                    Customer Questions Log
                                </h3>
                                <p className="text-xs text-blue-700/80 mt-1">Questions customers asked that the agent couldn't answer well.</p>
                            </div>
                            <button
                                onClick={loadCustomerQuestions}
                                disabled={loadingQuestions}
                                className="text-blue-600 hover:text-blue-700 p-2 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Refresh questions"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingQuestions ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="divide-y divide-blue-100/50 max-h-[300px] overflow-y-auto">
                            {loadingQuestions ? (
                                <div className="p-8 text-center text-blue-600 flex flex-col items-center justify-center">
                                    <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                                    <p className="text-sm font-medium">Loading unhandled questions...</p>
                                </div>
                            ) : customerQuestions.length === 0 ? (
                                <div className="p-8 text-center">
                                    <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <HelpCircle className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <p className="text-sm font-medium text-blue-900">No pending questions!</p>
                                    <p className="text-xs text-blue-700/80 mt-1">Your AI is handling everything smoothly.</p>
                                </div>
                            ) : (
                                customerQuestions.map(q => (
                                    <div key={q.id} className="p-4 hover:bg-blue-50 transition-colors flex items-start gap-4 group">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900">"{q.question}"</p>
                                            <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                                <span>Asked {new Date(q.askedAt).toLocaleDateString()}</span>
                                                {q.count > 1 && (
                                                    <span className="font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                                        Asked {q.count} times
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => dismissQuestion(q.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                title="Dismiss"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => promoteAndDismiss(q.id, q.question)}
                                                className="px-3 py-1.5 text-xs font-medium bg-white text-blue-600 border border-blue-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                                            >
                                                Add to FAQs
                                                <ArrowRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {FAQ_TEMPLATES.map((template, idx) => {
                            const isAdded = config.faqs.some(f => f.question === template.question);
                            if (isAdded) return null;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => addFaq(template)}
                                    className="text-left p-3 rounded-xl border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-600 hover:text-blue-700"
                                >
                                    <span className="block font-medium mb-1">+ Add standard question:</span>
                                    <span className="truncate block">{template.question}</span>
                                </button>
                            );
                        })}
                    </div>

                    {config.faqs.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                            <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No FAQs added yet</h3>
                            <p className="text-gray-500 mb-6 max-w-md mx-auto">
                                Add common questions to help your agent answer customer inquiries accurately and save time.
                            </p>
                            <button
                                onClick={() => addFaq()}
                                className="btn-primary"
                            >
                                Add Your First FAQ
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {config.faqs.map((faq, index) => (
                                <div key={index} className="flex gap-4 items-start bg-gray-50 p-4 rounded-xl border border-gray-100 group">
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Question</label>
                                            <input
                                                type="text"
                                                value={faq.question}
                                                onChange={(e) => updateFaq(index, 'question', e.target.value)}
                                                placeholder="e.g., What forms of payment do you accept?"
                                                className="input-field bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Answer</label>
                                            <textarea
                                                value={faq.answer}
                                                onChange={(e) => updateFaq(index, 'answer', e.target.value)}
                                                placeholder="e.g., We accept all major credit cards, checks, and cash."
                                                rows={2}
                                                className="input-field bg-white"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => removeFaq(index)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove FAQ"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
