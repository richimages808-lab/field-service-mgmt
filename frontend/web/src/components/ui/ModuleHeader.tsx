import React from 'react';

export interface ModuleHeaderProps {
    icon: React.ReactNode | React.ElementType;
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
    badgeVariant?: 'blue' | 'amber' | 'emerald' | 'purple';
    actions?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    iconGradient?: string;
}

const BADGE_STYLES: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({
    icon,
    title,
    subtitle,
    badge,
    badgeVariant = 'blue',
    actions,
    children,
    className = '',
    iconGradient = 'bg-gradient-to-br from-blue-600 to-indigo-600',
}) => {
    const renderIcon = () => {
        if (!icon) return null;
        if (React.isValidElement(icon)) return icon;
        if (typeof icon === 'function' || typeof icon === 'object') {
            const IconComponent = icon as React.ElementType;
            return <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />;
        }
        return icon as React.ReactNode;
    };

    return (
        <div className={`space-y-3 pb-3 border-b border-slate-200/80 mb-5 ${className}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2 sm:p-2.5 ${iconGradient} text-white rounded-xl shadow-xs flex-shrink-0 flex items-center justify-center`}>
                        {renderIcon()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                                {title}
                            </h1>
                            {badge && (
                                typeof badge === 'string' ? (
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${BADGE_STYLES[badgeVariant] || BADGE_STYLES.blue}`}>
                                        {badge}
                                    </span>
                                ) : (
                                    badge
                                )
                            )}
                        </div>
                        {subtitle && (
                            <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>

                {actions && (
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {actions}
                    </div>
                )}
            </div>

            {children && (
                <div className="pt-1">
                    {children}
                </div>
            )}
        </div>
    );
};
