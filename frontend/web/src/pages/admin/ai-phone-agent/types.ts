export interface ServiceItem {
    name: string;
    description: string;
    priceRange: string;
}

export interface FaqItem {
    question: string;
    answer: string;
}

export interface CallLogEntry {
    id: string;
    type: string;
    status: string;
    startedAt: string;
    endedAt: string;
    duration: number;
    callerNumber: string;
    transcript: string;
    summary: string;
    cost: number;
    endedReason: string;
}

export interface CallWorkflow {
    id: string;
    intent: string;
    instructions: string;
}

export interface AgentConfig {
    vapiAssistantId?: string;
    status: 'inactive' | 'ready' | 'active';
    businessName: string;
    businessDescription: string;
    greeting: string;
    businessHours: string;
    serviceArea: string;
    forwardingPhoneNumber: string;
    services: ServiceItem[];
    faqs: FaqItem[];
    specialInstructions: string;
    autoFollowUp: 'none' | 'sms' | 'email' | 'both';
    workflows: CallWorkflow[];
    voiceId?: string; // ID of the voice provider
}

export interface VoiceOption {
    id: string;
    provider: string;
    label: string;
}

export const FAQ_TEMPLATES: FaqItem[] = [
    { question: "What are your business hours?", answer: "" },
    { question: "Do you offer emergency or after-hours service?", answer: "" },
    { question: "What areas do you serve?", answer: "" },
    { question: "Do you offer free estimates?", answer: "" },
    { question: "What forms of payment do you accept?", answer: "" },
    { question: "Are you licensed and insured?", answer: "" },
    { question: "How quickly can you come out?", answer: "" },
    { question: "Do you offer any warranties on your work?", answer: "" },
];

