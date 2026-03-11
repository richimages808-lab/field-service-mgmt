import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';

interface PhotoUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPhotosSelected: (photos: File[]) => void;
    onIdentify: (photoUrls: string[]) => Promise<void>;
    type?: 'materials' | 'tools';
}

export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({
    isOpen,
    onClose,
    onPhotosSelected,
    onIdentify,
    type = 'materials'
}) => {
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        addPhotos(files);
    };

    const addPhotos = (newFiles: File[]) => {
        // Validate files
        const validFiles = newFiles.filter(file =>
            file.type.startsWith('image/') && file.size < 10 * 1024 * 1024 // 10MB limit
        );

        if (validFiles.length !== newFiles.length) {
            alert('Some files were skipped (not images or too large). Max 10MB per image.');
        }

        // Limit to 10 total photos
        const remainingSlots = 10 - photos.length;
        const filesToAdd = validFiles.slice(0, remainingSlots);

        if (filesToAdd.length < validFiles.length) {
            alert(`Only ${remainingSlots} more photos can be added (10 max total)`);
        }

        // Create preview URLs
        const newPreviewUrls = filesToAdd.map(file => URL.createObjectURL(file));

        setPhotos(prev => [...prev, ...filesToAdd]);
        setPhotoPreviewUrls(prev => [...prev, ...newPreviewUrls]);
        onPhotosSelected([...photos, ...filesToAdd]);
    };

    const removePhoto = (index: number) => {
        // Revoke the object URL to free memory
        URL.revokeObjectURL(photoPreviewUrls[index]);

        setPhotos(prev => prev.filter((_, i) => i !== index));
        setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
    };

    const handleIdentify = async () => {
        if (photos.length === 0) {
            alert('Please add at least one photo');
            return;
        }

        setIsProcessing(true);

        try {
            // The parent will handle upload and AI processing
            await onIdentify(photos.map((_, i) => photoPreviewUrls[i]));
        } catch (error) {
            console.error('Error identifying materials:', error);
            alert('Failed to identify materials. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        // Clean up object URLs
        photoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        setPhotos([]);
        setPhotoPreviewUrls([]);
        setIsProcessing(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <div>
                        <h2 className="text-xl font-semibold">
                            Add {type === 'materials' ? 'Materials' : 'Tools'} from Photos
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Take photos or upload images. AI will identify items automatically.
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        disabled={isProcessing}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Upload Controls */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                            disabled={isProcessing || photos.length >= 10}
                        >
                            <Camera className="w-5 h-5" />
                            <span className="font-medium">Take Photo</span>
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleFileSelect}
                                className="hidden"
                                multiple
                            />
                        </button>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                            disabled={isProcessing || photos.length >= 10}
                        >
                            <Upload className="w-5 h-5" />
                            <span className="font-medium">Upload Photos</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                                multiple
                            />
                        </button>
                    </div>

                    {/* Photo Preview Grid */}
                    {photoPreviewUrls.length > 0 ? (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-medium text-gray-700">
                                    Photos ({photos.length}/10)
                                </h3>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
                                {photoPreviewUrls.map((url, index) => (
                                    <div key={index} className="relative group aspect-square">
                                        <img
                                            src={url}
                                            alt={`Preview ${index + 1}`}
                                            className="w-full h-full object-cover rounded-lg border-2 border-gray-200"
                                        />
                                        <button
                                            onClick={() => removePhoto(index)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            disabled={isProcessing}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-500">No photos added yet</p>
                            <p className="text-sm text-gray-400 mt-1">
                                Use the buttons above to add photos
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                            disabled={isProcessing}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleIdentify}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isProcessing || photos.length === 0}
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                `Identify ${type === 'materials' ? 'Materials' : 'Tools'}`
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
