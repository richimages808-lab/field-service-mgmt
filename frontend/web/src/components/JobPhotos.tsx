import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../auth/AuthProvider';
import { JobPhoto } from '../types';
import { Camera, Image, Trash2, Upload, X, ZoomIn, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface JobPhotosProps {
    jobId: string;
    allowUpload?: boolean;
    compact?: boolean;
}

const PHOTO_TYPES = [
    { value: 'before', label: 'Before', color: 'blue' },
    { value: 'during', label: 'During', color: 'yellow' },
    { value: 'after', label: 'After', color: 'green' },
    { value: 'issue', label: 'Issue', color: 'red' },
    { value: 'parts', label: 'Parts Used', color: 'purple' }
] as const;

export const JobPhotos: React.FC<JobPhotosProps> = ({
    jobId,
    allowUpload = true,
    compact = false
}) => {
    const { user } = useAuth();
    const [photos, setPhotos] = useState<JobPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedType, setSelectedType] = useState<JobPhoto['type']>('before');
    const [viewingPhoto, setViewingPhoto] = useState<JobPhoto | null>(null);
    const [viewingIndex, setViewingIndex] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const orgId = (user as any)?.org_id || 'demo-org';

    useEffect(() => {
        const photosQuery = query(
            collection(db, 'job_photos'),
            where('job_id', '==', jobId),
            orderBy('takenAt', 'desc')
        );

        const unsubscribe = onSnapshot(photosQuery, (snapshot) => {
            const photosData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as JobPhoto));
            setPhotos(photosData);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching photos:', error);
            setLoading(false);
        });

        return unsubscribe;
    }, [jobId]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0 || !user) return;

        setUploading(true);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // Validate file type
                if (!file.type.startsWith('image/')) {
                    alert(`${file.name} is not an image`);
                    continue;
                }

                // Validate file size (max 10MB)
                if (file.size > 10 * 1024 * 1024) {
                    alert(`${file.name} is too large (max 10MB)`);
                    continue;
                }

                // Upload to Firebase Storage
                const timestamp = Date.now();
                const filename = `${jobId}/${selectedType}_${timestamp}_${file.name}`;
                const storageRef = ref(storage, `job_photos/${filename}`);

                await uploadBytes(storageRef, file);
                const downloadUrl = await getDownloadURL(storageRef);

                // Get location if available
                let photoLocation;
                if (navigator.geolocation) {
                    try {
                        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                        });
                        photoLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                    } catch {
                        // Location not available, continue without it
                    }
                }

                // Save photo metadata to Firestore
                await addDoc(collection(db, 'job_photos'), {
                    job_id: jobId,
                    org_id: orgId,
                    type: selectedType,
                    url: downloadUrl,
                    takenAt: serverTimestamp(),
                    takenBy: user.uid,
                    ...(photoLocation && { location: photoLocation })
                });
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Failed to upload photo');
        }

        setUploading(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (photo: JobPhoto) => {
        if (!confirm('Delete this photo?')) return;

        try {
            // Delete from Firestore
            await deleteDoc(doc(db, 'job_photos', photo.id));

            // Try to delete from Storage (may fail if URL format is different)
            try {
                const storageRef = ref(storage, photo.url);
                await deleteObject(storageRef);
            } catch (storageError) {
                console.log('Could not delete from storage:', storageError);
            }
        } catch (error) {
            console.error('Error deleting photo:', error);
            alert('Failed to delete photo');
        }
    };

    const openLightbox = (photo: JobPhoto) => {
        const index = photos.findIndex(p => p.id === photo.id);
        setViewingIndex(index);
        setViewingPhoto(photo);
    };

    const navigateLightbox = (direction: 'prev' | 'next') => {
        let newIndex = direction === 'prev' ? viewingIndex - 1 : viewingIndex + 1;
        if (newIndex < 0) newIndex = photos.length - 1;
        if (newIndex >= photos.length) newIndex = 0;
        setViewingIndex(newIndex);
        setViewingPhoto(photos[newIndex]);
    };

    const getPhotosByType = (type: JobPhoto['type']) => photos.filter(p => p.type === type);

    if (compact) {
        const beforePhotos = getPhotosByType('before');
        const afterPhotos = getPhotosByType('after');

        return (
            <div className="bg-white rounded-lg shadow p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold">Photos</span>
                    </div>
                    <span className="text-xs text-gray-500">{photos.length} total</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Before ({beforePhotos.length})</p>
                        {beforePhotos.length > 0 ? (
                            <img
                                src={beforePhotos[0].url}
                                alt="Before"
                                className="w-full h-16 object-cover rounded cursor-pointer"
                                onClick={() => openLightbox(beforePhotos[0])}
                            />
                        ) : (
                            <div className="w-full h-16 bg-gray-100 rounded flex items-center justify-center">
                                <Image className="w-4 h-4 text-gray-400" />
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">After ({afterPhotos.length})</p>
                        {afterPhotos.length > 0 ? (
                            <img
                                src={afterPhotos[0].url}
                                alt="After"
                                className="w-full h-16 object-cover rounded cursor-pointer"
                                onClick={() => openLightbox(afterPhotos[0])}
                            />
                        ) : (
                            <div className="w-full h-16 bg-gray-100 rounded flex items-center justify-center">
                                <Image className="w-4 h-4 text-gray-400" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Lightbox */}
                {viewingPhoto && (
                    <Lightbox
                        photo={viewingPhoto}
                        photos={photos}
                        currentIndex={viewingIndex}
                        onClose={() => setViewingPhoto(null)}
                        onNavigate={navigateLightbox}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Job Photos</h3>
                </div>
                <span className="text-sm text-gray-500">{photos.length} photos</span>
            </div>

            {/* Upload Section */}
            {allowUpload && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <div className="flex items-center gap-4 mb-3">
                        <p className="text-sm text-gray-600">Photo Type:</p>
                        <div className="flex gap-2">
                            {PHOTO_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    onClick={() => setSelectedType(type.value)}
                                    className={`px-3 py-1 text-sm rounded ${
                                        selectedType === type.value
                                            ? `bg-${type.color}-100 text-${type.color}-700 border border-${type.color}-300`
                                            : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        multiple
                        className="hidden"
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {uploading ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                                <span className="text-gray-600">Uploading...</span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-5 h-5 text-gray-400" />
                                <span className="text-gray-600">Click to upload or drag photos</span>
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Photos Grid */}
            {loading ? (
                <p className="text-gray-500 text-sm">Loading photos...</p>
            ) : photos.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                    No photos yet. Add before and after photos to document the job.
                </p>
            ) : (
                <div className="space-y-4">
                    {PHOTO_TYPES.map(type => {
                        const typePhotos = getPhotosByType(type.value);
                        if (typePhotos.length === 0) return null;

                        return (
                            <div key={type.value}>
                                <p className={`text-sm font-medium text-${type.color}-700 mb-2`}>
                                    {type.label} ({typePhotos.length})
                                </p>
                                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                    {typePhotos.map(photo => (
                                        <div
                                            key={photo.id}
                                            className="relative group aspect-square"
                                        >
                                            <img
                                                src={photo.url}
                                                alt={`${type.label} photo`}
                                                className="w-full h-full object-cover rounded cursor-pointer"
                                                onClick={() => openLightbox(photo)}
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openLightbox(photo);
                                                    }}
                                                    className="p-1 bg-white rounded-full mr-1"
                                                >
                                                    <ZoomIn className="w-4 h-4 text-gray-700" />
                                                </button>
                                                {allowUpload && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(photo);
                                                        }}
                                                        className="p-1 bg-white rounded-full"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Lightbox */}
            {viewingPhoto && (
                <Lightbox
                    photo={viewingPhoto}
                    photos={photos}
                    currentIndex={viewingIndex}
                    onClose={() => setViewingPhoto(null)}
                    onNavigate={navigateLightbox}
                />
            )}
        </div>
    );
};

// Lightbox Component
interface LightboxProps {
    photo: JobPhoto;
    photos: JobPhoto[];
    currentIndex: number;
    onClose: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
}

const Lightbox: React.FC<LightboxProps> = ({
    photo,
    photos,
    currentIndex,
    onClose,
    onNavigate
}) => {
    const typeConfig = PHOTO_TYPES.find(t => t.value === photo.type);

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') onNavigate('prev');
            if (e.key === 'ArrowRight') onNavigate('next');
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNavigate]);

    return (
        <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Navigation */}
            {photos.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); onNavigate('prev'); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/20 rounded-full"
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onNavigate('next'); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white hover:bg-white/20 rounded-full"
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>
                </>
            )}

            {/* Image */}
            <img
                src={photo.url}
                alt={`${typeConfig?.label || 'Job'} photo`}
                className="max-h-[85vh] max-w-[90vw] object-contain"
                onClick={(e) => e.stopPropagation()}
            />

            {/* Info bar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg flex items-center gap-4">
                <span className={`px-2 py-0.5 text-xs rounded bg-${typeConfig?.color}-600`}>
                    {typeConfig?.label}
                </span>
                <span className="text-sm">
                    {currentIndex + 1} of {photos.length}
                </span>
                <span className="text-xs text-gray-400">
                    {photo.takenAt?.toDate?.().toLocaleString() || 'Recently'}
                </span>
                <a
                    href={photo.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 hover:bg-white/20 rounded"
                >
                    <Download className="w-4 h-4" />
                </a>
            </div>
        </div>
    );
};
