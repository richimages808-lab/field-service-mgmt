import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught component error:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[50vh] flex items-center justify-center p-6 bg-slate-50">
                    <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-6 text-center space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">
                                {this.props.fallbackTitle || 'Something went wrong'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">
                                An unexpected issue occurred while loading this view. You can reload or return to safety.
                            </p>
                        </div>

                        {this.state.error && (
                            <pre className="p-3 rounded-xl bg-slate-900 text-red-300 text-[11px] font-mono text-left overflow-x-auto max-h-36">
                                {this.state.error.message || String(this.state.error)}
                            </pre>
                        )}

                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all"
                            >
                                Try Again
                            </button>
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Reload Page
                            </button>
                            <a
                                href="/island-flow-plumbing/inventory/trackers"
                                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                            >
                                <Home className="w-3.5 h-3.5" /> Trackers Home
                            </a>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
