import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { JobChecklist as JobChecklistType, ChecklistTemplate, JobCategory } from '../types';
import { CheckSquare, Square, Camera, Plus, ChevronDown, ChevronUp } from 'lucide-react';

interface JobChecklistProps {
    jobId: string;
    jobCategory?: JobCategory;
    onComplete?: () => void;
    readOnly?: boolean;
}

export const JobChecklist: React.FC<JobChecklistProps> = ({ jobId, jobCategory, onComplete, readOnly = false }) => {
    const { user } = useAuth();
    const [checklist, setChecklist] = useState<JobChecklistType | null>(null);
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [saving, setSaving] = useState(false);

    const orgId = (user as any)?.org_id || 'demo-org';

    useEffect(() => {
        loadChecklist();
        loadTemplates();
    }, [jobId, orgId]);

    const loadChecklist = async () => {
        try {
            const q = query(
                collection(db, 'job_checklists'),
                where('job_id', '==', jobId)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                setChecklist({
                    id: snapshot.docs[0].id,
                    ...snapshot.docs[0].data()
                } as JobChecklistType);
            }
        } catch (error) {
            console.error('Error loading checklist:', error);
        }
        setLoading(false);
    };

    const loadTemplates = async () => {
        try {
            const q = query(
                collection(db, 'checklist_templates'),
                where('org_id', '==', orgId),
                where('isActive', '==', true)
            );
            const snapshot = await getDocs(q);
            setTemplates(snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as ChecklistTemplate)));
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    };

    const createFromTemplate = async (template: ChecklistTemplate) => {
        setSaving(true);
        try {
            const newChecklist = {
                job_id: jobId,
                template_id: template.id,
                items: template.items.map(item => ({
                    ...item,
                    isCompleted: false
                }))
            };
            const docRef = await addDoc(collection(db, 'job_checklists'), newChecklist);
            setChecklist({
                id: docRef.id,
                ...newChecklist
            } as JobChecklistType);
        } catch (error) {
            console.error('Error creating checklist:', error);
        }
        setSaving(false);
    };

    const createEmptyChecklist = async () => {
        setSaving(true);
        try {
            const newChecklist = {
                job_id: jobId,
                items: [
                    { id: '1', text: 'Arrived on site', isRequired: true, isCompleted: false },
                    { id: '2', text: 'Identified issue', isRequired: true, isCompleted: false },
                    { id: '3', text: 'Completed repair/service', isRequired: true, isCompleted: false },
                    { id: '4', text: 'Tested solution', isRequired: true, isCompleted: false },
                    { id: '5', text: 'Cleaned work area', isRequired: false, isCompleted: false },
                    { id: '6', text: 'Customer walkthrough', isRequired: false, isCompleted: false }
                ]
            };
            const docRef = await addDoc(collection(db, 'job_checklists'), newChecklist);
            setChecklist({
                id: docRef.id,
                ...newChecklist
            } as JobChecklistType);
        } catch (error) {
            console.error('Error creating checklist:', error);
        }
        setSaving(false);
    };

    const toggleItem = async (itemId: string) => {
        if (!checklist || readOnly) return;

        const updatedItems = checklist.items.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    isCompleted: !item.isCompleted,
                    completedAt: !item.isCompleted ? new Date() : undefined,
                    completedBy: !item.isCompleted ? user?.uid : undefined
                };
            }
            return item;
        });

        // Check if all required items are completed
        const allRequiredComplete = updatedItems
            .filter(item => item.isRequired)
            .every(item => item.isCompleted);

        try {
            await updateDoc(doc(db, 'job_checklists', checklist.id), {
                items: updatedItems,
                ...(allRequiredComplete ? { completedAt: serverTimestamp() } : {})
            });

            setChecklist({
                ...checklist,
                items: updatedItems,
                completedAt: allRequiredComplete ? new Date() : undefined
            });

            if (allRequiredComplete && onComplete) {
                onComplete();
            }
        } catch (error) {
            console.error('Error updating checklist:', error);
        }
    };

    const addNote = async (itemId: string, note: string) => {
        if (!checklist) return;

        const updatedItems = checklist.items.map(item => {
            if (item.id === itemId) {
                return { ...item, notes: note };
            }
            return item;
        });

        try {
            await updateDoc(doc(db, 'job_checklists', checklist.id), {
                items: updatedItems
            });
            setChecklist({ ...checklist, items: updatedItems });
        } catch (error) {
            console.error('Error updating note:', error);
        }
    };

    const completedCount = checklist?.items.filter(i => i.isCompleted).length || 0;
    const totalCount = checklist?.items.length || 0;
    const requiredCount = checklist?.items.filter(i => i.isRequired).length || 0;
    const requiredCompleted = checklist?.items.filter(i => i.isRequired && i.isCompleted).length || 0;

    if (loading) {
        return <div className="p-4 text-gray-500">Loading checklist...</div>;
    }

    if (!checklist) {
        // Show option to create checklist
        const relevantTemplates = templates.filter(
            t => !t.jobCategory || t.jobCategory === jobCategory
        );

        return (
            <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Job Checklist</h3>
                <p className="text-gray-500 text-sm mb-4">No checklist for this job yet.</p>

                <div className="space-y-2">
                    <button
                        onClick={createEmptyChecklist}
                        disabled={saving}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Create Standard Checklist
                    </button>

                    {relevantTemplates.length > 0 && (
                        <>
                            <p className="text-xs text-gray-500 text-center">or use a template:</p>
                            {relevantTemplates.map(template => (
                                <button
                                    key={template.id}
                                    onClick={() => createFromTemplate(template)}
                                    disabled={saving}
                                    className="w-full px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                                >
                                    {template.name}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow">
            {/* Header */}
            <div
                className="p-4 border-b cursor-pointer flex items-center justify-between"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3">
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                    <div>
                        <h3 className="font-semibold text-gray-900">Job Checklist</h3>
                        <p className="text-sm text-gray-500">
                            {completedCount}/{totalCount} completed
                            {requiredCount > 0 && ` (${requiredCompleted}/${requiredCount} required)`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {checklist.completedAt && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                            Complete
                        </span>
                    )}
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="px-4 py-2 bg-gray-50">
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                    />
                </div>
            </div>

            {/* Items */}
            {expanded && (
                <div className="p-4 space-y-2">
                    {checklist.items.map(item => (
                        <div
                            key={item.id}
                            className={`p-3 rounded-lg border ${
                                item.isCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <button
                                    onClick={() => toggleItem(item.id)}
                                    disabled={readOnly}
                                    className="mt-0.5 flex-shrink-0"
                                >
                                    {item.isCompleted ? (
                                        <CheckSquare className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <Square className="w-5 h-5 text-gray-400" />
                                    )}
                                </button>
                                <div className="flex-1">
                                    <p className={`text-sm ${item.isCompleted ? 'text-green-800 line-through' : 'text-gray-800'}`}>
                                        {item.text}
                                        {item.isRequired && (
                                            <span className="ml-1 text-red-500 text-xs">*</span>
                                        )}
                                    </p>
                                    {item.notes && (
                                        <p className="text-xs text-gray-500 mt-1">{item.notes}</p>
                                    )}
                                </div>
                                {!readOnly && (
                                    <button
                                        className="p-1 text-gray-400 hover:text-gray-600"
                                        title="Add photo"
                                    >
                                        <Camera className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
