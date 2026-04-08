import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { Globe, Mail, Phone, Settings, Sparkles, Smartphone, Bot, ExternalLink, Image as ImageIcon, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

export const CommunicationsPortal: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [generatingContent, setGeneratingContent] = useState(false);
    const [aiDesignPrompt, setAiDesignPrompt] = useState('');
    const [designingSite, setDesigningSite] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [logoUrl, setLogoUrl] = useState('');
    const orgId = user?.org_id;
    const functions = getFunctions();
    const storage = getStorage();

    const [communicationChannels, setCommunicationChannels] = useState({
        contactEmail: '',
        contactPhone: '',
        teamCellNumbers: [] as string[]
    });

    const [portalConfig, setPortalConfig] = useState({
        slug: '',
        themeColor: '#4F46E5',
        isActive: false,
        sections: [
            { type: 'hero', title: 'Welcome to Our Service', content: 'We provide top-notch technical services.' },
            { type: 'about', title: 'About Us', content: '' },
            { type: 'services', title: 'Our Services', content: '' }
        ]
    });

    const [newCellNumber, setNewCellNumber] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            if (!orgId) return;
            try {
                const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                if (orgDoc.exists()) {
                    const data = orgDoc.data();
                    if (data.communicationChannels) {
                        setCommunicationChannels(data.communicationChannels);
                    }
                    if (data.portalConfig) {
                        setPortalConfig(data.portalConfig);
                    }
                    if (data.branding?.logoUrl) {
                        setLogoUrl(data.branding.logoUrl);
                    }
                }
            } catch (error) {
                console.error("Error fetching org settings:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [orgId]);

    const handleSave = async () => {
        if (!orgId) return;
        setSaving(true);
        try {
            const saveSettings = httpsCallable(functions, 'savePortalSettings');
            await saveSettings({
                orgId,
                communicationChannels,
                portalConfig
            });
            toast.success('Settings saved successfully');
        } catch (error: any) {
            console.error("Error saving settings:", error);
            toast.error(error.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateContent = async () => {
        if (!orgId) return;
        setGeneratingContent(true);
        try {
            // Get business name from org profile
            const orgDoc = await getDoc(doc(db, 'organizations', orgId));
            const businessName = orgDoc.data()?.name || 'Our Business';

            const generateContent = httpsCallable(functions, 'generatePortalContent');
            const result = await generateContent({
                orgId,
                businessName,
                industry: 'Home Services / Technical Repair', // Default for now
                services: ['General Diagnosis', 'Repair Services', 'Maintenance']
            });

            const aiContent = (result.data as any).content;

            // Update sections with AI content
            setPortalConfig(prev => {
                const newSections = [...prev.sections];
                const aboutIndex = newSections.findIndex(s => s.type === 'about');
                if (aboutIndex >= 0) {
                    newSections[aboutIndex] = {
                        ...newSections[aboutIndex],
                        title: aiContent.aboutUsTitle,
                        content: aiContent.aboutUsContent
                    };
                }

                const servicesIndex = newSections.findIndex(s => s.type === 'services');
                if (servicesIndex >= 0) {
                    newSections[servicesIndex] = {
                        ...newSections[servicesIndex],
                        title: aiContent.servicesTitle,
                        content: aiContent.servicesContent
                    };
                }

                return { ...prev, sections: newSections };
            });

            toast.success('AI Content generated successfully!');
        } catch (error: any) {
            console.error("Error generating content:", error);
            toast.error(error.message || 'Failed to generate AI content');
        } finally {
            setGeneratingContent(false);
        }
    };

    const handleDesignSite = async () => {
        if (!orgId || !aiDesignPrompt.trim()) return;
        setDesigningSite(true);
        try {
            // Get business name from org profile
            const orgDoc = await getDoc(doc(db, 'organizations', orgId));
            const businessName = orgDoc.data()?.name || 'Our Business';

            const designPortalWithAI = httpsCallable(functions, 'designPortalWithAI');
            const result = await designPortalWithAI({
                orgId,
                prompt: aiDesignPrompt,
                businessName,
                industry: 'Home Services / Technical Repair'
            });

            const aiDesign = (result.data as any).design;

            setPortalConfig(prev => {
                const newSections = [...prev.sections];

                // Update Hero
                const heroIndex = newSections.findIndex(s => s.type === 'hero');
                if (heroIndex >= 0 && aiDesign.hero) {
                    newSections[heroIndex] = { ...newSections[heroIndex], title: aiDesign.hero.title, content: aiDesign.hero.content };
                }

                // Update About
                const aboutIndex = newSections.findIndex(s => s.type === 'about');
                if (aboutIndex >= 0 && aiDesign.about) {
                    newSections[aboutIndex] = { ...newSections[aboutIndex], title: aiDesign.about.title, content: aiDesign.about.content };
                }

                // Update Services
                const servicesIndex = newSections.findIndex(s => s.type === 'services');
                if (servicesIndex >= 0 && aiDesign.services) {
                    newSections[servicesIndex] = { ...newSections[servicesIndex], title: aiDesign.services.title, content: aiDesign.services.content };
                }

                return {
                    ...prev,
                    themeColor: aiDesign.themeColor || prev.themeColor,
                    sections: newSections
                };
            });

            setAiDesignPrompt('');
            toast.success('AI site design applied! Review and click Save.');
        } catch (error: any) {
            console.error("Error designing site:", error);
            toast.error(error.message || 'Failed to design site');
        } finally {
            setDesigningSite(false);
        }
    };

    const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !orgId) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error('File too large (max 5MB)');
            return;
        }

        setUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `logo-${uuidv4()}.${fileExt}`;
            const storageRef = ref(storage, `organizations/${orgId}/${fileName}`);

            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            await updateDoc(doc(db, 'organizations', orgId), {
                'branding.logoUrl': downloadUrl
            });

            setLogoUrl(downloadUrl);
            toast.success('Logo uploaded successfully');
        } catch (error) {
            console.error('Error uploading logo:', error);
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    const addCellNumber = () => {
        if (!newCellNumber.trim()) return;
        setCommunicationChannels(prev => ({
            ...prev,
            teamCellNumbers: [...prev.teamCellNumbers, newCellNumber.trim()]
        }));
        setNewCellNumber('');
    };

    const removeCellNumber = (index: number) => {
        setCommunicationChannels(prev => {
            const newNumbers = [...prev.teamCellNumbers];
            newNumbers.splice(index, 1);
            return { ...prev, teamCellNumbers: newNumbers };
        });
    };

    const updateSection = (index: number, field: string, value: string) => {
        setPortalConfig(prev => {
            const newSections = [...prev.sections];
            newSections[index] = { ...newSections[index], [field]: value };
            return { ...prev, sections: newSections };
        });
    };

    if (loading) return <div className="p-8">Loading Communications Hub...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                        <Globe className="w-8 h-8 text-blue-600" />
                        Communications Hub
                    </h1>
                    <p className="text-gray-600 mt-2">Manage your public portal, team SMS routing, and automated agents in one place.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </header>

            {/* Quick Links / Integrations overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="p-3 bg-violet-100 text-violet-600 rounded-lg">
                        <Bot className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">AI Phone Agent</h3>
                        <p className="text-sm text-gray-500 mb-3">Configure Gemini-powered voice agent to answer calls 24/7.</p>
                        <Link to="/admin/ai-phone-agent" className="text-violet-600 font-medium text-sm flex items-center gap-1 hover:text-violet-700">
                            Manage AI Agent <ExternalLink className="w-4 h-4" />
                        </Link>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-start gap-4 hover:shadow-md transition-shadow">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                        <Smartphone className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">Business Phone / SMS</h3>
                        <p className="text-sm text-gray-500 mb-3">Provision numbers and configure inbound SMS responses.</p>
                        <Link to="/admin/texting" className="text-emerald-600 font-medium text-sm flex items-center gap-1 hover:text-emerald-700">
                            Manage Phone Services <ExternalLink className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Comms & Portal Settings */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Mail className="w-5 h-5 text-gray-500" />
                            Email & Phone Routing
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Public Support Email</label>
                                <input
                                    type="email"
                                    value={communicationChannels.contactEmail}
                                    onChange={e => setCommunicationChannels(prev => ({ ...prev, contactEmail: e.target.value }))}
                                    className="w-full px-3 py-2 border rounded-md"
                                    placeholder="support@yourbusiness.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Public Support Phone</label>
                                <input
                                    type="tel"
                                    value={communicationChannels.contactPhone}
                                    onChange={e => setCommunicationChannels(prev => ({ ...prev, contactPhone: e.target.value }))}
                                    className="w-full px-3 py-2 border rounded-md"
                                    placeholder="(555) 123-4567"
                                />
                                <p className="text-xs text-gray-500 mt-1">This should ideally be your Twilio/Vapi business number.</p>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Team Cell Phones (Alerts & Routing)</label>
                                <div className="space-y-2 mb-2">
                                    {communicationChannels.teamCellNumbers.map((num, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                            <span className="text-sm">{num}</span>
                                            <button onClick={() => removeCellNumber(idx)} className="text-red-500 text-sm hover:text-red-700">Remove</button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="tel"
                                        value={newCellNumber}
                                        onChange={e => setNewCellNumber(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && addCellNumber()}
                                        className="flex-1 px-3 py-2 border rounded-md text-sm"
                                        placeholder="Add mobile e.g. 555-123-4567"
                                    />
                                    <button onClick={addCellNumber} className="bg-gray-100 px-3 py-2 rounded border border-gray-300 text-sm font-medium hover:bg-gray-200">
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-gray-500" />
                            Portal Settings
                        </h2>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Enable Public Portal</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={portalConfig.isActive}
                                        onChange={e => setPortalConfig(prev => ({ ...prev, isActive: e.target.checked }))}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Custom URL Slug</label>
                                <div className="flex items-center">
                                    <span className="bg-gray-100 border border-r-0 border-gray-300 px-3 py-2 rounded-l-md text-gray-500 text-sm">/p/</span>
                                    <input
                                        type="text"
                                        value={portalConfig.slug}
                                        onChange={e => setPortalConfig(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                        className="w-full px-3 py-2 border rounded-r-md outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        placeholder="my-business-name"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Only letters, numbers, and hyphens.</p>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
                                <div className="flex items-center gap-4">
                                    <div className="h-16 w-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {logoUrl ? (
                                            <img src={logoUrl} alt="Company Logo" className="h-full w-full object-contain p-1" />
                                        ) : (
                                            <ImageIcon className="w-6 h-6 text-gray-400" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <label className="relative cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 inline-block">
                                            <span className="flex items-center gap-2">
                                                <Upload className="w-4 h-4" />
                                                {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                                            </span>
                                            <input
                                                type="file"
                                                className="sr-only"
                                                accept="image/*"
                                                onChange={handleLogoUpload}
                                                disabled={uploadingLogo}
                                            />
                                        </label>
                                        <p className="mt-1 text-xs text-gray-500">PNG, JPG up to 5MB.</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">Brand Theme Color</label>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="color"
                                        value={portalConfig.themeColor}
                                        onChange={e => setPortalConfig(prev => ({ ...prev, themeColor: e.target.value }))}
                                        className="h-10 w-10 cursor-pointer border-0 rounded p-0"
                                    />
                                    <input
                                        type="text"
                                        value={portalConfig.themeColor}
                                        onChange={e => setPortalConfig(prev => ({ ...prev, themeColor: e.target.value }))}
                                        className="w-full px-3 py-2 border rounded-md"
                                    />
                                </div>
                            </div>

                            {portalConfig.isActive && portalConfig.slug && (
                                <div className="pt-4">
                                    <a
                                        href={"/p/" + portalConfig.slug}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="block w-full text-center bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors"
                                    >
                                        View Public Portal
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Portal Content Builder */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-800">Dynamic Website Content</h2>
                            <button
                                onClick={handleGenerateContent}
                                disabled={generatingContent || designingSite}
                                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-600 text-white px-4 py-2 justify-center rounded-lg font-medium hover:from-blue-700 hover:to-blue-700 disabled:opacity-50 transition-all shadow-sm"
                            >
                                <Sparkles className="w-4 h-4" />
                                {generatingContent ? 'Generating Format...' : 'AI Auto-Write'}
                            </button>
                        </div>

                        {/* Conversational AI Site Designer */}
                        <div className="p-6 border-b border-gray-100 bg-blue-50/30">
                            <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                                <Bot className="w-4 h-4" /> AI Site Designer
                            </h3>
                            <p className="text-sm text-gray-600 mb-3">
                                Describe how you want your site to look and feel, and our AI will generate the perfect colors and website copy.
                            </p>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={aiDesignPrompt}
                                    onChange={(e) => setAiDesignPrompt(e.target.value)}
                                    placeholder="e.g. Make it dark mode and focus on luxury plumbing services..."
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    onKeyPress={(e) => e.key === 'Enter' && handleDesignSite()}
                                />
                                <button
                                    onClick={handleDesignSite}
                                    disabled={designingSite || !aiDesignPrompt.trim()}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors whitespace-nowrap"
                                >
                                    {designingSite ? 'Designing...' : 'Apply AI Design'}
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {portalConfig.sections.map((section, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                        <span className="font-semibold text-gray-700 uppercase tracking-wider text-xs">{section.type} SECTION</span>
                                    </div>
                                    <div className="p-4 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                                            <input
                                                type="text"
                                                value={section.title}
                                                onChange={e => updateSection(idx, 'title', e.target.value)}
                                                className="w-full px-3 py-2 border rounded-md text-gray-800 font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Content Body</label>
                                            <textarea
                                                value={section.content}
                                                onChange={e => updateSection(idx, 'content', e.target.value)}
                                                className="w-full px-3 py-2 border rounded-md h-32"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
