import { functions, db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';

export interface LiveBillingStats {
    twilio: {
        totalCost: number;
        currency: string;
    };
    sendgrid: {
        totalEmails: number;
    };
    gemini: {
        totalTokens: number;
        estimatedCost: number;
    };
}

export const BillingService = {
    /**
     * Fetch all live API usage stats for the current month
     */
    async getLiveBillingStats(): Promise<LiveBillingStats> {
        // 1. Fetch Twilio Live Cost
        const getTwilioUsage = httpsCallable<{}, { totalCost: number; currency: string }>(functions, 'getTwilioUsage');
        let twilioData = { totalCost: 0, currency: 'USD' };
        try {
            const twilioRes = await getTwilioUsage();
            twilioData = twilioRes.data;
        } catch (e) {
            console.error('Failed to fetch Twilio live stats:', e);
        }

        // 2. Fetch SendGrid Live Volume
        const getSendGridUsage = httpsCallable<{}, { totalEmails: number }>(functions, 'getSendGridUsage');
        let sendgridData = { totalEmails: 0 };
        try {
            const sendgridRes = await getSendGridUsage();
            sendgridData = sendgridRes.data;
        } catch (e) {
            console.error('Failed to fetch SendGrid live stats:', e);
        }

        // 3. Fetch Gemini Live Tokens from Firestore
        const date = new Date();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        let geminiData = { totalTokens: 0, estimatedCost: 0 };

        try {
            const usageDoc = await getDoc(doc(db, 'site_config', `ai_usage_${monthKey}`));
            if (usageDoc.exists()) {
                const data = usageDoc.data();
                const totalTokens = data.totalTokens || 0;
                // Gemini 1.5 Flash pricing approx: $0.075 per 1M input tokens + $0.30 per 1M output tokens
                // Blended average estimate: $0.20 per 1M tokens
                const estimatedCost = (totalTokens / 1_000_000) * 0.20;

                geminiData = {
                    totalTokens,
                    estimatedCost: Number(estimatedCost.toFixed(4))
                };
            }
        } catch (e) {
            console.error('Failed to fetch Gemini live stats:', e);
        }

        return {
            twilio: twilioData,
            sendgrid: sendgridData,
            gemini: geminiData
        };
    },

    /**
     * Fetch the list of historical billing months available
     */
    async getHistoricalMonths(limitCount = 12): Promise<string[]> {
        try {
            const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore');
            const historyRef = collection(db, 'billing_history');
            const q = query(historyRef, orderBy('month', 'desc'), limit(limitCount));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.id);
        } catch (e) {
            console.error('Failed to fetch historical months:', e);
            return [];
        }
    },

    /**
     * Fetch the daily breakdown for a specific month
     */
    async getDailyBreakdown(monthKey: string): Promise<any[]> {
        try {
            const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
            const dailyRef = collection(db, 'billing_history', monthKey, 'daily_costs');
            const q = query(dailyRef, orderBy('date', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (e) {
            console.error(`Failed to fetch daily breakdown for ${monthKey}:`, e);
            return [];
        }
    },

    /**
     * Fetch the summary totals for a specific month
     */
    async getMonthSummary(monthKey: string): Promise<any | null> {
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const monthDoc = await getDoc(doc(db, 'billing_history', monthKey));
            if (monthDoc.exists()) {
                return monthDoc.data();
            }
            return null;
        } catch (e) {
            console.error(`Failed to fetch month summary for ${monthKey}:`, e);
            return null;
        }
    }
};
