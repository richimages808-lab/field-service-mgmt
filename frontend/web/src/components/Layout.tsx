import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopUtilityBar, MobileSidebarTrigger } from './TopUtilityBar';
import { TopHorizontalNav } from './TopHorizontalNav';
import { TrialBanner } from './TrialBanner';
import { A2PBanner } from './A2PBanner';
import { useLayoutMode } from '../context/LayoutModeContext';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { layoutMode } = useLayoutMode();
    const location = useLocation();

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isMobileMenuOpen]);

    const isFullBleed = location.pathname.startsWith('/email') || location.pathname === '/dispatcher';

    // ─── Streamlined Workspace Layout (Horizontal Top Nav, No Left Sidebar) ───
    if (layoutMode === 'streamlined') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col">
                <TopHorizontalNav />
                <TrialBanner />
                <A2PBanner />
                <main className={
                    isFullBleed
                        ? 'flex-1 p-0'
                        : 'flex-1 max-w-[1600px] w-full mx-auto py-4 px-3 sm:px-6'
                }>
                    {children}
                </main>
            </div>
        );
    }

    // ─── Modern Hub & Compact Pro Layouts (With Left Sidebar Dock / Rail) ───
    return (
        <div className={`app-layout ${layoutMode === 'compact-pro' ? 'app-layout--compact-pro' : ''}`}>
            {/* Desktop sidebar — always visible on lg+ */}
            <div className="app-layout__sidebar">
                <Sidebar />
            </div>

            {/* Mobile sidebar — slide-out overlay */}
            {isMobileMenuOpen && (
                <>
                    <div
                        className="app-layout__overlay"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="app-layout__mobile-sidebar">
                        <Sidebar />
                    </div>
                </>
            )}

            {/* Main content area */}
            <div className="app-layout__main">
                {/* Mobile menu trigger */}
                <MobileSidebarTrigger
                    isOpen={isMobileMenuOpen}
                    onToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                />

                {/* Top utility bar */}
                <TopUtilityBar />

                {/* Banners */}
                <TrialBanner />
                <A2PBanner />

                {/* Page content */}
                <main className={
                    isFullBleed
                        ? 'app-layout__content--full-bleed'
                        : layoutMode === 'compact-pro'
                            ? 'app-layout__content py-3 px-3 sm:px-4'
                            : 'app-layout__content'
                }>
                    {children}
                </main>
            </div>
        </div>
    );
};
