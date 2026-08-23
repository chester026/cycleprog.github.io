// Photo strip — replaces the old 776px-tall 50/50 grid.
//
// That grid cover-cropped whatever the user uploaded into two wildly different
// fixed boxes (and hid the big one entirely under 900px), which is why the
// photos looked skewed. Here every tile is the same 1:1 square in a strip that
// scrolls out to the screen edges, so no photo gets a bespoke crop.
//
// The three position keys are the ones the backend validates: 'right',
// 'left-top', 'left-bottom' (legacy names from the old grid layout).
import React, { useState } from 'react';
import ImageUploadModal from './ImageUploadModal';
import { proxyStravaImage } from '../utils/imageProxy';

const POSITIONS = ['right', 'left-top', 'left-bottom'];

const AddPhotoIcon = () => (
  <svg viewBox="0 -960 960 960" aria-hidden="true">
    <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h360v80H200v560h560v-360h80v360q0 33-23.5 56.5T760-120H200Zm480-480v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80ZM240-280h480L570-480 450-320l-90-120-120 160Z" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 -960 960 960" aria-hidden="true">
    <path d="M160-160v-120l520-520q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 56q11 12 17 26.5t6 30.5q0 15-5.5 30T860-600L340-80H160v-80h80l406-406-56-56L200-240v80h-40Z" />
  </svg>
);

export default function GaragePhotoStrip({ images, onUploaded }) {
  const [uploadFor, setUploadFor] = useState(null);

  const urlFor = position => {
    const data = images?.[position];
    if (!data) return null;

    // New ImageKit records carry a url; legacy records are a bare filename.
    if (data.url) {
      const base = data.url.split('?')[0];
      return proxyStravaImage(`${base}?tr=q-100,f-webp`);
    }
    if (typeof data === 'string') return `/img/garage/${data}`;
    return null;
  };

  return (
    <>
      <div className="garage-strip garage-photo-strip">
        {POSITIONS.map(position => {
          const url = urlFor(position);
          return (
            <div className="garage-photo-tile" key={position}>
              {url ? (
                <>
                  <img src={url} alt="Garage photo" loading="lazy" />
                  <button
                    className="garage-photo-edit"
                    onClick={() => setUploadFor(position)}
                    title="Replace photo"
                  >
                    <EditIcon />
                  </button>
                </>
              ) : (
                <div
                  className="garage-photo-empty"
                  onClick={() => setUploadFor(position)}
                  role="button"
                >
                  <AddPhotoIcon />
                  Add photo
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ImageUploadModal
        isOpen={!!uploadFor}
        onClose={() => setUploadFor(null)}
        onUpload={result => {
          setUploadFor(null);
          if (onUploaded) onUploaded(result);
        }}
        position={uploadFor}
      />
    </>
  );
}
