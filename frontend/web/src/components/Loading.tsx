import React from 'react';
import { Loader2 } from 'lucide-react';

export const Loading: React.FC = () => {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-50">
            <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Loading...</p>
            </div>
        </div>
    );
};
