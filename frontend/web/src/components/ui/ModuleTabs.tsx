import React from 'react';

export interface TabItem {
    id: string;
    label: string;
    count?: number;
    icon?: React.ReactNode | React.ElementType;
    badgeColor?: 'blue' | 'amber' | 'emerald' | 'red' | 'gray';
}

export interface ModuleTabsProps {
    tabs: TabItem[];
    activeTab: string;
    onChange: (id: string) => void;
    variant?: 'segmented' | 'underline';
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

const BADGE_COLORS: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    red: 'bg-rose-100 text-rose-700',
    gray: 'bg-slate-200 text-slate-700',
};

export const ModuleTabs: React.FC<ModuleTabsProps> = ({
    tabs,
    activeTab,
    onChange,
    variant = 'segmented',
    className = '',
    size = 'md',
}) => {
    const renderIcon = (icon?: React.ReactNode | React.ElementType) => {
        if (!icon) return null;
        if (React.isValidElement(icon)) return icon;
        if (typeof icon === 'function' || typeof icon === 'object') {
            const IconComponent = icon as React.ElementType;
            return <IconComponent className="w-3.5 h-3.5" />;
        }
        return icon as React.ReactNode;
    };

    if (variant === 'underline') {
        return (
            <div className={`flex items-center gap-1 border-b border-slate-200 overflow-x-auto ${className}`}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const badgeClass = BADGE_COLORS[tab.badgeColor || (isActive ? 'blue' : 'gray')];
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                                isActive
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                            }`}
                        >
                            {tab.icon && <span className="w-4 h-4 flex items-center justify-center">{renderIcon(tab.icon)}</span>}
                            <span>{tab.label}</span>
                            {typeof tab.count === 'number' && (
                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${badgeClass}`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        );
    }

    // Default: segmented pill control
    return (
        <div className={`inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 gap-1 overflow-x-auto max-w-full ${className}`}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const badgeClass = BADGE_COLORS[tab.badgeColor || (isActive ? 'blue' : 'gray')];
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                            isActive
                                ? 'bg-white text-blue-600 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                        }`}
                    >
                        {tab.icon && <span className="w-3.5 h-3.5 flex items-center justify-center">{renderIcon(tab.icon)}</span>}
                        <span>{tab.label}</span>
                        {typeof tab.count === 'number' && (
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${badgeClass}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
