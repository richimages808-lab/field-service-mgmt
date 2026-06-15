import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import {
    Search, Book, Play, ChevronDown, ChevronRight, Clock, ExternalLink,
    Rocket, Calendar, FileText, Package, Users, BarChart2, CreditCard,
    Puzzle, HelpCircle, ArrowLeft, X, Video, Eye
} from 'lucide-react';
import { HELP_CATEGORIES, HELP_ARTICLES, DEFAULT_HELP_VIDEOS, HelpArticle, HelpVideo } from '../lib/helpContent';
import { HelpArticleViewer } from '../components/HelpArticleViewer';

const CATEGORY_ICONS: Record<string, React.FC<any>> = {
    Rocket, Calendar, FileText, Package, Users, BarChart2, CreditCard, Puzzle,
};

export const HelpCenter: React.FC = () => {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
    const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
    const [activeTab, setActiveTab] = useState<'docs' | 'videos'>('docs');
    const [videos, setVideos] = useState<HelpVideo[]>(DEFAULT_HELP_VIDEOS);
    const [playingVideo, setPlayingVideo] = useState<HelpVideo | null>(null);

    // Load videos from Firestore (if any exist, merge with defaults)
    useEffect(() => {
        const loadVideos = async () => {
            try {
                const orgId = (user as any)?.organizationId;
                if (!orgId) return;
                const snap = await getDocs(query(collection(db, 'help_videos'), orderBy('title')));
                if (!snap.empty) {
                    const firestoreVideos = snap.docs.map(d => ({ id: d.id, ...d.data() } as HelpVideo));
                    setVideos(firestoreVideos);
                }
            } catch {
                // Fall back to defaults silently
            }
        };
        loadVideos();
    }, [user]);

    // Close video modal on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPlayingVideo(null);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // Search filtering
    const filteredArticles = useMemo(() => {
        let articles = HELP_ARTICLES;
        if (activeCategory) {
            articles = articles.filter(a => a.category === activeCategory);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            articles = articles.filter(a =>
                a.title.toLowerCase().includes(q) ||
                a.content.toLowerCase().includes(q) ||
                a.keywords.some(k => k.toLowerCase().includes(q))
            );
        }
        return articles;
    }, [searchQuery, activeCategory]);

    const filteredVideos = useMemo(() => {
        let vids = videos;
        if (activeCategory) {
            vids = vids.filter(v => v.category === activeCategory);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            vids = vids.filter(v =>
                v.title.toLowerCase().includes(q) ||
                v.description.toLowerCase().includes(q)
            );
        }
        return vids;
    }, [searchQuery, activeCategory, videos]);

    const groupedArticles = useMemo(() => {
        const groups: Record<string, HelpArticle[]> = {};
        filteredArticles.forEach(a => {
            if (!groups[a.category]) groups[a.category] = [];
            groups[a.category].push(a);
        });
        return groups;
    }, [filteredArticles]);

    // If an article is selected, show the full viewer
    if (selectedArticle) {
        return (
            <HelpArticleViewer
                article={selectedArticle}
                onBack={() => setSelectedArticle(null)}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Video Player Modal */}
            {playingVideo && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setPlayingVideo(null)}
                >
                    <div
                        className="relative w-full max-w-5xl mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setPlayingVideo(null)}
                            className="absolute -top-12 right-0 text-white/80 hover:text-white transition flex items-center gap-2 text-sm"
                        >
                            <span>Close</span>
                            <X className="w-5 h-5" />
                        </button>

                        {/* Video title */}
                        <div className="mb-4">
                            <h3 className="text-white text-xl font-bold">{playingVideo.title}</h3>
                            <p className="text-white/60 text-sm mt-1">{playingVideo.description}</p>
                        </div>

                        {/* Video container */}
                        <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
                            <img
                                src={playingVideo.videoUrl}
                                alt={playingVideo.title}
                                className="w-full h-auto"
                                style={{ imageRendering: 'auto' }}
                            />
                        </div>

                        {/* Narration script below video */}
                        <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-4 max-h-48 overflow-y-auto">
                            <p className="text-white/50 text-xs uppercase tracking-wide font-semibold mb-2">
                                📝 Narration Script — Use with ElevenLabs or Google Vids
                            </p>
                            <p className="text-white/80 text-sm leading-relaxed">
                                {getNarrationScript(playingVideo.id)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Hero Header */}
            <div className="bg-gradient-to-br from-blue-700 via-amber-700 to-blue-800 text-white">
                <div className="max-w-5xl mx-auto px-4 py-12">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                            <HelpCircle className="w-7 h-7" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold">Help Center</h1>
                            <p className="text-blue-200 text-sm">Find answers, watch tutorials, get the most out of DispatchBox</p>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative mt-6 max-w-2xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search help articles and videos..."
                            className="w-full pl-12 pr-10 py-3.5 rounded-xl bg-white/15 backdrop-blur border border-white/20 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/20 transition text-lg"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* Category Pills */}
                    <div className="flex flex-wrap gap-2 mt-6">
                        <button
                            onClick={() => setActiveCategory(null)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${!activeCategory
                                    ? 'bg-white text-blue-700'
                                    : 'bg-white/15 text-white hover:bg-white/25'
                                }`}
                        >
                            All Topics
                        </button>
                        {HELP_CATEGORIES.map(cat => {
                            const Icon = CATEGORY_ICONS[cat.icon] || HelpCircle;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${activeCategory === cat.id
                                            ? 'bg-white text-blue-700'
                                            : 'bg-white/15 text-white hover:bg-white/25'
                                        }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {cat.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="max-w-5xl mx-auto px-4 -mt-4">
                <div className="bg-white rounded-t-xl shadow-lg border border-gray-200">
                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab('docs')}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${activeTab === 'docs'
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Book className="w-4 h-4" />
                            Documentation
                            <span className="ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{filteredArticles.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('videos')}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition ${activeTab === 'videos'
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Video className="w-4 h-4" />
                            Video Tutorials
                            <span className="ml-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{filteredVideos.length}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-5xl mx-auto px-4 pb-12">
                <div className="bg-white rounded-b-xl shadow-lg border border-t-0 border-gray-200 min-h-[400px]">
                    {activeTab === 'docs' ? (
                        <div className="p-6">
                            {filteredArticles.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p className="text-lg font-medium">No articles found</p>
                                    <p className="text-sm mt-1">Try a different search term or category</p>
                                </div>
                            ) : (
                                Object.entries(groupedArticles).map(([catId, articles]) => {
                                    const category = HELP_CATEGORIES.find(c => c.id === catId);
                                    const CatIcon = CATEGORY_ICONS[category?.icon || ''] || HelpCircle;
                                    return (
                                        <div key={catId} className="mb-6 last:mb-0">
                                            <div className="flex items-center gap-2 mb-3">
                                                <CatIcon className="w-5 h-5 text-blue-600" />
                                                <h2 className="text-lg font-bold text-gray-900">{category?.name || catId}</h2>
                                                <span className="text-xs text-gray-400 ml-1">— {category?.description}</span>
                                            </div>
                                            <div className="space-y-1">
                                                {articles.map(article => (
                                                    <div key={article.id} className="border border-gray-100 rounded-lg overflow-hidden hover:border-blue-200 transition">
                                                        <button
                                                            onClick={() => setExpandedArticle(expandedArticle === article.id ? null : article.id)}
                                                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
                                                        >
                                                            <span className="font-medium text-gray-800">{article.title}</span>
                                                            <div className="flex items-center gap-3">
                                                                {article.steps && article.steps.length > 0 && (
                                                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline">
                                                                        {article.steps.length} Steps
                                                                    </span>
                                                                )}
                                                                <span className="text-xs text-gray-400 hidden sm:inline">
                                                                    <Clock className="w-3 h-3 inline mr-1" />
                                                                    {article.lastUpdated}
                                                                </span>
                                                                {expandedArticle === article.id
                                                                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                    : <ChevronRight className="w-4 h-4 text-gray-400" />
                                                                }
                                                            </div>
                                                        </button>
                                                        {expandedArticle === article.id && (
                                                            <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <button
                                                                        onClick={() => setSelectedArticle(article)}
                                                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" />
                                                                        {article.steps && article.steps.length > 0 ? 'View Step-by-Step Guide' : 'View Full Article'}
                                                                    </button>
                                                                </div>
                                                                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line line-clamp-4">
                                                                    {article.content}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        <div className="p-6">
                            {filteredVideos.length === 0 ? (
                                <div className="text-center py-16 text-gray-400">
                                    <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p className="text-lg font-medium">No videos found</p>
                                    <p className="text-sm mt-1">Videos are being produced — check back soon!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredVideos.map(video => {
                                        const category = HELP_CATEGORIES.find(c => c.id === video.category);
                                        const hasVideo = !!video.videoUrl;
                                        return (
                                            <div
                                                key={video.id}
                                                className={`group border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200 ${hasVideo ? 'cursor-pointer' : ''}`}
                                                onClick={() => hasVideo && setPlayingVideo(video)}
                                            >
                                                {/* Thumbnail — show first frame or gradient placeholder */}
                                                <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 h-40 flex items-center justify-center overflow-hidden">
                                                    {hasVideo ? (
                                                        <img
                                                            src={video.videoUrl}
                                                            alt={video.title}
                                                            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                                                        />
                                                    ) : null}
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                            <Play className="w-6 h-6 text-blue-600 ml-0.5" />
                                                        </div>
                                                    </div>
                                                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono">
                                                        {video.duration}
                                                    </span>
                                                    {hasVideo && (
                                                        <span className="absolute top-2 left-2 bg-green-500/90 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                                                            Walkthrough
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="p-4">
                                                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{video.title}</h3>
                                                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{video.description}</p>
                                                    <div className="flex items-center justify-between text-xs text-gray-400">
                                                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                                                            {category?.name || video.category}
                                                        </span>
                                                        <span>Updated {video.lastUpdated}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <div className="flex items-start gap-3">
                                    <Video className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-blue-900">Narrated versions coming soon!</h3>
                                        <p className="text-sm text-blue-700 mt-1">
                                            These walkthroughs currently show silent screen recordings. Professional voiceover narration is being added — check back soon for the full tutorial experience.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Narration scripts for each tutorial video — use with ElevenLabs, Google Vids, or manual voiceover
function getNarrationScript(videoId: string): string {
    const scripts: Record<string, string> = {
        'vid-getting-started': `Welcome to DispatchBox! This is your main dashboard — the command center for your business. At the top, you'll see your key metrics: total revenue, open tickets, and active technicians. Below that, the Revenue Trend chart shows your monthly performance, while the Job Status Distribution gives you a real-time breakdown of where all your work orders stand. On the left is your sidebar — your main navigation. It's organized into logical groups: Work, Financial, Inventory, and People. You can collapse it anytime to get more screen space, or expand it to see the full labels. Let's explore each section.`,

        'vid-create-job': `Creating a new job is easy. Click the blue 'New Job' button at the top of the sidebar — it's always visible no matter where you are in the app. This opens the job creation form. Start by entering a title — something descriptive like 'Water Heater Replacement.' Add details in the description field so your technician knows what to expect on site. You can assign a customer from your contacts, set the priority level, and schedule the job. When you're ready, hit save and the job will appear on your dashboard and calendar.`,

        'vid-calendar': `The Calendar gives you a visual overview of all your scheduled jobs. Use the view toggles at the top to switch between Day, Week, and Month views. Navigate forward and back using the arrow buttons. Jobs show up as colored blocks — you can see the customer name, job title, and assigned technician at a glance. This is your go-to view for managing your team's daily workload and spotting scheduling conflicts.`,

        'vid-invoicing': `The Invoicing section is where you manage your billing. You'll see a list of all invoices with their status — Draft, Sent, Paid, or Overdue. Use the tabs at the top to filter by status. Click on any invoice to see the full details including line items, totals, and payment history. You can create invoices directly from completed jobs, add custom line items, and send them to your customers via email. The search bar at the top helps you quickly find any invoice.`,

        'vid-materials': `Materials Inventory helps you track all your parts and supplies. At the top, you'll see three key metrics: Total Items in stock, items running Low on Stock, and your total Inventory Value. Use the location tabs — All Locations, Truck, Warehouse, At Supplier — to filter by where your materials are stored. The search bar lets you find specific items quickly. Each material shows its category, quantity, location, and cost. You can adjust quantities with the plus and minus buttons right from the list.`,

        'vid-tools': `The Tools section lets you manage all your company equipment. Each tool shows its name, category, current assignment, and condition status. You can track which technician has which tool, when it was last serviced, and whether it needs maintenance. Click the edit button on any tool to update its details. This keeps your expensive equipment accounted for and helps prevent losses.`,

        'vid-customers': `Customer Management is where you keep all your client information organized. Search for any customer by name, email, or phone. Click on a customer to see their full profile — including contact details, service address, job history, and billing information. You can see all past and current jobs for each customer, making it easy to provide personalized service with full context of your relationship.`,
    };
    return scripts[videoId] || 'Narration script coming soon for this tutorial.';
}

