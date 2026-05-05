/**
 * SectionEditor — Compact section summary + "Open Website Builder" launcher.
 * Shows a summary of configured sections, active theme badge, and a prominent
 * button to open the full-screen FullPageBuilder modal.
 */

import React, { useState } from 'react';
import {
    LayoutList, ExternalLink, Layers, Eye, EyeOff, GripVertical,
    Info, Wrench, Camera, HelpCircle, Quote, Megaphone,
    Users, Clock, MapPin, Award, BarChart3, FileText, Columns,
    Image as ImageIcon, Sparkles, Palette
} from 'lucide-react';
import { FullPageBuilder } from './FullPageBuilder';
import type { ContentSection, SectionItem, WebsiteTheme } from '../../pages/OrganizationSettings';

export type { ContentSection, SectionItem, WebsiteTheme };

interface SectionEditorProps {
    sections: ContentSection[];
    onChange: (sections: ContentSection[]) => void;
    orgId: string;
    primaryColor: string;
    orgSlug?: string;
    websiteTheme: WebsiteTheme | null;
    onThemeChange: (theme: WebsiteTheme | null) => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
    hero: Sparkles, about: Info, services: Wrench, gallery: Camera,
    faq: HelpCircle, testimonials: Quote, cta: Megaphone,
    team: Users, hours: Clock, serviceAreas: MapPin,
    certifications: Award, stats: BarChart3, text: FileText,
    twoColumn: Columns, beforeAfter: ImageIcon
};

const THEME_LABELS: Record<string, string> = {
    'classic': 'Classic Business',
    'modern-dark': 'Modern Dark',
    'bold-color': 'Bold & Colorful',
    'clean-minimal': 'Clean Minimal',
    'warm-earth': 'Warm & Personal',
    'professional': 'Professional Edge'
};

export const SectionEditor: React.FC<SectionEditorProps> = ({ sections, onChange, orgId, primaryColor, orgSlug, websiteTheme, onThemeChange }) => {
    const [showBuilder, setShowBuilder] = useState(false);

    const enabledCount = sections.filter(s => s.enabled).length;

    return (
        <>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2">
                        <LayoutList className="w-4 h-4 text-gray-400" />
                        <h3 className="font-semibold text-gray-900">Website Sections</h3>
                        {sections.length > 0 && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {enabledCount} of {sections.length} active
                            </span>
                        )}
                    </div>
                </div>

                {/* Active Theme Badge */}
                {websiteTheme && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `${primaryColor}08`, border: `1px solid ${primaryColor}20` }}>
                        <Palette className="w-4 h-4" style={{ color: primaryColor }} />
                        <span className="text-sm font-medium text-gray-700">Theme:</span>
                        <span className="text-sm font-semibold" style={{ color: primaryColor }}>{THEME_LABELS[websiteTheme.id] || websiteTheme.id}</span>
                    </div>
                )}

                {/* Section Summary */}
                {sections.length > 0 ? (
                    <div className="space-y-1.5">
                        {sections.map(section => {
                            const Icon = TYPE_ICONS[section.type] || FileText;
                            return (
                                <div key={section.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${section.enabled ? 'bg-gray-50' : 'bg-gray-50 opacity-50'}`}>
                                    <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                                    <Icon className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                                    <span className="text-sm text-gray-800 font-medium flex-1 truncate">{section.title}</span>
                                    {section.items && section.items.length > 0 && (
                                        <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">
                                            {section.items.length} items
                                        </span>
                                    )}
                                    {section.enabled
                                        ? <Eye className="w-3.5 h-3.5 text-green-500" />
                                        : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-400">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm mb-1">No website sections configured</p>
                        <p className="text-xs">Open the builder to choose a theme and add pages</p>
                    </div>
                )}

                {/* Open Builder Button */}
                <button
                    onClick={() => setShowBuilder(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                    style={{ backgroundColor: primaryColor }}
                >
                    <Layers className="w-4 h-4" />
                    {sections.length > 0 ? 'Open Website Builder' : 'Launch Website Builder'}
                    <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
                </button>

                {orgSlug && (
                    <p className="text-xs text-center text-gray-400">
                        Your public website: <a href={`/p/${orgSlug}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">/p/{orgSlug}</a>
                    </p>
                )}
            </div>

            {/* Full-Screen Builder Modal */}
            {showBuilder && (
                <FullPageBuilder
                    sections={sections}
                    onSave={(newSections) => {
                        onChange(newSections);
                        setShowBuilder(false);
                    }}
                    onClose={() => setShowBuilder(false)}
                    orgId={orgId}
                    primaryColor={primaryColor}
                    orgSlug={orgSlug}
                    websiteTheme={websiteTheme}
                    onThemeChange={onThemeChange}
                />
            )}
        </>
    );
};
