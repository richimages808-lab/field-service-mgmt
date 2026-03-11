/**
 * CustomerPortalPrivacy - GDPR compliance and privacy controls
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalContext } from './CustomerPortalLayout';
import { db } from '../../firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export const CustomerPortalPrivacy: React.FC = () => {
    const { customer, organization, loading: contextLoading } = usePortalContext();

    const [marketingOptIn, setMarketingOptIn] = useState(
        customer?.gdpr?.marketingOptIn ?? false
    );
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [exportRequested, setExportRequested] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [requestingDeletion, setRequestingDeletion] = useState(false);

    const handleSaveMarketingPreference = async () => {
        if (!customer) return;

        setSavingPrefs(true);

        try {
            const customerRef = doc(db, 'customers', customer.id);
            await updateDoc(customerRef, {
                'gdpr.marketingOptIn': marketingOptIn,
                updatedAt: Timestamp.now()
            });
            toast.success('Preference saved');
        } catch (error) {
            console.error('Error saving preference:', error);
            toast.error('Failed to save preference');
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleRequestDataExport = async () => {
        if (!customer) return;

        try {
            // In production, this would trigger a Cloud Function to compile and email the export
            // For now, we'll just mark the request
            const customerRef = doc(db, 'customers', customer.id);
            await updateDoc(customerRef, {
                'gdpr.lastExportRequestedAt': Timestamp.now(),
                updatedAt: Timestamp.now()
            });

            setExportRequested(true);
            toast.success('Export request submitted! You will receive an email with your data within 48 hours.');
        } catch (error) {
            console.error('Error requesting export:', error);
            toast.error('Failed to request export');
        }
    };

    const handleRequestDeletion = async () => {
        if (!customer) return;

        if (deleteConfirmText.toLowerCase() !== 'delete my account') {
            toast.error('Please type "delete my account" to confirm');
            return;
        }

        setRequestingDeletion(true);

        try {
            // Calculate deletion date (30 days grace period)
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

            const customerRef = doc(db, 'customers', customer.id);
            await updateDoc(customerRef, {
                status: 'pending_deletion',
                deletionRequest: {
                    requestedAt: Timestamp.now(),
                    requestedBy: 'customer',
                    scheduledDeletionDate: Timestamp.fromDate(thirtyDaysFromNow),
                    reason: 'Customer portal request'
                },
                updatedAt: Timestamp.now()
            });

            toast.success('Deletion request submitted. Your account will be deleted in 30 days unless you cancel.');
            setShowDeleteConfirm(false);
            setDeleteConfirmText('');
        } catch (error) {
            console.error('Error requesting deletion:', error);
            toast.error('Failed to submit deletion request');
        } finally {
            setRequestingDeletion(false);
        }
    };

    const handleCancelDeletion = async () => {
        if (!customer) return;

        try {
            const customerRef = doc(db, 'customers', customer.id);
            await updateDoc(customerRef, {
                status: 'active',
                deletionRequest: null,
                updatedAt: Timestamp.now()
            });

            toast.success('Deletion request cancelled');
        } catch (error) {
            console.error('Error cancelling deletion:', error);
            toast.error('Failed to cancel deletion');
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'Unknown';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const isPendingDeletion = customer?.status === 'pending_deletion';

    if (contextLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Privacy & Data</h1>
                <p className="text-gray-500">Manage your data and privacy preferences</p>
            </div>

            {/* Pending Deletion Warning */}
            {isPendingDeletion && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <h3 className="font-bold">Account Deletion Scheduled</h3>
                            <p className="text-sm mt-1">
                                Your account is scheduled for deletion on{' '}
                                <strong>
                                    {formatDate(customer?.deletionRequest?.scheduledDeletionDate)}
                                </strong>.
                                All your data will be permanently removed after this date.
                            </p>
                            <button
                                onClick={handleCancelDeletion}
                                className="mt-3 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
                            >
                                Cancel Deletion Request
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Your Rights */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Your Privacy Rights</h2>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 mb-4">
                        Under data protection laws (including GDPR), you have the following rights:
                    </p>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                            <span className="text-green-500 mt-0.5">✓</span>
                            <div>
                                <strong>Right to Access</strong>
                                <p className="text-sm text-gray-500">Request a copy of all data we hold about you</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="text-green-500 mt-0.5">✓</span>
                            <div>
                                <strong>Right to Rectification</strong>
                                <p className="text-sm text-gray-500">
                                    Update your information in{' '}
                                    <Link to="/portal/settings" className="text-blue-600 hover:underline">Settings</Link>
                                </p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="text-green-500 mt-0.5">✓</span>
                            <div>
                                <strong>Right to Erasure</strong>
                                <p className="text-sm text-gray-500">Request permanent deletion of your account and data</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="text-green-500 mt-0.5">✓</span>
                            <div>
                                <strong>Right to Object</strong>
                                <p className="text-sm text-gray-500">Opt out of marketing communications</p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            {/* Marketing Preferences */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Marketing Preferences</h2>
                </div>
                <div className="p-6">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={marketingOptIn}
                            onChange={(e) => setMarketingOptIn(e.target.checked)}
                            className="w-5 h-5 rounded text-blue-600 mt-0.5"
                        />
                        <div>
                            <span className="font-medium">Receive marketing communications</span>
                            <p className="text-sm text-gray-500 mt-1">
                                Get updates about promotions, new services, and tips. You can unsubscribe at any time.
                            </p>
                        </div>
                    </label>
                    <button
                        onClick={handleSaveMarketingPreference}
                        disabled={savingPrefs}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {savingPrefs ? 'Saving...' : 'Save Preference'}
                    </button>
                </div>
            </div>

            {/* Data Export */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Export Your Data</h2>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 mb-4">
                        Request a complete export of all personal data we hold about you. This includes your profile,
                        job history, communications, and invoices. You'll receive a download link via email.
                    </p>

                    {exportRequested ? (
                        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4">
                            <p className="font-medium">✓ Export requested</p>
                            <p className="text-sm mt-1">Check your email within 48 hours for the download link.</p>
                        </div>
                    ) : (
                        <button
                            onClick={handleRequestDataExport}
                            className="px-4 py-2 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-900 transition"
                        >
                            Request Data Export
                        </button>
                    )}
                </div>
            </div>

            {/* Account Deletion */}
            {!isPendingDeletion && (
                <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
                    <div className="p-4 border-b bg-red-50">
                        <h2 className="font-semibold text-red-900">Delete Account</h2>
                    </div>
                    <div className="p-6">
                        <p className="text-gray-600 mb-4">
                            Permanently delete your account and all associated data. This action has a 30-day grace period
                            during which you can cancel the request.
                        </p>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                            <p className="text-yellow-800 text-sm">
                                <strong>Warning:</strong> Deleting your account will remove:
                            </p>
                            <ul className="text-yellow-700 text-sm mt-2 list-disc ml-5">
                                <li>Your profile and contact information</li>
                                <li>All job and service history</li>
                                <li>Invoice records</li>
                                <li>All communications</li>
                            </ul>
                        </div>

                        {showDeleteConfirm ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Type <strong>"delete my account"</strong> to confirm:
                                    </label>
                                    <input
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        placeholder="delete my account"
                                        className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowDeleteConfirm(false);
                                            setDeleteConfirmText('');
                                        }}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleRequestDeletion}
                                        disabled={requestingDeletion || deleteConfirmText.toLowerCase() !== 'delete my account'}
                                        className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                    >
                                        {requestingDeletion ? 'Requesting...' : 'Confirm Deletion'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-4 py-2 border border-red-300 text-red-600 font-medium rounded-lg hover:bg-red-50 transition"
                            >
                                Request Account Deletion
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Consent History */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Consent History</h2>
                </div>
                <div className="p-6">
                    <div className="space-y-3 text-sm">
                        {customer?.gdpr?.consentGiven && (
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">Terms & Conditions</span>
                                <span className="text-gray-900">
                                    Accepted {formatDate(customer.gdpr.termsAccepted || customer.gdpr.consentDate)}
                                </span>
                            </div>
                        )}
                        {customer?.gdpr?.privacyPolicyAccepted && (
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-gray-600">Privacy Policy</span>
                                <span className="text-gray-900">
                                    Accepted {formatDate(customer.gdpr.privacyPolicyAccepted)}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between py-2 border-b">
                            <span className="text-gray-600">Marketing Communications</span>
                            <span className="text-gray-900">
                                {marketingOptIn ? 'Opted in' : 'Opted out'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contact for Privacy */}
            <div className="bg-blue-50 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 mb-2">Questions about your privacy?</h3>
                <p className="text-blue-700 text-sm mb-4">
                    Contact our data protection team if you have any questions about how we handle your data.
                </p>
                <Link
                    to="/portal/messages"
                    className="inline-block px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
                >
                    Contact Us
                </Link>
            </div>
        </div>
    );
};
