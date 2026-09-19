import React, { createContext, useContext, useState, useEffect } from 'react';

export type LayoutMode = 'modern-hub' | 'streamlined' | 'compact-pro';

export interface LayoutPresetInfo {
    id: LayoutMode;
    name: string;
    tagline: string;
    description: string;
    badge: string;
    icon: 'LayoutGrid' | 'Rows' | 'Maximize2';
}

export const LAYOUT_PRESETS: Record<LayoutMode, LayoutPresetInfo> = {
    'modern-hub': {
        id: 'modern-hub',
        name: 'Modern Hub',
        tagline: 'Clean Modular Dock',
        description: 'Card-based enterprise layout with structured left navigation, balanced whitespace, and clear visual hierarchy.',
        badge: 'Default / Balanced',
        icon: 'LayoutGrid',
    },
    'streamlined': {
        id: 'streamlined',
        name: 'Streamlined Workspace',
        tagline: 'Horizontal Top-Bar',
        description: 'Maximizes screen width with a clean top app navigation ribbon and no left sidebar occlusion. Ideal for boards & maps.',
        badge: 'Max Width / Focus',
        icon: 'Rows',
    },
    'compact-pro': {
        id: 'compact-pro',
        name: 'Compact Pro Rail',
        tagline: 'High-Density Dispatch Rail',
        description: 'Slim 56px icon rail and compact command header for power dispatchers who need maximum data density.',
        badge: 'Dense Pro / Power',
        icon: 'Maximize2',
    },
};

interface LayoutModeContextType {
    layoutMode: LayoutMode;
    setLayoutMode: (mode: LayoutMode) => void;
    presetInfo: LayoutPresetInfo;
    presets: LayoutPresetInfo[];
}

const LayoutModeContext = createContext<LayoutModeContextType | undefined>(undefined);

const STORAGE_KEY = 'dispatchbox_layout_mode';

export const LayoutModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [layoutMode, setLayoutModeState] = useState<LayoutMode>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'modern-hub' || saved === 'streamlined' || saved === 'compact-pro') {
            return saved;
        }
        return 'modern-hub';
    });

    const setLayoutMode = (mode: LayoutMode) => {
        setLayoutModeState(mode);
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (e) {
            console.error('Failed to save layout mode preference', e);
        }
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-layout-mode', layoutMode);
    }, [layoutMode]);

    const value: LayoutModeContextType = {
        layoutMode,
        setLayoutMode,
        presetInfo: LAYOUT_PRESETS[layoutMode],
        presets: Object.values(LAYOUT_PRESETS),
    };

    return (
        <LayoutModeContext.Provider value={value}>
            {children}
        </LayoutModeContext.Provider>
    );
};

export const useLayoutMode = (): LayoutModeContextType => {
    const context = useContext(LayoutModeContext);
    if (!context) {
        throw new Error('useLayoutMode must be used within a LayoutModeProvider');
    }
    return context;
};
