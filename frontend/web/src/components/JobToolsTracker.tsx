import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { ToolItem } from '../types';
import { Wrench, Check, Plus } from 'lucide-react';

interface JobToolsTrackerProps {
    jobId: string;
    jobName: string;
    readOnly?: boolean;
}

export const JobToolsTracker: React.FC<JobToolsTrackerProps> = ({ jobId, jobName, readOnly = false }) => {
    const { user } = useAuth();
    const [tools, setTools] = useState<ToolItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSelecting, setIsSelecting] = useState(false);

    const orgId = (user as any)?.org_id || user?.uid;

    useEffect(() => {
        if (!orgId) return;

        const q = query(
            collection(db, 'tools'),
            where('org_id', '==', orgId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const toolsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as ToolItem));
            setTools(toolsData);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching tools:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orgId]);

    const handleToggleTool = async (tool: ToolItem) => {
        if (readOnly) return;
        
        try {
            const isCurrentlyUsedHere = tool.lastJobId === jobId;
            
            await updateDoc(doc(db, 'tools', tool.id), {
                lastJobId: isCurrentlyUsedHere ? null : jobId,
                lastJobName: isCurrentlyUsedHere ? null : jobName,
                lastJobDate: isCurrentlyUsedHere ? null : serverTimestamp(),
                status: isCurrentlyUsedHere ? 'available' : 'in_use'
            });
        } catch (error) {
            console.error('Error updating tool usage:', error);
        }
    };

    const usedTools = tools.filter(t => t.lastJobId === jobId);

    if (loading) {
        return <div className="p-4 bg-white rounded-lg shadow animate-pulse h-32"></div>;
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-blue-600" />
                    Tools Used
                </h3>
                {!readOnly && (
                    <button
                        onClick={() => setIsSelecting(!isSelecting)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                        {isSelecting ? 'Done' : <><Plus className="w-4 h-4"/> Add Tool</>}
                    </button>
                )}
            </div>

            {isSelecting ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {tools.map(tool => {
                        const isUsedHere = tool.lastJobId === jobId;
                        return (
                            <button
                                key={tool.id}
                                onClick={() => handleToggleTool(tool)}
                                className={`w-full text-left p-2 rounded border flex items-center justify-between transition-colors ${
                                    isUsedHere ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-200'
                                }`}
                            >
                                <div>
                                    <p className={`text-sm font-medium ${isUsedHere ? 'text-blue-900' : 'text-gray-900'}`}>
                                        {tool.name}
                                    </p>
                                    {tool.location && <p className="text-xs text-gray-500">{tool.location}</p>}
                                </div>
                                {isUsedHere && <Check className="w-4 h-4 text-blue-600" />}
                            </button>
                        );
                    })}
                    {tools.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">No tools found in inventory.</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {usedTools.length > 0 ? (
                        usedTools.map(tool => (
                            <div key={tool.id} className="p-2 bg-gray-50 rounded flex items-center gap-2 border border-gray-100">
                                <Wrench className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-700">{tool.name}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-2">No tools logged for this job.</p>
                    )}
                </div>
            )}
        </div>
    );
};
