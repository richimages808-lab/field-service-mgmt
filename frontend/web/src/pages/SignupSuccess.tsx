import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Mail, ArrowRight } from 'lucide-react';

export const SignupSuccess: React.FC = () => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-amber-900 to-blue-800 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-lg w-full text-center p-8 md:p-12">
                {/* Success Icon */}
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={48} className="text-green-500" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                    Account Created!
                </h1>

                <p className="text-gray-600 mb-8">
                    Your DispatchBox account has been created successfully.
                </p>

                {/* Email Verification Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <Mail className="text-blue-600" size={24} />
                        <h3 className="font-semibold text-blue-900">Verify Your Email</h3>
                    </div>
                    <p className="text-sm text-blue-700">
                        We've sent a verification email to your inbox.
                        Please click the link in the email to activate your account.
                    </p>
                </div>

                {/* Next Steps */}
                <div className="text-left bg-gray-50 rounded-xl p-6 mb-8">
                    <h3 className="font-semibold text-gray-900 mb-4">What's Next?</h3>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                            <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                                1
                            </div>
                            <span className="text-gray-600">
                                Check your email and click the verification link
                            </span>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                                2
                            </div>
                            <span className="text-gray-600">
                                Sign in to access your dashboard
                            </span>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                                3
                            </div>
                            <span className="text-gray-600">
                                Start adding customers and creating jobs
                            </span>
                        </li>
                    </ul>
                </div>

                {/* CTA Button */}
                <Link
                    to="/login"
                    className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:bg-blue-700 transition"
                >
                    Go to Sign In
                    <ArrowRight size={20} />
                </Link>

                <p className="text-sm text-gray-500 mt-6">
                    Didn't receive the email? Check your spam folder or{' '}
                    <button className="text-blue-600 hover:underline">
                        resend verification email
                    </button>
                </p>
            </div>
        </div>
    );
};
