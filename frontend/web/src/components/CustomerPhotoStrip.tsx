import React, { useState } from 'react';
import { Camera, ImageIcon } from 'lucide-react';
import { PhotoLightbox } from './PhotoLightbox';

interface CustomerPhotoStripProps {
  photos: string[];
  label?: string;
  maxVisible?: number;
  compact?: boolean; // Smaller thumbnails for inline use
}

export const CustomerPhotoStrip: React.FC<CustomerPhotoStripProps> = ({
  photos,
  label = 'Customer Photos',
  maxVisible = 5,
  compact = false
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!photos || photos.length === 0) return null;

  const visiblePhotos = photos.slice(0, maxVisible);
  const overflow = photos.length - maxVisible;
  const thumbSize = compact ? 'w-12 h-12' : 'w-16 h-16';

  return (
    <>
      <div className={`${compact ? '' : 'bg-white rounded-lg border border-gray-200 p-3'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Camera className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-blue-500`} />
          <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold text-gray-700 uppercase tracking-wide`}>
            {label}
          </span>
          <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full`}>
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {visiblePhotos.map((url, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              className={`${thumbSize} rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-400 transition-all hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 group relative flex-shrink-0`}
              title={`View photo ${i + 1}`}
            >
              <img
                src={url}
                alt={`Customer photo ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
              </div>
            </button>
          ))}
          {overflow > 0 && (
            <button
              onClick={() => setLightboxIndex(maxVisible)}
              className={`${thumbSize} rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors text-xs font-bold bg-gray-50 hover:bg-blue-50 flex-shrink-0`}
              title={`View all ${photos.length} photos`}
            >
              +{overflow}
            </button>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
};
