export interface Job {
    id: string;
    org_id: string;
    status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
    quote_status?: 'draft' | 'sent' | 'approved' | 'rejected'; // Added
    priority: 'low' | 'medium' | 'high' | 'critical';
    customer: {
        name: string;
        address: string;
        phone: string;
        email: string;
    };
    location_coords?: {
        lat: number;
        lng: number;
    };

    createdAt: any; // Timestamp
}

export interface UserProfile {
    id: string;
    email: string;
    role: 'owner' | 'dispatcher' | 'technician';
    name: string;
    org_id: string;
    preferences?: {
        working_hours: {
            start: string; // "09:00"
            end: string;   // "17:00"
        };
        preferred_days: number[]; // 0-6 (Sun-Sat)
    };
}
