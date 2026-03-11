import React, { useEffect } from 'react';
import { seedData } from '../lib/seeding';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export const SeedPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    useEffect(() => {
        const run = async () => {
            // if (!user) return; // Allow seeding even if not logged in (for demo)
            try {
                await seedData(user?.uid || 'demo-admin-id');
                // navigate('/'); // Don't redirect immediately so they see the message
            } catch (e) {
                console.error(e);
            }
        };
        run();
    }, [user]);
    return (
        <div className="p-8 text-xl">
            <h1 className="font-bold mb-4">Seeding Data...</h1>
            <p>Creating technicians, jobs, and invoices.</p>
            <p className="text-sm text-gray-500 mt-2">If this takes longer than 5 seconds, check the console.</p>
            <button
                onClick={() => navigate('/')}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
                Go to Dashboard
            </button>
        </div>
    );
};
