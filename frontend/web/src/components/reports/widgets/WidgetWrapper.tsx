import React from 'react';
import { Settings, X, GripHorizontal } from 'lucide-react';

interface WidgetWrapperProps {
    title: string;
    onRemove?: () => void;
    children: React.ReactNode;
    isEditMode: boolean;
    className?: string; // Add className prop
}

export const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
    title,
    onRemove,
    children,
    isEditMode,
    className = "" // Default to empty string
}) => {
    return (
        <div className={`bg-white rounded-lg border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden ${className}`}>
            {/* Widget Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 ${isEditMode ? 'cursor-move drag-handle transition-colors hover:bg-gray-100' : ''}`}>
                <div className="flex items-center gap-2">
                    {isEditMode && <GripHorizontal className="w-4 h-4 text-gray-400" />}
                    <h3 className="font-medium text-gray-900 text-sm">{title}</h3>
                </div>

                {isEditMode && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); /* Optional settings handler later */ }}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200 transition-colors"
                            title="Widget Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        {onRemove && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                title="Remove Widget"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Widget Content */}
            <div className="flex-1 p-4 overflow-auto">
                {children}
            </div>
        </div>
    );
};
