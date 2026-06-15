import React, { useState, useRef } from 'react';
import {
    ArrowLeft, Download, Image as ImageIcon, ChevronDown, ChevronUp,
    Clock, Lightbulb, ZoomIn, X, FileText, BookOpen
} from 'lucide-react';
import type { HelpArticle, HelpCategory } from '../lib/helpContent';
import { HELP_CATEGORIES } from '../lib/helpContent';
import { exportHelpArticlePDF, exportHelpArticleImage } from '../utils/helpExport';

interface HelpArticleViewerProps {
    article: HelpArticle;
    onBack: () => void;
}

export const HelpArticleViewer: React.FC<HelpArticleViewerProps> = ({ article, onBack }) => {
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [exporting, setExporting] = useState<'pdf' | 'image' | null>(null);
    const articleRef = useRef<HTMLDivElement>(null);

    const category = HELP_CATEGORIES.find(c => c.id === article.category);
    const hasSteps = article.steps && article.steps.length > 0;

    const handlePDFExport = async () => {
        setExporting('pdf');
        try {
            await exportHelpArticlePDF(article);
        } catch (err) {
            console.error('PDF export failed:', err);
        }
        setExporting(null);
    };

    const handleImageExport = async () => {
        setExporting('image');
        try {
            await exportHelpArticleImage('help-article-content', article.title);
        } catch (err) {
            console.error('Image export failed:', err);
        }
        setExporting(null);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Lightbox Modal */}
            {zoomedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-pointer"
                    onClick={() => setZoomedImage(null)}
                >
                    <button
                        onClick={() => setZoomedImage(null)}
                        className="absolute top-6 right-6 text-white/80 hover:text-white transition z-50 flex items-center gap-2"
                    >
                        <span className="text-sm">Close</span>
                        <X className="w-6 h-6" />
                    </button>
                    <img
                        src={zoomedImage}
                        alt="Zoomed screenshot"
                        className="max-w-[92vw] max-h-[88vh] rounded-xl shadow-2xl border-2 border-white/10 object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Hero Header */}
            <div className="bg-gradient-to-br from-blue-700 via-amber-700 to-blue-800 text-white">
                <div className="max-w-5xl mx-auto px-4 py-8">
                    {/* Back button */}
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-blue-200 hover:text-white transition mb-4 text-sm font-medium group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Back to Help Center
                    </button>

                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                            {/* Category badge */}
                            {category && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold text-white/90 mb-3">
                                    <BookOpen className="w-3 h-3" />
                                    {category.name}
                                </span>
                            )}
                            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{article.title}</h1>
                            <div className="flex items-center gap-4 mt-3 text-blue-200 text-sm">
                                <span className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5" />
                                    Updated {article.lastUpdated}
                                </span>
                                {hasSteps && (
                                    <span className="flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5" />
                                        {article.steps!.length} steps
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Export buttons */}
                        <div className="flex gap-2 flex-shrink-0">
                            <button
                                onClick={handlePDFExport}
                                disabled={exporting !== null}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-medium transition border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Download className="w-4 h-4" />
                                {exporting === 'pdf' ? 'Generating...' : 'Download PDF'}
                            </button>
                            <button
                                onClick={handleImageExport}
                                disabled={exporting !== null}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm font-medium transition border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ImageIcon className="w-4 h-4" />
                                {exporting === 'image' ? 'Capturing...' : 'Save as Image'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Article Content */}
            <div className="max-w-5xl mx-auto px-4 py-8">
                <div
                    id="help-article-content"
                    ref={articleRef}
                    className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden"
                >
                    {hasSteps ? (
                        /* ── Visual Step Guide ── */
                        <div className="divide-y divide-gray-100">
                            {/* Overview section from content */}
                            {article.content && (
                                <div className="p-6 sm:p-8 bg-gradient-to-b from-blue-50/50 to-white">
                                    <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <BookOpen className="w-5 h-5 text-blue-600" />
                                        Overview
                                    </h2>
                                    <div className="text-gray-700 leading-relaxed whitespace-pre-line text-[15px]">
                                        {renderFormattedContent(article.content)}
                                    </div>
                                </div>
                            )}

                            {/* Step-by-step guide */}
                            {article.steps!.map((step, idx) => (
                                <StepCard
                                    key={step.stepNumber}
                                    step={step}
                                    isLast={idx === article.steps!.length - 1}
                                    onZoomImage={setZoomedImage}
                                />
                            ))}
                        </div>
                    ) : (
                        /* ── Plain text fallback ── */
                        <div className="p-6 sm:p-8">
                            <div className="prose prose-blue max-w-none text-gray-700 whitespace-pre-line leading-relaxed">
                                {renderFormattedContent(article.content)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ── Step Card Component ── */
interface StepCardProps {
    step: import('../lib/helpContent').HelpStep;
    isLast: boolean;
    onZoomImage: (url: string) => void;
}

const StepCard: React.FC<StepCardProps> = ({ step, isLast, onZoomImage }) => {
    return (
        <div className="p-6 sm:p-8 hover:bg-gray-50/50 transition-colors">
            <div className="flex gap-4 sm:gap-6">
                {/* Step number badge */}
                <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md shadow-blue-200">
                        <span className="text-white font-bold text-sm">{step.stepNumber}</span>
                    </div>
                    {/* Connector line */}
                    {!isLast && (
                        <div className="w-0.5 h-full bg-blue-100 mx-auto mt-2 min-h-[20px]" />
                    )}
                </div>

                <div className="flex-1 min-w-0 -mt-1">
                    {/* Step title */}
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>

                    {/* Step description */}
                    <p className="text-gray-600 leading-relaxed mb-4 text-[15px]">
                        {step.description}
                    </p>

                    {/* Screenshot */}
                    {step.screenshotUrl && (
                        <div
                            className="relative group mb-4 cursor-pointer rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300"
                            onClick={() => onZoomImage(step.screenshotUrl!)}
                        >
                            <img
                                src={step.screenshotUrl}
                                alt={`Step ${step.stepNumber}: ${step.title}`}
                                className="w-full h-auto block"
                                loading="lazy"
                            />
                            {/* Zoom overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg">
                                    <ZoomIn className="w-5 h-5 text-blue-600" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pro tip callout */}
                    {step.tip && (
                        <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200/60">
                            <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Pro Tip</span>
                                <p className="text-amber-900 text-sm mt-0.5 leading-relaxed">{step.tip}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ── Simple markdown-like renderer for content strings ── */
function renderFormattedContent(content: string): React.ReactNode {
    // Replace escaped newlines
    const text = content.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');

    // Split by lines and process
    return text.split('\n').map((line, i) => {
        // Bold: **text**
        const parts = line.split(/\*\*(.*?)\*\*/g);
        const rendered = parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="font-semibold text-gray-900">{part}</strong> : part
        );

        // Heading: lines starting with ## or ###
        if (line.startsWith('### ')) {
            return <h4 key={i} className="text-base font-bold text-gray-900 mt-4 mb-1">{line.replace(/^### /, '')}</h4>;
        }
        if (line.startsWith('## ')) {
            return <h3 key={i} className="text-lg font-bold text-gray-900 mt-5 mb-2">{line.replace(/^## /, '')}</h3>;
        }

        // Numbered list
        if (/^\d+\.\s/.test(line)) {
            return <div key={i} className="ml-2 mb-1">{rendered}</div>;
        }

        // Bullet
        if (line.startsWith('- ') || line.startsWith('• ')) {
            return <div key={i} className="ml-4 mb-1 flex gap-2"><span className="text-blue-400">•</span><span>{rendered}</span></div>;
        }

        // Table rows (simple detection)
        if (line.startsWith('|') && line.endsWith('|')) {
            return <div key={i} className="font-mono text-xs text-gray-600 bg-gray-50 px-2 py-0.5">{line}</div>;
        }

        // Q&A
        if (line.startsWith('**Q:')) {
            return <div key={i} className="mt-3 font-semibold text-gray-800">{rendered}</div>;
        }
        if (line.startsWith('**A:')) {
            return <div key={i} className="mb-2 text-gray-600">{rendered}</div>;
        }

        // Empty line = paragraph break
        if (line.trim() === '') {
            return <div key={i} className="h-3" />;
        }

        return <div key={i} className="mb-0.5">{rendered}</div>;
    });
}
