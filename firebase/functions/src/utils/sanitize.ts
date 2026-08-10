export function sanitizeForFirestore<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj
            .filter(item => item !== undefined && item !== null)
            .map(item => sanitizeForFirestore(item)) as unknown as T;
    }

    if (typeof obj === 'object' && !(obj instanceof Date) && typeof (obj as any).toMillis !== 'function') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined && value !== null) {
                sanitized[key] = sanitizeForFirestore(value);
            }
        }
        return sanitized as T;
    }

    return obj;
}
