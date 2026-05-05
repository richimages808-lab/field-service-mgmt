/**
 * FullPageBuilder — Full-screen modal website builder.
 * Three-step flow: 1) Choose Theme → 2) Choose Pages → 3) Edit Sections.
 * Themes control visual rendering on the public portal.
 * Page groups organize sections logically (Home, Services, Portfolio, etc.).
 * Existing content is never overwritten — themes and pages are additive.
 */

import React, { useState } from 'react';
import {
    X, Plus, Trash2,
    Eye, EyeOff, Star, ArrowUp, ArrowDown, Layers, FileText,
    Info, Wrench, Camera, HelpCircle, Quote, Megaphone,
    Users, Clock, MapPin, Award, Columns, BarChart3,
    Image as ImageIcon, LayoutTemplate, Sparkles, Save,
    ChevronRight, ChevronLeft, ChevronDown, ExternalLink, Palette,
    Home, Briefcase, ImageIcon as PortfolioIcon, ShieldCheck,
    BookOpen, UserCircle, Check
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import type { ContentSection, SectionItem, WebsiteTheme } from '../../pages/OrganizationSettings';

/* ─── Section Type Registry ─── */
const SECTION_TYPES = [
    { type: 'hero' as const, label: 'Hero Banner', icon: Sparkles, description: 'Bold headline with call-to-action', category: 'Essential' },
    { type: 'about' as const, label: 'About Us', icon: Info, description: 'Tell your story & mission', category: 'Essential' },
    { type: 'services' as const, label: 'Services', icon: Wrench, description: 'List your service offerings', category: 'Essential' },
    { type: 'gallery' as const, label: 'Photo Gallery', icon: Camera, description: 'Showcase your work', category: 'Essential' },
    { type: 'faq' as const, label: 'FAQ', icon: HelpCircle, description: 'Answer common questions', category: 'Essential' },
    { type: 'testimonials' as const, label: 'Testimonials', icon: Quote, description: 'Customer reviews & ratings', category: 'Essential' },
    { type: 'cta' as const, label: 'Call to Action', icon: Megaphone, description: '"Book Now" or "Contact Us" banner', category: 'Essential' },
    { type: 'team' as const, label: 'Our Team', icon: Users, description: 'Introduce your staff', category: 'Company' },
    { type: 'hours' as const, label: 'Business Hours', icon: Clock, description: 'Operating schedule', category: 'Company' },
    { type: 'serviceAreas' as const, label: 'Service Areas', icon: MapPin, description: 'Map of areas you serve', category: 'Company' },
    { type: 'certifications' as const, label: 'Certifications & Licenses', icon: Award, description: 'Trust badges & credentials', category: 'Company' },
    { type: 'stats' as const, label: 'Stats & Numbers', icon: BarChart3, description: 'Key metrics that impress', category: 'Company' },
    { type: 'text' as const, label: 'Text Block', icon: FileText, description: 'Custom rich text section', category: 'Custom' },
    { type: 'twoColumn' as const, label: 'Two Column', icon: Columns, description: 'Side-by-side content', category: 'Custom' },
    { type: 'beforeAfter' as const, label: 'Before & After', icon: ImageIcon, description: 'Project transformation showcase', category: 'Custom' }
];

const SECTION_DEFAULTS: Record<string, Partial<ContentSection>> = {
    hero: { title: 'Professional Service You Can Trust', content: 'Licensed, insured, and ready to help. Book your appointment today.' },
    about: { title: 'About Us', content: 'We are a trusted local service provider committed to quality workmanship and customer satisfaction.' },
    services: { title: 'Our Services', content: 'We offer a full range of professional services to meet your needs.' },
    gallery: { title: 'Our Work', content: 'Take a look at some of our recent projects.' },
    faq: { title: 'Frequently Asked Questions', content: '' },
    testimonials: { title: 'What Our Customers Say', content: '' },
    cta: { title: 'Ready to Get Started?', content: 'Contact us today to schedule your service.', ctaText: 'Book Now', ctaLink: '#book' },
    team: { title: 'Meet Our Team', content: 'Our experienced professionals are here to help.' },
    hours: { title: 'Business Hours', content: '' },
    serviceAreas: { title: 'Areas We Serve', content: 'We proudly serve the following areas.' },
    certifications: { title: 'Licensed & Certified', content: 'Our team holds the following certifications and licenses.' },
    stats: { title: 'By the Numbers', content: '' },
    text: { title: 'Custom Section', content: 'Add your own content here.' },
    twoColumn: { title: 'Why Choose Us', content: '' },
    beforeAfter: { title: 'See the Difference', content: 'Check out these transformations from our recent projects.' }
};

/* ─── Website Themes ─── */
interface ThemeDefinition {
    id: string;
    name: string;
    description: string;
    heroStyle: WebsiteTheme['heroStyle'];
    sectionSpacing: WebsiteTheme['sectionSpacing'];
    headingStyle: WebsiteTheme['headingStyle'];
    cardStyle: WebsiteTheme['cardStyle'];
    colorMode: WebsiteTheme['colorMode'];
    previewColors: { heroBg: string; bodyBg: string; cardBg: string; accent: string };
}

const WEBSITE_THEMES: ThemeDefinition[] = [
    {
        id: 'classic', name: 'Classic Business', description: 'Clean and professional — works for any industry',
        heroStyle: 'centered', sectionSpacing: 'normal', headingStyle: 'sans', cardStyle: 'bordered', colorMode: 'light',
        previewColors: { heroBg: '#f8fafc', bodyBg: '#ffffff', cardBg: '#ffffff', accent: 'PRIMARY' }
    },
    {
        id: 'modern-dark', name: 'Modern Dark', description: 'Dark hero with bold imagery and frosted cards',
        heroStyle: 'fullwidth', sectionSpacing: 'spacious', headingStyle: 'bold-caps', cardStyle: 'glass', colorMode: 'dark',
        previewColors: { heroBg: '#0f172a', bodyBg: '#ffffff', cardBg: '#f1f5f9', accent: 'PRIMARY' }
    },
    {
        id: 'bold-color', name: 'Bold & Colorful', description: 'Vibrant color blocks with strong visual contrast',
        heroStyle: 'split', sectionSpacing: 'normal', headingStyle: 'sans', cardStyle: 'elevated', colorMode: 'light',
        previewColors: { heroBg: 'PRIMARY', bodyBg: '#ffffff', cardBg: '#ffffff', accent: 'PRIMARY' }
    },
    {
        id: 'clean-minimal', name: 'Clean Minimal', description: 'Lots of white space, typography-focused design',
        heroStyle: 'minimal', sectionSpacing: 'spacious', headingStyle: 'sans', cardStyle: 'flat', colorMode: 'light',
        previewColors: { heroBg: '#ffffff', bodyBg: '#ffffff', cardBg: '#fafafa', accent: 'PRIMARY' }
    },
    {
        id: 'warm-earth', name: 'Warm & Personal', description: 'Inviting warmth with serif headings and soft tones',
        heroStyle: 'centered', sectionSpacing: 'normal', headingStyle: 'serif', cardStyle: 'elevated', colorMode: 'auto',
        previewColors: { heroBg: '#fef3c7', bodyBg: '#fffbeb', cardBg: '#ffffff', accent: 'PRIMARY' }
    },
    {
        id: 'professional', name: 'Professional Edge', description: 'Sharp lines, dark header, compact and data-driven',
        heroStyle: 'fullwidth', sectionSpacing: 'compact', headingStyle: 'bold-caps', cardStyle: 'bordered', colorMode: 'auto',
        previewColors: { heroBg: '#1e293b', bodyBg: '#ffffff', cardBg: '#ffffff', accent: 'PRIMARY' }
    }
];

/* ─── Page Groups ─── */
interface PageGroup {
    id: string;
    name: string;
    icon: React.ElementType;
    description: string;
    sectionTypes: string[];
    required?: boolean;
}

const PAGE_GROUPS: PageGroup[] = [
    { id: 'home', name: 'Home', icon: Home, description: 'Hero banner, about section, and call to action', sectionTypes: ['hero', 'about', 'cta'], required: true },
    { id: 'services', name: 'Services', icon: Briefcase, description: 'Service listings with stats & numbers', sectionTypes: ['services', 'stats'] },
    { id: 'portfolio', name: 'Portfolio', icon: Camera, description: 'Photo gallery and before/after showcases', sectionTypes: ['gallery', 'beforeAfter'] },
    { id: 'trust', name: 'Trust & Reviews', icon: ShieldCheck, description: 'Testimonials and certifications', sectionTypes: ['testimonials', 'certifications'] },
    { id: 'info', name: 'Info & FAQ', icon: BookOpen, description: 'Business hours, service areas, and FAQ', sectionTypes: ['faq', 'hours', 'serviceAreas'] },
    { id: 'team', name: 'Team', icon: UserCircle, description: 'Introduce your team members', sectionTypes: ['team'] }
];

/** Visual mini-preview of a theme */
const ThemePreviewCard: React.FC<{ theme: ThemeDefinition; color: string; isActive: boolean; onClick: () => void }> = ({ theme, color, isActive, onClick }) => {
    const resolve = (c: string) => c === 'PRIMARY' ? color : c;
    const heroBg = resolve(theme.previewColors.heroBg);
    const bodyBg = resolve(theme.previewColors.bodyBg);
    const cardBg = resolve(theme.previewColors.cardBg);
    const isDarkHero = theme.colorMode === 'dark' || theme.colorMode === 'auto';
    const heroTextColor = isDarkHero ? '#ffffff' : '#1f2937';

    return (
        <button onClick={onClick}
            className={`text-left rounded-xl border-2 transition-all group overflow-hidden hover:shadow-lg ${isActive ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-lg' : 'border-gray-200 hover:border-gray-300'}`}>
            {/* Mini website preview */}
            <div className="w-full relative" style={{ height: 140 }}>
                {/* Fake browser chrome */}
                <div className="h-4 flex items-center px-2 gap-1 bg-gray-100 border-b border-gray-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <div className="ml-2 w-20 h-1.5 rounded bg-gray-200" />
                </div>
                {/* Hero area */}
                <div className="flex items-center justify-center" style={{ height: 50, backgroundColor: heroBg }}>
                    {theme.heroStyle === 'split' ? (
                        <div className="flex w-full h-full">
                            <div className="flex-1 flex flex-col justify-center px-3">
                                <div className="w-16 h-1.5 rounded mb-1" style={{ backgroundColor: heroTextColor, opacity: 0.8 }} />
                                <div className="w-12 h-1 rounded" style={{ backgroundColor: heroTextColor, opacity: 0.4 }} />
                            </div>
                            <div className="w-1/3 h-full" style={{ backgroundColor: `${color}30` }} />
                        </div>
                    ) : theme.heroStyle === 'minimal' ? (
                        <div className="text-center">
                            <div className="w-14 h-1 rounded mx-auto mb-1" style={{ backgroundColor: heroTextColor, opacity: 0.6 }} />
                            <div className="w-8 h-0.5 rounded mx-auto" style={{ backgroundColor: heroTextColor, opacity: 0.3 }} />
                        </div>
                    ) : (
                        <div className="text-center">
                            <div className="w-20 h-1.5 rounded mx-auto mb-1" style={{ backgroundColor: heroTextColor, opacity: 0.8 }} />
                            <div className="w-14 h-1 rounded mx-auto mb-1.5" style={{ backgroundColor: heroTextColor, opacity: 0.4 }} />
                            <div className="w-10 h-2.5 rounded mx-auto" style={{ backgroundColor: color, opacity: 0.9 }} />
                        </div>
                    )}
                </div>
                {/* Body area */}
                <div className="px-2 py-1.5" style={{ backgroundColor: bodyBg, height: 76 }}>
                    {/* Section title */}
                    <div className="w-12 h-1 rounded mx-auto mb-2" style={{ backgroundColor: '#374151', opacity: 0.5 }} />
                    {/* Cards row */}
                    <div className="flex gap-1 justify-center">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex-1 h-9 rounded" style={{
                                backgroundColor: cardBg,
                                border: theme.cardStyle === 'bordered' ? '0.5px solid #e5e7eb' : 'none',
                                boxShadow: theme.cardStyle === 'elevated' ? '0 1px 3px rgba(0,0,0,0.1)' : theme.cardStyle === 'glass' ? '0 1px 6px rgba(0,0,0,0.06)' : 'none'
                            }}>
                                <div className="w-3 h-3 rounded-sm mx-auto mt-1.5" style={{ backgroundColor: `${color}20` }} />
                                <div className="w-6 h-0.5 rounded mx-auto mt-1" style={{ backgroundColor: '#9ca3af' }} />
                            </div>
                        ))}
                    </div>
                    {/* CTA bar */}
                    <div className="mt-2 h-4 rounded flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                        <div className="w-8 h-1.5 rounded" style={{ backgroundColor: color }} />
                    </div>
                </div>
            </div>
            {/* Label */}
            <div className="p-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                    <h3 className={`font-semibold text-sm ${isActive ? 'text-indigo-600' : 'text-gray-900 group-hover:text-indigo-600'}`}>{theme.name}</h3>
                    {isActive && <Check className="w-4 h-4 text-indigo-600" />}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{theme.description}</p>
            </div>
        </button>
    );
};

