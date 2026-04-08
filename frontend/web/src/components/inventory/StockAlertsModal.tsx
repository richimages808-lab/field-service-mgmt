import React, { useState, useEffect } from 'react';
import { X, Bell, Mail, Clock, ShieldCheck, Plus } from 'lucide-react';
import { db } from '../../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthProvider';
import { toast } from 'react-hot-toast';
import { ScheduleReportModal } from '../reports/ScheduleReportModal';

interface StockAlertsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const StockAlertsModal: React.FC<StockAlertsModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Immediate Alerts State
    const [immediateEnabled, setImmediateEnabled] = useState(false);
    const [alertEmail, setAlertEmail] = useState('');
    
    // Schedule Modal State
    const [showScheduleModal, setShowScheduleModal] = useState(false);

    useEffect(() => {
        if (!isOpen || !user?.uid) return;

        const loadSettings = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const settings = data.inventorySettings || {};
                    setImmediateEnabled(settings.immediateAlertsEnabled || false);
                    setAlertEmail(settings.alertEmail || user.email || '');
                }
            } catch (error) {
                console.error("Error loading settings:", error);
                toast.error("Failed to load alert settings.");
            } finally {
                setLoading(false);
            }
        };

        loadSettings();
    }, [isOpen, user]);

    const handleSave = async () => {
        if (!user?.uid) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'users', user.uid);
            await updateDoc(docRef, {
                inventorySettings: {
                    immediateAlertsEnabled: immediateEnabled,
                    alertEmail: alertEmail
                }
            });
            toast.success("Stock alert settings saved successfully!");
            onClose();
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error("Failed to save alert settings.");
        } finally {
            setSaving(false);
        }
    };
    
    const handleCreateDigest = () => {
        setShowScheduleModal(true);
    };

    if (!isOpen) return null;

    return (
        <>
            {showScheduleModal ? (
                <ScheduleReportModal
                    defaultReportType="inventory_alerts"
                    onClose={() => setShowScheduleModal(false)}
                />
            ) : (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <Bell className="w-5 h-5 text-blue-600" />
                                <h2 className="text-xl font-semibold text-gray-900">Stock Alerts Configuration</h2>
                            </div>
                            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {/* Immediate Alerts Section */}
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                            <Mail className="w-5 h-5 text-gray-400" />
                                            Immediate Push Alerts
                                        </h3>
                                        
                                        <label className="flex items-start gap-3 cursor-pointer mb-4 hover:bg-gray-50 p-2 rounded-lg transition-colors">
                                            <div className="flex items-center h-5 mt-1">
                                                <input
                                                    type="checkbox"
                                                    checked={immediateEnabled}
                                                    onChange={(e) => setImmediateEnabled(e.target.checked)}
                                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900">Email instantly on low stock</p>
                                                <p className="text-sm text-gray-500">
                                                    We'll send you an immediate alert the exact moment an item's quantity drops below its minimum threshold.
                                                </p>
                                            </div>
                                        </label>

                                        {immediateEnabled && (
                                            <div className="ml-7">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Destination Email Address
                                                </label>
                                                <input
                                                    type="email"
                                                    value={alertEmail}
                                                    onChange={(e) => setAlertEmail(e.target.value)}
                                                    placeholder="service@mycompany.com"
                                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <hr className="border-gray-100" />

                                    {/* Scheduled Digest Section */}
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2 flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-gray-400" />
                                            Scheduled Digest
                                        </h3>
                                        <p className="text-sm text-gray-500 mb-4">
                                            Prefer less noise? You can automatically generate a beautiful CSV/Excel report of all currently low stock items delivered to your inbox every week.
                                        </p>
                                        <button
                                            onClick={handleCreateDigest}
                                            disabled={saving}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-blue-600 font-medium rounded-lg border border-gray-200 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Open Job Schedule
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 bg-white border border-gray-300 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                                {saving ? (
                                    <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Saving...</>
                                ) : (
                                    <><ShieldCheck className="w-4 h-4" /> Save Settings</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
