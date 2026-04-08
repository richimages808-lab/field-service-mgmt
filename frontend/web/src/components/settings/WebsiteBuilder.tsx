import React from 'react';
import { Palette, Upload, Type, MessageSquare, LayoutTemplate, Link as LinkIcon, Facebook, Instagram, Globe } from 'lucide-react';
import { CustomerPortalLogin } from '../../pages/portal/CustomerPortalLogin';
import { useAuth } from '../../auth/AuthProvider';

interface WebsiteBuilderProps {
    settings: any;
    onChange: (field: string, value: any) => void;
}

const FONTS = [
    { id: 'Inter', name: 'Inter (Modern)' },
    { id: 'Roboto', name: 'Roboto (Clean)' },
    { id: 'Playfair Display', name: 'Playfair (Elegant)' },
    { id: 'Outfit', name: 'Outfit (Geometric)' }
];

export const WebsiteBuilder: React.FC<WebsiteBuilderProps> = ({ settings, onChange }) => {
    const { organization } = useAuth();
    
    // Create a mock organization for the live preview
    const previewOrg = {
        id: 'preview',
        name: settings.name || 'Your Company',
        slug: 'preview',
        branding: {
            primaryColor: settings.primaryColor || '#3B82F6',
            secondaryColor: settings.secondaryColor || '#1e3a8a',
            logoUrl: settings.logoUrl,
            companyName: settings.name,
            heroImageUrl: settings.heroImageUrl,
            fontFamily: settings.fontFamily || 'Inter',
            welcomeMessage: settings.welcomeMessage,
            socialLinks: {
                facebook: settings.socialFacebook,
                instagram: settings.socialInstagram,
                yelp: settings.socialYelp,
                website: settings.socialWebsite
            }
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Controls */}
            <div className="flex-1 space-y-8 max-w-xl">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                        Website Builder
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">Customize how your company portal appears to your customers.</p>
                </div>

                {/* 1. Imagery */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Upload className="w-4 h-4 text-gray-400" />
                        Logos & Imagery
                    </h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo URL</label>
                        <input
                            type="text"
                            value={settings.logoUrl}
                            onChange={(e) => onChange('logoUrl', e.target.value)}
                            placeholder="https://example.com/logo.png"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Hero Background Image URL</label>
                        <input
                            type="text"
                            value={settings.heroImageUrl || ''}
                            onChange={(e) => onChange('heroImageUrl', e.target.value)}
                            placeholder="https://images.unsplash.com/photo-..."
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                        />
                        <p className="text-xs text-gray-500 mt-1.5">A high-quality background image for the login split-screen.</p>
                    </div>
                </div>

                {/* 2. Colors & Typography */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
                    <div className="flex items-center gap-2 border-b pb-3">
                        <Palette className="w-4 h-4 text-gray-400" />
                        <h3 className="font-semibold text-gray-900">Colors & Typography</h3>
                    </div>
                    
                    <div className="flex gap-6">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={settings.primaryColor}
                                    onChange={(e) => onChange('primaryColor', e.target.value)}
                                    className="h-10 w-14 border border-gray-200 rounded cursor-pointer shrink-0"
                                />
                                <input
                                    type="text"
                                    value={settings.primaryColor}
                                    onChange={(e) => onChange('primaryColor', e.target.value)}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={settings.secondaryColor || '#ffffff'}
                                    onChange={(e) => onChange('secondaryColor', e.target.value)}
                                    className="h-10 w-14 border border-gray-200 rounded cursor-pointer shrink-0"
                                />
                                <input
                                    type="text"
                                    value={settings.secondaryColor || '#ffffff'}
                                    onChange={(e) => onChange('secondaryColor', e.target.value)}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                            <Type className="w-4 h-4" /> Font Family
                        </label>
                        <select
                            value={settings.fontFamily || 'Inter'}
                            onChange={(e) => onChange('fontFamily', e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        >
                            {FONTS.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 3. Messaging & Social */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                        Messaging & Social
                    </h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Message</label>
                        <textarea
                            value={settings.welcomeMessage || ''}
                            onChange={(e) => onChange('welcomeMessage', e.target.value)}
                            rows={3}
                            placeholder="Welcome to our customer portal!"
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
                        />
                    </div>

                    <div className="space-y-3 pt-2">
                        <label className="block text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <LinkIcon className="w-4 h-4" /> Social Links
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Globe className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    value={settings.socialWebsite || ''}
                                    onChange={(e) => onChange('socialWebsite', e.target.value)}
                                    placeholder="https://yourwebsite.com"
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Facebook className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    value={settings.socialFacebook || ''}
                                    onChange={(e) => onChange('socialFacebook', e.target.value)}
                                    placeholder="https://facebook.com/yourpage"
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Instagram className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    value={settings.socialInstagram || ''}
                                    onChange={(e) => onChange('socialInstagram', e.target.value)}
                                    placeholder="https://instagram.com/yourpage"
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Live Preview */}
            <div className="flex-1 lg:max-w-[500px]">
                <div className="sticky top-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 border-b-2 border-indigo-500 pb-1 inline-block">Live Preview</h3>
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                            Real-time
                        </span>
                    </div>
                    
                    {/* The Device Frame */}
                    <div className="bg-gray-900 rounded-3xl p-3 shadow-2xl border-4 border-gray-800">
                        <div className="bg-white rounded-2xl overflow-hidden h-[700px] relative">
                            {/* We instantiate the actual Login component and pass it the mocked org to force branding render without backend call */}
                            <CustomerPortalLogin previewOverride={previewOrg} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