/* ─── Section Ideas Panel ─── */
const SECTION_IDEAS = [
    { type: 'about',          emoji: '📖', title: 'About Us',          hint: 'Share your company story and values' },
    { type: 'services',       emoji: '🔧', title: 'Services',          hint: 'List what you offer with descriptions' },
    { type: 'gallery',        emoji: '📸', title: 'Photo Gallery',     hint: 'Show off your best work' },
    { type: 'testimonials',   emoji: '⭐', title: 'Customer Reviews',  hint: 'Build trust with real feedback' },
    { type: 'faq',            emoji: '❓', title: 'FAQ',               hint: 'Answer questions before they\'re asked' },
    { type: 'cta',            emoji: '📢', title: 'Call to Action',    hint: '"Book Now", "Get a Quote", etc.' },
    { type: 'team',           emoji: '👥', title: 'Meet the Team',     hint: 'Put faces to names' },
    { type: 'beforeAfter',    emoji: '🔄', title: 'Before & After',    hint: 'Show dramatic transformations' },
    { type: 'stats',          emoji: '📊', title: 'Stats & Numbers',   hint: '"10+ years", "500+ jobs completed"' },
    { type: 'hours',          emoji: '🕐', title: 'Business Hours',    hint: 'Let customers know when you\'re open' },
    { type: 'serviceAreas',   emoji: '📍', title: 'Service Areas',     hint: 'Show where you work' },
    { type: 'certifications', emoji: '🏆', title: 'Certifications',    hint: 'Display your credentials & licenses' },
    { type: 'twoColumn',      emoji: '📋', title: 'Why Choose Us',     hint: 'Side-by-side feature highlights' },
    { type: 'text',           emoji: '✏️', title: 'Custom Text',       hint: 'Policies, guarantees, anything' }
];

