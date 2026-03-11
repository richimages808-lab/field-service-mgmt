import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

interface AIRecommendation {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; inInventory: boolean; estimatedCost?: number }>;
    estimatedDuration: number;
    confidence: number;
    safetyWarnings?: string[];
}

export const useAIAnalysis = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const analyzeJob = async (jobId: string): Promise<AIRecommendation | null> => {
        setLoading(true);
        setError(null);

        try {
            const analyzeJobFn = httpsCallable(functions, 'analyzeJobWithAI');
            const result = await analyzeJobFn({ jobId });

            const data = result.data as { success: boolean; recommendation: AIRecommendation };

            if (data.success) {
                return data.recommendation;
            } else {
                throw new Error('AI analysis failed');
            }
        } catch (err: any) {
            console.error('AI analysis error:', err);
            setError(err.message || 'Failed to analyze job');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const catalogInventory = async (imageData: string, techId: string) => {
        setLoading(true);
        setError(null);

        try {
            const catalogFn = httpsCallable(functions, 'catalogInventoryFromImage');
            const result = await catalogFn({ imageUrl: imageData, techId });

            const data = result.data as { success: boolean; itemsFound: number; items: any[] };

            if (data.success) {
                return data.items;
            } else {
                throw new Error('Inventory cataloging failed');
            }
        } catch (err: any) {
            console.error('Cataloging error:', err);
            setError(err.message || 'Failed to catalog inventory');
            return null;
        } finally {
            setLoading(false);
        }
    };

    return {
        analyzeJob,
        catalogInventory,
        loading,
        error,
    };
};
