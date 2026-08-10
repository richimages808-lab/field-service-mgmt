/**
 * AI Materials Service - Handles photo upload and AI identification
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AIIdentifiedMaterial, AIIdentifiedTool, MaterialItem, ToolItem, CatalogItem } from '../types';

const functions = getFunctions();

interface IdentifyMaterialsResponse {
    items: (AIIdentifiedMaterial | AIIdentifiedTool)[];
    processingTime: number;
    imageCount: number;
}

/**
 * Upload photos to Firebase Storage
 */
export async function uploadPhotos(
    files: File[],
    orgId: string,
    type: 'materials' | 'tools' = 'materials'
): Promise<string[]> {
    const uploadPromises = files.map(async (file) => {
        const timestamp = Date.now();
        const fileName = `${type}/${orgId}/${timestamp}_${file.name}`;
        const storageRef = ref(storage, fileName);

        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        return downloadUrl;
    });

    return Promise.all(uploadPromises);
}

/**
 * Call the identifyMaterials Cloud Function
 */
export async function identifyMaterials(
    imageUrls: string[],
    orgId: string,
    type: 'materials' | 'tools' = 'materials'
): Promise<(AIIdentifiedMaterial | AIIdentifiedTool)[]> {
    const identifyFn = httpsCallable<
        { imageUrls: string[]; type: string; orgId: string },
        IdentifyMaterialsResponse
    >(functions, 'identifyMaterials');

    const result = await identifyFn({ imageUrls, type, orgId });
    console.log('[aiMaterialsService] RAW FUNCTION RESULT:', result);

    if (!result.data || !result.data.items) {
        console.error('[aiMaterialsService] Error: Missing items in response data', result.data);
        return [];
    }

    // Add temporary IDs and photo URLs to each item
    return result.data.items.map((item, index) => ({
        ...item,
        id: `temp-${Date.now()}-${index}`,
        photoUrl: imageUrls[Math.floor(index / (Math.max(1, result.data.items.length) / imageUrls.length))] || imageUrls[0]
    }));
}

export interface InStockMaterial {
    name: string;
    quantity: number;
    unit: string;
    inventoryId: string;
    currentStock: number;
    notes?: string;
}

export interface PurchasableMaterial {
    name: string;
    quantity: number;
    unit: string;
    suggestedSupplier: string;
    estimatedUnitCost: number;
    reasoning: string;
}

export interface AssessJobMaterialsResponse {
    inStock: InStockMaterial[];
    requiresPurchase: PurchasableMaterial[];
    generalAdvice: string;
}

/**
 * Call the assessJobMaterials Cloud Function to determine necessary materials for a job
 */
export async function assessJobMaterials(
    jobId: string,
    orgId: string,
    sourcingPreference?: string,
    sourcingPriorities?: string[]
): Promise<AssessJobMaterialsResponse> {
    const assessFn = httpsCallable<
        { jobId: string; orgId: string; sourcingPreference?: string; sourcingPriorities?: string[] },
        AssessJobMaterialsResponse
    >(functions, 'assessJobMaterials');

    const result = await assessFn({ jobId, orgId, sourcingPreference, sourcingPriorities });
    return result.data;
}

/**
 * Call the getMaterialUsage Cloud Function to get AI generated usage suggestions
 */
export async function getMaterialUsage(
    materialName: string,
    category: string,
    orgId: string,
    itemType: 'material' | 'tool' = 'material'
): Promise<string> {
    const getUsageFn = httpsCallable<
        { materialName: string; category: string; orgId: string; itemType: string },
        { suggestedUsage: string }
    >(functions, 'getMaterialUsage');

    const result = await getUsageFn({ materialName, category, orgId, itemType });
    return result.data.suggestedUsage;
}

/**
 * Call the resolveCatalogItem Cloud Function to fetch cached catalog data or generate new data
 */
export async function resolveCatalogItem(
    itemName: string,
    itemType: 'material' | 'tool'
): Promise<CatalogItem> {
    const resolveFn = httpsCallable<
        { itemName: string; itemType: string },
        CatalogItem
    >(functions, 'resolveCatalogItem');

    const result = await resolveFn({ itemName, itemType });
    return result.data;
}

/**
 * Batch create materials in Firestore
 */
export async function batchCreateMaterials(
    items: Partial<MaterialItem>[],
    orgId: string,
    userId: string,
    techId?: string
): Promise<void> {
    const createPromises = items.map(async (item) => {
        const materialData = {
            ...item,
            org_id: orgId,
            tech_id: techId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        await addDoc(collection(db, 'materials'), materialData);
    });

    await Promise.all(createPromises);
}

/**
 * Batch create tools in Firestore
 */
export async function batchCreateTools(
    items: Partial<ToolItem>[],
    orgId: string,
    userId: string
): Promise<void> {
    const createPromises = items.map(async (item) => {
        const toolData = {
            ...item,
            org_id: orgId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        await addDoc(collection(db, 'tools'), toolData);
    });

    await Promise.all(createPromises);
}

/**
 * Match identified items to existing inventory using fuzzy search
 */
export function matchInventoryItems(
    identifiedItems: (AIIdentifiedMaterial | AIIdentifiedTool)[],
    inventory: any[]
): any[] {
    return identifiedItems.map(item => {
        // Find best match in inventory
        let bestMatch = null;
        let highestScore = 0;

        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aiName = normalize(item.name);

        inventory.forEach(invItem => {
            const invName = normalize(invItem.name);
            let score = 0;

            // 1. Direct inclusion (high confidence)
            if (invName.includes(aiName) || aiName.includes(invName)) {
                score += 50;
                // Bonus for length similarity
                const lenRatio = Math.min(aiName.length, invName.length) / Math.max(aiName.length, invName.length);
                score += lenRatio * 20;
            }

            // 2. Levenshtein distance (typo tolerance)
            const dist = levenshtein(aiName, invName);
            const maxLength = Math.max(aiName.length, invName.length);
            const similarity = 1 - (dist / maxLength);

            if (similarity > 0.7) {
                score += similarity * 30;
            }

            if (score > highestScore && score > 40) {
                highestScore = score;
                bestMatch = invItem;
            }
        });

        if (bestMatch) {
            return {
                ...item,
                matchedInventoryItem: bestMatch,
                matchConfidence: highestScore
            };
        }
        return item;
    });
}

/**
 * Levenshtein distance helper
 */
function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}