/* ─── Main Component ─── */
interface FullPageBuilderProps {
    sections: ContentSection[];
    onSave: (sections: ContentSection[]) => void;
    onClose: () => void;
    orgId: string;
    primaryColor: string;
    orgSlug?: string;
    websiteTheme: WebsiteTheme | null;
    onThemeChange: (theme: WebsiteTheme | null) => void;
}

type BuilderStep = 'theme' | 'pages' | 'editor';

export const FullPageBuilder: React.FC<FullPageBuilderProps> = ({ sections: initialSections, onSave, onClose, orgId, primaryColor, orgSlug, websiteTheme, onThemeChange }) => {
    const [sections, setSections] = useState<ContentSection[]>(initialSections);
    const [selectedId, setSelectedId] = useState<string | null>(initialSections[0]?.id || null);
    const [activeTheme, setActiveTheme] = useState<WebsiteTheme | null>(websiteTheme);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    // Determine initial step
    const getInitialStep = (): BuilderStep => {
        if (initialSections.length === 0 && !websiteTheme) return 'theme';
        return 'editor';
    };
    const [step, setStep] = useState<BuilderStep>(getInitialStep());

    // Page group toggle tracking for the pages step
    const [selectedPageGroups, setSelectedPageGroups] = useState<Set<string>>(() => {
        const existing = new Set<string>();
        const existingTypes = new Set(initialSections.map(s => s.type));
        PAGE_GROUPS.forEach(pg => {
            if (pg.required || pg.sectionTypes.some(t => existingTypes.has(t as any))) {
                existing.add(pg.id);
            }
        });
        return existing;
    });

    const selectedSection = sections.find(s => s.id === selectedId);

    /* ── Theme selection ── */
    const selectTheme = (themeDef: ThemeDefinition) => {
        const theme: WebsiteTheme = {
            id: themeDef.id,
            heroStyle: themeDef.heroStyle,
            sectionSpacing: themeDef.sectionSpacing,
            headingStyle: themeDef.headingStyle,
            cardStyle: themeDef.cardStyle,
            colorMode: themeDef.colorMode
        };
        setActiveTheme(theme);
        onThemeChange(theme);
        setHasChanges(true);
    };

    /* ── Apply page groups (additive) ── */
    const applyPageGroups = () => {
        const existingTypes = new Set(sections.map(s => s.type));
        const newSections = [...sections];

        // Add sections from selected page groups that don't exist yet
        selectedPageGroups.forEach(groupId => {
            const group = PAGE_GROUPS.find(g => g.id === groupId);
            if (!group) return;
            group.sectionTypes.forEach(type => {
                if (!existingTypes.has(type as any)) {
                    const defaults = SECTION_DEFAULTS[type] || { title: 'New Section', content: '' };
                    newSections.push({
                        id: uuidv4(),
                        type: type as any,
                        title: defaults.title || 'New Section',
                        content: defaults.content || '',
                        enabled: true,
                        order: newSections.length,
                        items: ['services', 'faq', 'testimonials', 'gallery', 'team', 'stats', 'hours', 'serviceAreas', 'certifications', 'beforeAfter', 'twoColumn'].includes(type) ? [] : undefined,
                        ctaText: defaults.ctaText,
                        ctaLink: defaults.ctaLink
                    } as ContentSection);
                    existingTypes.add(type as any);
                }
            });
        });

        // Order: follow page group order, then extras at end
        const ordered: ContentSection[] = [];
        const used = new Set<string>();
        PAGE_GROUPS.forEach(group => {
            if (selectedPageGroups.has(group.id)) {
                group.sectionTypes.forEach(type => {
                    const match = newSections.find(s => s.type === type && !used.has(s.id));
                    if (match) { ordered.push(match); used.add(match.id); }
                });
            }
        });
        newSections.forEach(s => { if (!used.has(s.id)) ordered.push(s); });
        ordered.forEach((s, i) => s.order = i);

        setSections(ordered);
        setSelectedId(ordered[0]?.id || null);
        setHasChanges(true);
        setStep('editor');
        toast.success('Pages configured! Now customize each section.');
    };

    const addSection = (type: string) => {
        const defaults = SECTION_DEFAULTS[type] || { title: 'New Section', content: '' };
        const newSection: ContentSection = {
            id: uuidv4(),
            type: type as any,
            title: defaults.title || 'New Section',
            content: defaults.content || '',
            enabled: true,
            order: sections.length,
            items: ['services', 'faq', 'testimonials', 'gallery', 'team', 'stats', 'hours', 'serviceAreas', 'certifications', 'beforeAfter', 'twoColumn'].includes(type) ? [] : undefined,
            ctaText: defaults.ctaText,
            ctaLink: defaults.ctaLink
        };
        setSections(prev => [...prev, newSection]);
        setSelectedId(newSection.id);
        setShowAddMenu(false);
        setHasChanges(true);
    };

    const updateSection = (id: string, updates: Partial<ContentSection>) => {
        setSections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        setHasChanges(true);
    };

    const removeSection = (id: string) => {
        setSections(prev => prev.filter(s => s.id !== id));
        if (selectedId === id) setSelectedId(sections.find(s => s.id !== id)?.id || null);
        setHasChanges(true);
    };

    const moveSection = (id: string, direction: 'up' | 'down') => {
        const idx = sections.findIndex(s => s.id === id);
        if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === sections.length - 1)) return;
        const newSections = [...sections];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        [newSections[idx], newSections[swapIdx]] = [newSections[swapIdx], newSections[idx]];
        newSections.forEach((s, i) => s.order = i);
        setSections(newSections);
        setHasChanges(true);
    };

    const addItem = (sectionId: string, section: ContentSection) => {
        const newItem: SectionItem = {
            id: uuidv4(),
            title: '',
            content: '',
            rating: section.type === 'testimonials' ? 5 : undefined
        };
        updateSection(sectionId, { items: [...(section.items || []), newItem] });
    };

    const updateItem = (sectionId: string, itemId: string, updates: Partial<SectionItem>) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        updateSection(sectionId, {
            items: (section.items || []).map(item => item.id === itemId ? { ...item, ...updates } : item)
        });
    };

    const removeItem = (sectionId: string, itemId: string) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        updateSection(sectionId, { items: (section.items || []).filter(item => item.id !== itemId) });
    };

    const handleItemImageUpload = async (sectionId: string, itemId: string, file: File) => {
        if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
        try {
            const path = `organizations/${orgId}/sections/${sectionId}/${itemId}-${Date.now()}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            updateItem(sectionId, itemId, { imageUrl: url });
            toast.success('Image uploaded');
        } catch { toast.error('Upload failed'); }
    };

    const handleSave = () => {
        onSave(sections);
        setHasChanges(false);
        toast.success('Sections saved — don\'t forget to Save Settings!');
    };

    const getItemLabel = (type: string) => {
        const map: Record<string, { singular: string; plural: string; titlePlaceholder: string; contentPlaceholder: string }> = {
            services: { singular: 'Service', plural: 'Services', titlePlaceholder: 'Service name', contentPlaceholder: 'Brief description' },
            faq: { singular: 'Question', plural: 'Questions & Answers', titlePlaceholder: 'Question', contentPlaceholder: 'Answer' },
            testimonials: { singular: 'Review', plural: 'Reviews', titlePlaceholder: 'Customer name', contentPlaceholder: 'Their review' },
            gallery: { singular: 'Photo', plural: 'Photos', titlePlaceholder: 'Caption', contentPlaceholder: '' },
            team: { singular: 'Member', plural: 'Team Members', titlePlaceholder: 'Name', contentPlaceholder: 'Role / bio' },
            hours: { singular: 'Day', plural: 'Schedule', titlePlaceholder: 'Day (e.g., Monday)', contentPlaceholder: 'Hours (e.g., 8am - 5pm)' },
            serviceAreas: { singular: 'Area', plural: 'Areas', titlePlaceholder: 'City / neighborhood', contentPlaceholder: 'Notes (optional)' },
            certifications: { singular: 'Certification', plural: 'Certifications', titlePlaceholder: 'Certification name', contentPlaceholder: 'Issuing body or details' },
            stats: { singular: 'Stat', plural: 'Stats', titlePlaceholder: 'Number (e.g., 500+)', contentPlaceholder: 'Label (e.g., Happy Customers)' },
            beforeAfter: { singular: 'Project', plural: 'Projects', titlePlaceholder: 'Project name', contentPlaceholder: 'Description' },
            twoColumn: { singular: 'Point', plural: 'Points', titlePlaceholder: 'Heading', contentPlaceholder: 'Details' }
        };
        return map[type] || { singular: 'Item', plural: 'Items', titlePlaceholder: 'Title', contentPlaceholder: 'Content' };
    };

    const getTypeIcon = (type: string) => {
        return SECTION_TYPES.find(s => s.type === type)?.icon || FileText;
    };

    const hasItems = (type: string) => ['services', 'faq', 'testimonials', 'gallery', 'team', 'hours', 'serviceAreas', 'certifications', 'stats', 'beforeAfter', 'twoColumn'].includes(type);

    const toggleGroup = (groupId: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    /** Get the page group a section type belongs to */
    const getSectionGroup = (type: string): PageGroup | undefined => {
        return PAGE_GROUPS.find(g => g.sectionTypes.includes(type));
    };

    /** Group sections by their page group for sidebar display */
    const groupedSections = (() => {
        const groups: { group: PageGroup | null; sections: ContentSection[] }[] = [];
        const used = new Set<string>();

        PAGE_GROUPS.forEach(group => {
            const matching = sections.filter(s => group.sectionTypes.includes(s.type) && !used.has(s.id));
            if (matching.length > 0) {
                groups.push({ group, sections: matching });
                matching.forEach(s => used.add(s.id));
            }
        });

        // Ungrouped sections
        const ungrouped = sections.filter(s => !used.has(s.id));
        if (ungrouped.length > 0) {
            groups.push({ group: null, sections: ungrouped });
        }

        return groups;
    })();

    /* ═══════════════════════════════════════════════
     *  Step 1: Theme Selection
     * ═══════════════════════════════════════════════ */
    if (step === 'theme') {
        return (
            <div className="fixed inset-0 z-[9999] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                <Palette className="w-6 h-6" style={{ color: primaryColor }} />
                                Choose Your Theme
                            </h2>
                            <p className="text-gray-500 mt-1">Pick a visual style for your website. You can change this anytime — your content stays the same.</p>
                        </div>
                        <button onClick={() => { if (sections.length === 0) onClose(); else setStep('editor'); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    {/* Theme Grid */}
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                            {WEBSITE_THEMES.map(theme => (
                                <ThemePreviewCard
                                    key={theme.id}
                                    theme={theme}
                                    color={primaryColor}
                                    isActive={activeTheme?.id === theme.id}
                                    onClick={() => selectTheme(theme)}
                                />
                            ))}
                        </div>

                        {/* Continue / Skip */}
                        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
                            <button onClick={() => setStep(sections.length > 0 ? 'editor' : 'pages')}
                                className="text-sm text-gray-500 hover:text-gray-700 underline">
                                Skip — {sections.length > 0 ? 'keep editing' : 'I\'ll build from scratch'}
                            </button>
                            <button onClick={() => setStep('pages')}
                                disabled={!activeTheme}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                                style={{ backgroundColor: primaryColor }}>
                                Continue — Choose Pages <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* ═══════════════════════════════════════════════
     *  Step 2: Page Group Selection
     * ═══════════════════════════════════════════════ */
    if (step === 'pages') {
        return (
            <div className="fixed inset-0 z-[9999] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                <Layers className="w-6 h-6" style={{ color: primaryColor }} />
                                Choose Your Pages
                            </h2>
                            <p className="text-gray-500 mt-1">Select which content groups to include. You can add or remove sections later.</p>
                        </div>
                        <button onClick={() => setStep('theme')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    {/* Page Group Checklist */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-3">
                        {PAGE_GROUPS.map(group => {
                            const isSelected = selectedPageGroups.has(group.id);
                            const GroupIcon = group.icon;
                            return (
                                <button key={group.id}
                                    onClick={() => {
                                        if (group.required) return;
                                        setSelectedPageGroups(prev => {
                                            const next = new Set(prev);
                                            if (next.has(group.id)) next.delete(group.id);
                                            else next.add(group.id);
                                            return next;
                                        });
                                    }}
                                    className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left group
                                        ${isSelected ? 'border-indigo-400 bg-indigo-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                                        ${group.required ? 'cursor-default' : 'cursor-pointer'}`}>

                                    {/* Checkbox */}
                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors
                                        ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'}
                                        ${group.required ? 'opacity-60' : ''}`}>
                                        {isSelected && <Check className="w-4 h-4 text-white" />}
                                    </div>

                                    {/* Icon */}
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: isSelected ? `${primaryColor}15` : '#f3f4f6', color: isSelected ? primaryColor : '#9ca3af' }}>
                                        <GroupIcon className="w-5 h-5" />
                                    </div>

                                    {/* Label */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900">{group.name}</span>
                                            {group.required && <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Always included</span>}
                                        </div>
                                        <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
                                        <div className="flex gap-1.5 mt-1.5">
                                            {group.sectionTypes.map(type => (
                                                <span key={type} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                                                    {SECTION_TYPES.find(s => s.type === type)?.label || type}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-5 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                        <button onClick={() => setStep('theme')}
                            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                            <ChevronLeft className="w-4 h-4" /> Back to Themes
                        </button>
                        <button onClick={applyPageGroups}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: primaryColor }}>
                            Build My Website <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ═══════════════════════════════════════════════
     *  Step 3: Main Builder / Editor
     * ═══════════════════════════════════════════════ */
    return (
        <div className="fixed inset-0 z-[9999] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl w-[96vw] h-[94vh] flex flex-col overflow-hidden">
                {/* Top Bar */}
                <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 shrink-0 bg-white">
                    <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5" style={{ color: primaryColor }} />
                        <h2 className="font-bold text-gray-900">Website Builder</h2>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{sections.length} sections</span>
                        {activeTheme && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}>
                                {WEBSITE_THEMES.find(t => t.id === activeTheme.id)?.name || activeTheme.id}
                            </span>
                        )}
                        {hasChanges && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Unsaved</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setStep('theme')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                            <Palette className="w-4 h-4" /> Theme
                        </button>
                        <button onClick={() => setStep('pages')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                            <LayoutTemplate className="w-4 h-4" /> Pages
                        </button>
                        {orgSlug && (
                            <a href={`/p/${orgSlug}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                                <ExternalLink className="w-4 h-4" /> Preview Site
                            </a>
                        )}
                        <button onClick={handleSave}
                            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white rounded-lg transition-colors"
                            style={{ backgroundColor: primaryColor }}>
                            <Save className="w-4 h-4" /> Apply Changes
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors ml-1">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* ─── Left Sidebar: Grouped Section List ─── */}
                    <div className={`${sidebarCollapsed ? 'w-12' : 'w-64'} border-r border-gray-200 bg-gray-50 flex flex-col shrink-0 transition-all duration-200`}>
                        {!sidebarCollapsed && (
                            <>
                                <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections</span>
                                    <div className="flex items-center gap-1">
                                        <div className="relative">
                                            <button onClick={() => setShowAddMenu(!showAddMenu)}
                                                className="p-1 rounded-md hover:bg-gray-200 transition-colors" style={{ color: primaryColor }}>
                                                <Plus className="w-4 h-4" />
                                            </button>
                                            {showAddMenu && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                                                    <div className="absolute left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1 max-h-[70vh] overflow-y-auto">
                                                        {['Essential', 'Company', 'Custom'].map(category => (
                                                            <div key={category}>
                                                                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{category}</div>
                                                                {SECTION_TYPES.filter(s => s.category === category).map(st => (
                                                                    <button key={st.type} onClick={() => addSection(st.type)}
                                                                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left text-sm">
                                                                        <st.icon className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                                                                        <div className="min-w-0">
                                                                            <div className="font-medium text-gray-900 truncate">{st.label}</div>
                                                                            <div className="text-[10px] text-gray-400 truncate">{st.description}</div>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <button onClick={() => setSidebarCollapsed(true)} className="p-1 rounded-md hover:bg-gray-200">
                                            <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto py-1">
                                    {groupedSections.map(({ group, sections: groupSections }) => {
                                        const isCollapsed = group ? collapsedGroups.has(group.id) : false;
                                        const GroupIcon = group?.icon || Layers;
                                        return (
                                            <div key={group?.id || 'ungrouped'} className="mb-1">
                                                {/* Group header */}
                                                <button onClick={() => group && toggleGroup(group.id)}
                                                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                                                    <GroupIcon className="w-3 h-3" />
                                                    <span className="flex-1 text-left">{group?.name || 'Other'}</span>
                                                    {group && <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />}
                                                </button>

                                                {/* Section items */}
                                                {!isCollapsed && groupSections.map((section, idx) => {
                                                    const Icon = getTypeIcon(section.type);
                                                    const globalIdx = sections.findIndex(s => s.id === section.id);
                                                    return (
                                                        <div key={section.id}
                                                            onClick={() => setSelectedId(section.id)}
                                                            className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors group text-sm
                                                                ${selectedId === section.id ? 'bg-white shadow-sm border border-gray-200' : 'hover:bg-white/60'}
                                                                ${!section.enabled ? 'opacity-50' : ''}`}>
                                                            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: primaryColor }} />
                                                            <span className="flex-1 truncate text-gray-800 font-medium">
                                                                {section.title || SECTION_DEFAULTS[section.type]?.title || section.type}
                                                            </span>
                                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                                                                <button onClick={() => moveSection(section.id, 'up')} disabled={globalIdx === 0} className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30">
                                                                    <ArrowUp className="w-3 h-3 text-gray-400" />
                                                                </button>
                                                                <button onClick={() => moveSection(section.id, 'down')} disabled={globalIdx === sections.length - 1} className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30">
                                                                    <ArrowDown className="w-3 h-3 text-gray-400" />
                                                                </button>
                                                                <button onClick={() => updateSection(section.id, { enabled: !section.enabled })} className="p-0.5 rounded hover:bg-gray-200">
                                                                    {section.enabled ? <Eye className="w-3 h-3 text-green-600" /> : <EyeOff className="w-3 h-3 text-gray-400" />}
                                                                </button>
                                                                <button onClick={() => removeSection(section.id)} className="p-0.5 rounded hover:bg-red-100">
                                                                    <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                    {sections.length === 0 && (
                                        <div className="text-center py-8 px-4 text-gray-400">
                                            <Layers className="w-6 h-6 mx-auto mb-2 opacity-50" />
                                            <p className="text-xs">No sections yet.<br />Click + or choose a theme.</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        {sidebarCollapsed && (
                            <button onClick={() => setSidebarCollapsed(false)} className="p-3 hover:bg-gray-200 transition-colors">
                                <ChevronRight className="w-4 h-4 text-gray-400 mx-auto" />
                            </button>
                        )}
                    </div>

                    {/* ─── Center: Section Editor ─── */}
                    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
                        {selectedSection ? (
                            <div className="max-w-3xl mx-auto space-y-6">
                                {/* Section Type Badge */}
                                <div className="flex items-center gap-2">
                                    {(() => { const Icon = getTypeIcon(selectedSection.type); return <Icon className="w-5 h-5" style={{ color: primaryColor }} />; })()}
                                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{SECTION_TYPES.find(s => s.type === selectedSection.type)?.label || selectedSection.type}</span>
                                    {(() => {
                                        const group = getSectionGroup(selectedSection.type);
                                        return group ? <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">{group.name}</span> : null;
                                    })()}
                                    <button onClick={() => updateSection(selectedSection.id, { enabled: !selectedSection.enabled })}
                                        className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${selectedSection.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {selectedSection.enabled ? 'Visible' : 'Hidden'}
                                    </button>
                                </div>

                                {/* Title */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Section Title</label>
                                    <input type="text" value={selectedSection.title}
                                        onChange={e => updateSection(selectedSection.id, { title: e.target.value })}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                                </div>

                                {/* Description */}
                                {!['faq', 'testimonials', 'hours'].includes(selectedSection.type) && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                                        <textarea value={selectedSection.content}
                                            onChange={e => updateSection(selectedSection.id, { content: e.target.value })}
                                            rows={4}
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none" />
                                    </div>
                                )}

                                {/* CTA Fields */}
                                {selectedSection.type === 'cta' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Button Text</label>
                                            <input type="text" value={selectedSection.ctaText || ''} placeholder="Book Now"
                                                onChange={e => updateSection(selectedSection.id, { ctaText: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Button Link</label>
                                            <input type="text" value={selectedSection.ctaLink || ''} placeholder="#book"
                                                onChange={e => updateSection(selectedSection.id, { ctaLink: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500" />
                                        </div>
                                    </div>
                                )}

                                {/* Sub-items Editor */}
                                {hasItems(selectedSection.type) && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-medium text-gray-700">{getItemLabel(selectedSection.type).plural}</label>
                                            <button onClick={() => addItem(selectedSection.id, selectedSection)}
                                                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                                                style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}>
                                                <Plus className="w-3 h-3" /> Add {getItemLabel(selectedSection.type).singular}
                                            </button>
                                        </div>

                                        {(selectedSection.items || []).map((item, idx) => {
                                            const labels = getItemLabel(selectedSection.type);
                                            return (
                                                <div key={item.id} className="bg-white rounded-xl p-4 border border-gray-200 space-y-3 group relative">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-400 font-mono w-6">{idx + 1}.</span>
                                                        <input type="text" value={item.title} placeholder={labels.titlePlaceholder}
                                                            onChange={e => updateItem(selectedSection.id, item.id, { title: e.target.value })}
                                                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500" />
                                                        <button onClick={() => removeItem(selectedSection.id, item.id)}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    {selectedSection.type !== 'gallery' && labels.contentPlaceholder && (
                                                        <textarea value={item.content} placeholder={labels.contentPlaceholder}
                                                            onChange={e => updateItem(selectedSection.id, item.id, { content: e.target.value })}
                                                            rows={2}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500" />
                                                    )}

                                                    {selectedSection.type === 'testimonials' && (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs text-gray-400 mr-2">Rating:</span>
                                                            {[1, 2, 3, 4, 5].map(star => (
                                                                <button key={star} onClick={() => updateItem(selectedSection.id, item.id, { rating: star })} className="hover:scale-110 transition-transform">
                                                                    <Star className="w-5 h-5"
                                                                        fill={star <= (item.rating || 5) ? '#f59e0b' : 'none'}
                                                                        stroke={star <= (item.rating || 5) ? '#f59e0b' : '#d1d5db'} />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {['gallery', 'team', 'beforeAfter'].includes(selectedSection.type) && (
                                                        <div>
                                                            {item.imageUrl ? (
                                                                <div className="relative group/img inline-block">
                                                                    <img src={item.imageUrl} alt={item.title} className="h-24 w-auto object-cover rounded-lg" />
                                                                    <button onClick={() => updateItem(selectedSection.id, item.id, { imageUrl: '' })}
                                                                        className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity shadow">
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <label className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 text-gray-500 text-xs transition-colors">
                                                                    <ImageIcon className="w-4 h-4" /> Upload Image
                                                                    <input type="file" className="hidden" accept="image/*"
                                                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleItemImageUpload(selectedSection.id, item.id, f); }} />
                                                                </label>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {(!selectedSection.items || selectedSection.items.length === 0) && (
                                            <div className="text-center py-6 bg-white rounded-xl border-2 border-dashed border-gray-200">
                                                <p className="text-sm text-gray-400">No items yet. Click "Add {getItemLabel(selectedSection.type).singular}" to get started.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* ── Section Ideas Panel (empty state) ── */
                            <div className="max-w-3xl mx-auto">
                                <div className="text-center mb-8">
                                    <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" style={{ color: primaryColor }} />
                                    <h3 className="text-lg font-semibold text-gray-700">What would you like to add?</h3>
                                    <p className="text-sm text-gray-400 mt-1">Click any idea below to add it as a section, or use the + button in the sidebar.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {SECTION_IDEAS.map(idea => (
                                        <button key={idea.type + idea.title} onClick={() => addSection(idea.type)}
                                            className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all text-left group">
                                            <span className="text-xl">{idea.emoji}</span>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600">{idea.title}</div>
                                                <div className="text-xs text-gray-400 mt-0.5">{idea.hint}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
