import React, { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import {
    Search, Book, Play, ChevronDown, ChevronRight, Clock, ExternalLink,
    Rocket, Calendar, FileText, Package, Users, BarChart2, CreditCard,
    Puzzle, HelpCircle, ArrowLeft, X, Video
} from 'lucide-react';
import { HELP_CATEGORIES, HELP_ARTICLES, DEFAULT_HELP_VIDEOS, HelpArticle, HelpVideo } from '../lib/helpContent';

const CATEGORY_ICONS: Record<string, React.FC<any>> = {
    Rocket, Calendar, FileText, Package, Users, BarChart2, CreditCard, Puzzle,
};

export const HelpCenter: React.FC = () => {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'docs' | 'videos'>('docs');
    const [videos, setVideos] = useState<HelpVideo[]>(DEFAULT_HELP_VIDEOS);

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

    return (
        <div className="min-h-screen bg-gray-50">
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
                                                                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">
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
                                        return (
                                            <div key={video.id} className="group border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200">
                                                {/* Thumbnail placeholder */}
                                                <div className="relative bg-gradient-to-br from-blue-100 to-amber-100 h-40 flex items-center justify-center">
                                                    <div className="w-16 h-16 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                                        <Play className="w-7 h-7 text-blue-600 ml-1" />
                                                    </div>
                                                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                                                        {video.duration}
                                                    </span>
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
                                        <h3 className="font-semibold text-blue-900">More videos coming soon!</h3>
                                        <p className="text-sm text-blue-700 mt-1">
                                            We're continuously adding new tutorials as we release features. Video content is updated automatically — check back regularly for the latest guides.
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
