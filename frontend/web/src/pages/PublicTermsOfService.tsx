import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, MessageSquare, CheckSquare, AlertCircle, HelpCircle, PhoneOff } from 'lucide-react';

export const PublicTermsOfService: React.FC = () => {
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
                    <div className="flex items-center gap-4">
                        <Link
                            to="/contact"
                            className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors hidden sm:inline"
                        >
                            Contact & Book
                        </Link>
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to App
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-10">
                    <div className="border-b border-gray-200 pb-6 mb-8">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
                            Terms & Conditions
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">Terms of Service</h1>
                        <p className="text-sm text-gray-500 mt-2">Last Modified: {lastUpdated}</p>
                    </div>

                    <div className="prose prose-blue max-w-none space-y-8 text-gray-700 leading-relaxed">
                        {/* Section 1 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
                            <p>
                                Welcome to DispatchBox ("Company", "we", "us", or "our"). By creating an account, accessing, or using our field service management application, customer portal, or messaging features, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not access or use our services.
                            </p>
                        </section>

                        {/* Section 2 — SMS Terms & Conditions (Crucial for Twilio A2P 10DLC) */}
                        <section className="bg-gray-50 rounded-2xl p-6 border-2 border-emerald-200 space-y-4">
                            <h2 className="text-xl font-bold text-emerald-950 flex items-center gap-2 border-b border-emerald-200 pb-3">
                                <MessageSquare className="w-6 h-6 text-emerald-600" />
                                2. SMS / Mobile Messaging Terms & Conditions
                            </h2>
                            <p className="text-sm text-gray-800">
                                DispatchBox provides automated transactional text messaging services for field service businesses and their customers. By opting into our SMS messaging service (via account signup, quote acceptance, web forms, or customer portal), you agree to the following terms:
                            </p>

                            <div className="space-y-3 text-sm">
                                <div className="flex items-start gap-2.5">
                                    <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Program Name & Purpose:</strong> <em>DispatchBox Service Notifications</em>. Text messages are sent to provide appointment reminders, technician ETA alerts, quote approvals, invoice notifications, and customer support communications.
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <CheckSquare className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Opt-In Consent:</strong> You opt-in to receive SMS notifications by checking the consent box during registration or service request, or by providing your mobile number to a participating service provider powered by DispatchBox.
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <PhoneOff className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Cancellation / Opt-Out Instructions:</strong> You can cancel the SMS service at any time. Text <strong>STOP</strong> to any text message you receive from us. After sending <strong>STOP</strong>, we will send an SMS to confirm that you have been unsubscribed. After this, you will no longer receive text messages from that number.
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <HelpCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Help & Customer Support:</strong> If you experience issues with our messaging program, reply with the keyword <strong>HELP</strong> for assistance, or contact our support team directly at <a href="mailto:support@dispatchbox.com" className="text-emerald-700 underline">support@dispatchbox.com</a>.
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <AlertCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Rates & Frequency:</strong> Message and data rates may apply for any messages sent to you from us and to us from you. Message frequency varies depending on your service requests and account activity.
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Strict Mobile Data Non-Sharing Policy:</strong> Mobile information and text messaging originator opt-in data will <strong>NOT</strong> be sold, rented, leased, or shared with third parties or affiliates for marketing or promotional purposes.
                                    </div>
                                </div>

                                <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                                    <em>Carriers are not liable for delayed or undelivered messages.</em>
                                </div>
                            </div>
                        </section>

                        {/* Section 3 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Account Responsibilities & Authorized Use</h2>
                            <p>
                                Users are responsible for maintaining the security of their account credentials. You agree not to use the service for illegal activities, spamming, sending unsolicited commercial communications, or transmitting content that violates third-party rights or carrier regulations.
                            </p>
                        </section>

                        {/* Section 4 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Limitation of Liability</h2>
                            <p>
                                To the maximum extent permitted by applicable law, DispatchBox shall not be liable for indirect, incidental, special, consequential, or punitive damages resulting from your access to or use of, or inability to access or use, the service.
                            </p>
                        </section>

                        {/* Section 5 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Modifications to Terms</h2>
                            <p>
                                We reserve the right to modify these terms at any time. Updated terms will be posted on this page with a revised effective date. Your continued use of the service after changes take effect constitutes acceptance of the modified terms.
                            </p>
                        </section>

                        {/* Section 6 */}
                        <section>
                            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Contact Information</h2>
                            <p>
                                For questions regarding these Terms of Service or SMS program compliance, please email <a href="mailto:support@dispatchbox.com" className="text-blue-600 underline">support@dispatchbox.com</a>.
                            </p>
                        </section>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 py-6">
                <div className="max-w-6xl mx-auto px-4 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p>&copy; {new Date().getFullYear()} DispatchBox. All rights reserved.</p>
                    <div className="flex gap-4">
                        <Link to="/contact" className="hover:text-gray-700">Contact & Book</Link>
                        <Link to="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
                        <Link to="/terms" className="text-blue-600 font-semibold underline">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};
