import React from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { TECH_VIEW_OPTIONS, TechDashboardViewId } from './shared';

interface TechViewSwitcherProps {
    currentView: TechDashboardViewId;
    onViewChange: (view: TechDashboardViewId) => void;
    userId?: string; // If provided, persists to Firestore
}

export const TechViewSwitcher: React.FC<TechViewSwitcherProps> = ({ currentView, onViewChange, userId }) => {
    const handleSwitch = async (viewId: TechDashboardViewId) => {
        onViewChange(viewId);

        // Persist to Firestore user preferences
        if (userId) {
            try {
                const userRef = doc(db, 'users', userId);
                await updateDoc(userRef, {
                    'preferences.dashboardView': viewId
                });
            } catch (err) {
                console.warn('Failed to persist view preference:', err);
            }
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border p-1 flex gap-0.5 overflow-x-auto">
            {TECH_VIEW_OPTIONS.map(option => {
                const Icon = option.icon;
                const isActive = currentView === option.id;

                return (
                    <button
                        key={option.id}
                        onClick={() => handleSwitch(option.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                            isActive
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        title={option.description}
                    >
                        <span className="text-sm">{option.emoji}</span>
                        <Icon className="w-4 h-4" />
                        <span className="hidden lg:inline">{option.shortLabel}</span>
                    </button>
                );
            })}
        </div>
    );
};
