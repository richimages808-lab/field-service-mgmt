import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopUtilityBar, MobileSidebarTrigger } from './TopUtilityBar';
import { TrialBanner } from './TrialBanner';
import { A2PBanner } from './A2PBanner';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

    return (
        <div className="app-layout">
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
                <main className="app-layout__content">
                    {children}
                </main>
            </div>
        </div>
    );
};
