import React, { useState, useRef, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MessageSquare, X, Send, User, Bot, Loader2, Sparkles, ChevronDown } from 'lucide-react';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export const SupportChatBot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial greeting
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: 'msg-welcome',
                    role: 'assistant',
                    content: "Hi there! 👋 I'm the DispatchBox AI assistant. I can help answer questions about our platform, features, or pricing. How can I help you today?",
                    timestamp: new Date()
                }
            ]);
            setHasUnread(true);
        }
    }, [messages]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            if (hasUnread) setHasUnread(false);
        }
    }, [messages, isOpen, isTyping, hasUnread]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        
        const trimmedText = inputValue.trim();
        if (!trimmedText || isTyping) return;

        // Add user message
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: trimmedText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsTyping(true);

        try {
            const functions = getFunctions();
            const askPlatformSupport = httpsCallable(functions, 'askPlatformSupport');
            
            // Format history for backend
            const messageHistory = messages.map(m => ({ role: m.role, content: m.content })).concat({ role: 'user', content: trimmedText });

            const result = await askPlatformSupport({ messages: messageHistory }) as any;
            
            const reply = result?.data?.reply || "I'm sorry, I'm having trouble connecting right now. Please try again or email us at sales@dispatchbox.com";
            
            const assistantMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: reply,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMsg]);
            if (!isOpen) setHasUnread(true);

        } catch (error) {
            console.error("Support chat error:", error);
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "I'm sorry, there was a technical error processing your request. Please try again.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
            if (!isOpen) setHasUnread(true);
        } finally {
            setIsTyping(false);
            // Re-focus input explicitly after responding
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    if (!isOpen) {
        return (
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {hasUnread && messages.length > 1 && (
                    <div className="bg-white px-4 py-2 rounded-xl shadow-lg border border-indigo-100 text-sm font-medium text-gray-700 max-w-[250px] animate-bounce-short cursor-pointer" onClick={() => setIsOpen(true)}>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-500" />
                            <span>New response available!</span>
                        </div>
                        <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white border-b border-r border-indigo-100 transform rotate-45"></div>
                    </div>
                )}
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 group relative"
                    aria-label="Open support chat"
                >
                    {hasUnread && (
                        <span className="absolute top-0 right-0 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white"></span>
                        </span>
                    )}
                    <MessageSquare className="w-6 h-6 group-hover:hidden" />
                    <Sparkles className="w-6 h-6 hidden group-hover:block animate-pulse" />
                </button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-200" style={{ height: '550px', maxHeight: 'calc(100vh - 4rem)' }}>
            
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-4 text-white flex items-center gap-3 flex-shrink-0">
                <div className="bg-white/20 p-2 rounded-lg">
                    <MessageSquare className="w-5 h-5 text-indigo-50" />
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-sm leading-tight">Platform Assistant</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <p className="text-xs text-indigo-100 opacity-90">Usually replies instantly</p>
                    </div>
                </div>
                <button 
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                    aria-label="Close chat"
                >
                    <ChevronDown className="w-5 h-5" />
                </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-4">
                {messages.map((msg) => {
                    const isAi = msg.role === 'assistant';
                    return (
                        <div key={msg.id} className={`flex gap-3 max-w-[85%] ${isAi ? 'self-start' : 'self-end flex-row-reverse'}`}>
                            {isAi ? (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-5 h-5 text-indigo-600" />
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                                    <User className="w-5 h-5 text-slate-500" />
                                </div>
                            )}
                            
                            <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                                isAi 
                                    ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm' 
                                    : 'bg-indigo-600 text-white rounded-tr-sm shadow-md'
                            }`}>
                                {msg.content.split('\n').map((line, i) => (
                                    <React.Fragment key={i}>
                                        {line}
                                        {i !== msg.content.split('\n').length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                                <div className={`text-[10px] mt-1 text-right opacity-60`}>
                                    {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Typing Indicator */}
                {isTyping && (
                    <div className="flex gap-3 self-start max-w-[85%] animate-in fade-in duration-300">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="bg-white border border-gray-200 py-3 px-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
                <form 
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-2 bg-slate-50 border border-gray-200 rounded-full px-4 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all shadow-inner"
                >
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type a message..."
                        disabled={isTyping}
                        className="flex-1 bg-transparent border-none outline-none text-sm py-2 text-gray-800 placeholder:text-gray-400 disabled:opacity-50"
                    />
                    <button 
                        type="submit"
                        disabled={isTyping || !inputValue.trim()}
                        className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 disabled:bg-gray-300 transition-colors flex-shrink-0"
                    >
                        {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 -ml-0.5" />}
                    </button>
                </form>
            </div>
        </div>
    );
};
