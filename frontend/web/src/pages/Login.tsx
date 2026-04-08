import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate, Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import techIllustration from '../assets/tech-illustration.png';
import { SupportChatBot } from '../components/SupportChatBot';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const { login, user } = useAuth();
    const navigate = useNavigate();

    // Auto-redirect if logged in
    useEffect(() => {
        if (user) {
            navigate('/');
        }
    }, [user, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError('Login failed. Check credentials.');
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError('Please enter your email address first.');
            return;
        }

        setIsResetting(true);
        setError('');
        setSuccess('');

        try {
            await sendPasswordResetEmail(auth, email);
            setSuccess('Password reset email sent! Check your inbox.');
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                setError('No account found with this email.');
            } else {
                setError('Failed to send reset email. Try again.');
            }
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white rounded-lg shadow-xl overflow-hidden flex max-w-4xl w-full">
                <div className="hidden md:block w-1/2 bg-blue-600 p-8 flex flex-col justify-center items-center text-white">
                    <h1 className="text-4xl font-bold mb-4">DispatchBox</h1>
                    <p className="text-lg mb-8 text-center">Manage your field operations with ease.</p>
                    <img src={techIllustration} alt="Field Technician" className="max-w-xs" />
                </div>
                <div className="w-full md:w-1/2 p-8 md:p-12">
                    <h2 className="text-3xl font-bold mb-6 text-gray-800">Welcome Back</h2>
                    {error && <p className="text-red-500 mb-4 text-sm bg-red-50 p-2 rounded">{error}</p>}
                    {success && <p className="text-green-600 mb-4 text-sm bg-green-50 p-2 rounded">{success}</p>}
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-2 border rounded"
                                required
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-2 border rounded"
                                required
                            />
                        </div>
                        <div className="mb-6 text-right">
                            <button
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={isResetting}
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                                {isResetting ? 'Sending...' : 'Forgot Password?'}
                            </button>
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 transition"
                        >
                            Sign In
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                        <p className="text-gray-600 mb-3">Don't have an account?</p>
                        <Link
                            to="/signup"
                            className="inline-block w-full bg-gray-100 text-gray-700 p-3 rounded font-bold hover:bg-gray-200 transition"
                        >
                            Create Account
                        </Link>
                    </div>
                </div>
            </div>
            <SupportChatBot />
        </div>
    );
};
