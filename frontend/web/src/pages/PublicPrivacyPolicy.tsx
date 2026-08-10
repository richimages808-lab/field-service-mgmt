import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, Lock, Smartphone, FileText, CheckCircle, Mail } from 'lucide-react';

export const PublicPrivacyPolicy: React.FC = () => {
    const lastUpdated = "July 31, 2026";

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="flex items-center gap-2 text-blue-600 font-bold text-xl hover:opacity-90">
                            <Shield className="w-7 h-7" />
                            <span>DispatchBox</span>
                        </Link>
                    </div>
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to App
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-10">
                    <div className="border-b border-gray-200 pb-6 mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
                            Legal & Transparency
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">Privacy Policy</h1>
                        <p className="text-sm text-gray-500 mt-2">Effective Date: {lastUpdated}</p>
                    </div>

                    {/* Carrier SMS Compliance Callout */}
                    <div className="bg-blue-50/70 border-2 border-blue-200 rounded-xl p-5 mb-8 text-blue-950">
                        <div className="flex items-start gap-3">
                            <Smartphone className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="font-bold text-lg text-blue-900 mb-1">Mobile Information & SMS Messaging Non-Sharing Commitment</h3>
                                <p className="text-sm leading-relaxed text-blue-900 font-medium">
                                    No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="prose prose-blue max-w-none space-y-8 text-gray-700 leading-relaxed">
                        {/* Section 1 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-3">
                                <Lock className="w-5 h-5 text-blue-600" />
                                1. Information We Collect
                            </h2>
                            <p>
                                At DispatchBox, we collect personal information necessary to deliver field service management software, schedule technicians, process estimates and invoices, and send customer notifications.
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-3 text-sm">
                                <li><strong>Account & Contact Information:</strong> Name, business name, physical address, email address, and phone number.</li>
                                <li><strong>Customer & Dispatch Data:</strong> Service addresses, work order details, job notes, and appointment schedules.</li>
                                <li><strong>Mobile Phone Numbers & Communication Preferences:</strong> Phone numbers provided during account registration, service booking, or portal opt-in for transactional SMS alerts.</li>
                                <li><strong>Usage & Technical Data:</strong> IP addresses, device identifiers, and platform navigation metrics.</li>
                            </ul>
                        </section>

                        {/* Section 2 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-3">
                                <Smartphone className="w-5 h-5 text-blue-600" />
                                2. How We Use Mobile Data & Text Messaging
                            </h2>
                            <p>
                                Mobile phone numbers and text messaging opt-in consent collected by DispatchBox are strictly used to send transactional and account-related notifications, including:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 mt-3 text-sm">
                                <li>Technician dispatch alerts and estimated arrival time updates.</li>
                                <li>Appointment scheduling confirmations and reminders.</li>
                                <li>Quote approval notifications and invoice links.</li>
                                <li>Customer service responses and system maintenance updates.</li>
                            </ul>
                            <p className="mt-4 font-semibold text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                🔒 Text messaging originator opt-in data and consent are strictly confidential and will never be sold, rented, leased, or disclosed to third parties, data brokers, or affiliates for marketing or promotional purposes under any circumstances.
                            </p>
                        </section>

                        {/* Section 3 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-3">
                                <FileText className="w-5 h-5 text-blue-600" />
                                3. Information Sharing and Disclosure
                            </h2>
                            <p>
                                We do not sell, rent, or trade your personal information. We only share information with trustworthy service providers necessary to run our service (such as cloud hosting and infrastructure providers), subject to strict legal confidentiality agreements.
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                                We may disclose information if required to do so by law, regulation, or court order, or to protect the rights, property, and safety of DispatchBox, our users, or the public.
                            </p>
                        </section>

                        {/* Section 4 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-3">
                                <CheckCircle className="w-5 h-5 text-blue-600" />
                                4. Data Protection & Security
                            </h2>
                            <p>
                                We enforce strict technical and organizational security controls to protect your data against unauthorized access, loss, or misuse. All data transmissions are encrypted using SSL/TLS, and database access is governed by strict role-based authorization rules.
                            </p>
                        </section>

                        {/* Section 5 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-3">
                                <Mail className="w-5 h-5 text-blue-600" />
                                5. Your Privacy Rights & Contact Info
                            </h2>
                            <p>
                                You have the right to access, update, export, or request deletion of your personal data at any time. You can also withdraw consent for text communications by replying <strong>STOP</strong> to any SMS message received from our system.
                            </p>
                            <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-200 text-sm">
                                <p className="font-semibold text-gray-900">Questions or Data Privacy Requests?</p>
                                <p className="text-gray-600 mt-1">DispatchBox Compliance & Legal Team</p>
                                <p className="text-gray-600">Email: <a href="mailto:support@dispatchbox.com" className="text-blue-600 underline">support@dispatchbox.com</a></p>
                            </div>
                        </section>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 py-6">
                <div className="max-w-6xl mx-auto px-4 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p>&copy; {new Date().getFullYear()} DispatchBox. All rights reserved.</p>
                    <div className="flex gap-4">
                        <Link to="/privacy" className="text-blue-600 font-semibold underline">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-gray-700">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};
