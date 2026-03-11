/**
 * CustomerPortalSettings - Customer profile and preferences settings
 */

import React, { useState, useEffect } from 'react';
import { usePortalContext } from './CustomerPortalLayout';
import { db, auth } from '../../firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import toast from 'react-hot-toast';

export const CustomerPortalSettings: React.FC = () => {
    const { customer, organization, loading: contextLoading } = usePortalContext();

    // Profile form state
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [alternatePhone, setAlternatePhone] = useState('');

    // Preferences state
    const [contactMethod, setContactMethod] = useState<'phone' | 'email' | 'sms'>('email');
    const [language, setLanguage] = useState<string>('en');
    const [reminderEnabled, setReminderEnabled] = useState(true);
    const [reminderMethod, setReminderMethod] = useState<'email' | 'sms' | 'both'>('email');
    const [reminderHours, setReminderHours] = useState(24);

    // Password change
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [saving, setSaving] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    // Initialize form with customer data
    useEffect(() => {
        if (customer) {
            setName(customer.name || '');
            setEmail(customer.email || '');
            setPhone(customer.phone || '');
            setAlternatePhone(customer.alternatePhone || '');
            setContactMethod(customer.preferences?.contactMethod || 'email');
            setLanguage(customer.preferences?.language || 'en');
            setReminderEnabled(customer.preferences?.reminderPreferences?.enabled ?? true);
            setReminderMethod(customer.preferences?.reminderPreferences?.method || 'email');
            setReminderHours(customer.preferences?.reminderPreferences?.advanceHours || 24);
        }
    }, [customer]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!customer) return;

        setSaving(true);

        try {
            const customerRef = doc(db, 'customers', customer.id);
            await updateDoc(customerRef, {
                name,
                phone,
                alternatePhone: alternatePhone || null,
                'preferences.contactMethod': contactMethod,
                'preferences.language': language,
                'preferences.reminderPreferences': {
                    enabled: reminderEnabled,
                    method: reminderMethod,
                    advanceHours: reminderHours
                },
                updatedAt: Timestamp.now()
            });

            toast.success('Settings saved successfully!');
        } catch (error) {
            console.error('Error saving settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        const user = auth.currentUser;
        if (!user || !user.email) {
            toast.error('No user logged in');
            return;
        }

        setChangingPassword(true);

        try {
            // Re-authenticate user
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // Update password
            await updatePassword(user, newPassword);

            toast.success('Password changed successfully!');
            setShowPasswordChange(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error('Error changing password:', error);
            if (error.code === 'auth/wrong-password') {
                toast.error('Current password is incorrect');
            } else {
                toast.error('Failed to change password');
            }
        } finally {
            setChangingPassword(false);
        }
    };

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
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-500">Manage your profile and preferences</p>
            </div>

            {/* Profile Settings */}
            <form onSubmit={handleSaveProfile} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Profile Information</h2>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                disabled
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed"
                            />
                            <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Alternate Phone
                            </label>
                            <input
                                type="tel"
                                value={alternatePhone}
                                onChange={(e) => setAlternatePhone(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Contact Preferences</h2>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Preferred Contact Method
                        </label>
                        <div className="flex gap-4">
                            {(['email', 'phone', 'sms'] as const).map((method) => (
                                <label key={method} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="contactMethod"
                                        value={method}
                                        checked={contactMethod === method}
                                        onChange={() => setContactMethod(method)}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="capitalize">{method}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Language
                        </label>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                        </select>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Appointment Reminders</h2>
                </div>
                <div className="p-6 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={reminderEnabled}
                            onChange={(e) => setReminderEnabled(e.target.checked)}
                            className="w-5 h-5 rounded text-blue-600"
                        />
                        <span className="font-medium">Send appointment reminders</span>
                    </label>

                    {reminderEnabled && (
                        <div className="ml-8 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Reminder Method
                                </label>
                                <div className="flex gap-4">
                                    {(['email', 'sms', 'both'] as const).map((method) => (
                                        <label key={method} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="reminderMethod"
                                                value={method}
                                                checked={reminderMethod === method}
                                                onChange={() => setReminderMethod(method)}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="capitalize">{method === 'both' ? 'Both' : method.toUpperCase()}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Remind me
                                </label>
                                <select
                                    value={reminderHours}
                                    onChange={(e) => setReminderHours(Number(e.target.value))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value={1}>1 hour before</option>
                                    <option value={2}>2 hours before</option>
                                    <option value={4}>4 hours before</option>
                                    <option value={24}>1 day before</option>
                                    <option value={48}>2 days before</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>

            {/* Password Change */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-900">Password</h2>
                    {!showPasswordChange && (
                        <button
                            onClick={() => setShowPasswordChange(true)}
                            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                        >
                            Change Password
                        </button>
                    )}
                </div>

                {showPasswordChange ? (
                    <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Current Password
                            </label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                New Password
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                                minLength={8}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Confirm New Password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowPasswordChange(false);
                                    setCurrentPassword('');
                                    setNewPassword('');
                                    setConfirmPassword('');
                                }}
                                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={changingPassword}
                                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                                {changingPassword ? 'Changing...' : 'Change Password'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="p-6">
                        <p className="text-gray-500 text-sm">
                            Password last changed: Unknown
                        </p>
                    </div>
                )}
            </div>

            {/* Account Info */}
            <div className="bg-gray-50 rounded-xl p-6 text-sm text-gray-600">
                <p>
                    <strong>Account created:</strong>{' '}
                    {customer?.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                </p>
                <p>
                    <strong>Organization:</strong> {organization?.name || 'Unknown'}
                </p>
            </div>
        </div>
    );
};
