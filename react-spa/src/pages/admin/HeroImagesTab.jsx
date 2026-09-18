import React, { useState } from 'react';
import {
  useAdminHeroImages,
  useDeleteHeroPosition,
  useAssignAllHeroImages,
  useUploadHeroImage,
} from '../../data/hooks';
import { useConfirm, useToast, Loader } from '../../ui';

/**
 * "Hero Images" admin tab (T-6.3, split out of AdminPage.jsx).
 */
export default function HeroImagesTab() {
  const { data: heroImagesData, isLoading } = useAdminHeroImages();
  const heroImages = heroImagesData || {};
  const deleteHeroPosition = useDeleteHeroPosition();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const deleteHeroImage = async (name, position) => {
    const usedInOtherPositions = Object.entries(heroImages)
      .filter(([otherPos, otherFilename]) => otherFilename === name && otherPos !== position)
      .map(([otherPos]) => otherPos);

    const message = usedInOtherPositions.length > 0
      ? `Delete image from "${position}"? File will remain in: ${usedInOtherPositions.join(', ')}`
      : 'Delete this image?';

    const ok = await confirm({ title: 'Delete hero image', message, confirmText: 'Delete', danger: true });
    if (!ok) return;

    try {
      const result = await deleteHeroPosition.mutateAsync(position);
      toast.success(result.message);
    } catch (err) {
      toast.error('Error deleting hero image: ' + err.message);
    }
  };

  const clearAllHeroImages = async () => {
    const ok = await confirm({
      title: 'Delete all hero images',
      message: 'Delete all hero images? This action cannot be undone.',
      confirmText: 'Delete all',
      danger: true,
    });
    if (!ok) return;

    try {
      const positions = Object.keys(heroImages).filter((pos) => heroImages[pos] !== null);

      if (positions.length === 0) {
        toast.info('No images to delete');
        return;
      }

      const results = await Promise.allSettled(positions.map((pos) => deleteHeroPosition.mutateAsync(pos)));
      const successCount = results.filter((r) => r.status === 'fulfilled').length;

      if (successCount === positions.length) {
        toast.success(`All hero images deleted (${successCount}/${positions.length} positions)`);
      } else {
        toast.error(`Deleted ${successCount}/${positions.length} images`);
      }
    } catch (err) {
      toast.error('Error deleting hero images: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <div id="hero-tab-block">
        {confirmDialog}
        <Loader label="Loading hero images..." />
      </div>
    );
  }

  return (
    <div id="hero-tab-block">
      {confirmDialog}
      <h2>Hero Background Images</h2>
      <HeroUploadForm />
      <div style={{ marginBottom: '20px' }}>
        <button onClick={clearAllHeroImages} className="admin-btn" style={{ background: '#6c757d', color: 'white' }}>
          Clear all hero images
        </button>
      </div>
      <div id="hero-images-list">
        {!heroImages || Object.keys(heroImages).length === 0 ? (
          <span style={{ color: '#888' }}>No images</span>
        ) : (
          <>
            {Object.entries(heroImages || {})
              .filter(([, imageData]) => imageData !== null)
              .map(([position, imageData]) => {
                if (!imageData) return null;

                const isImageKit = typeof imageData === 'object' && imageData.url;
                const imageUrl = isImageKit ? `${imageData.url.split('?')[0]}?tr=q-100,f-webp` : `/img/hero/${imageData}`;
                const imageName = isImageKit ? imageData.name : imageData;

                const usedInOtherPositions = Object.entries(heroImages || {})
                  .filter(([otherPos, otherImageData]) => {
                    if (otherImageData === null) return false;
                    if (isImageKit && typeof otherImageData === 'object' && otherImageData.url) {
                      return otherImageData.file_id === imageData.file_id && otherPos !== position;
                    }
                    return otherImageData === imageData && otherPos !== position;
                  })
                  .map(([otherPos]) => otherPos);

                return (
                  <div key={position} className="hero-image-item">
                    <div className="hero-image-position">
                      {position}
                      {usedInOtherPositions.length > 0 && (
                        <span className="shared-indicator" title={`Also used in: ${usedInOtherPositions.join(', ')}`}>
                          🔗
                        </span>
                      )}
                    </div>
                    <img src={imageUrl} alt="hero-img" />
                    <button
                      title={usedInOtherPositions.length > 0 ? `Delete from ${position} (file remains in others)` : 'Delete'}
                      onClick={() => deleteHeroImage(imageName, position)}
                      className="hero-image-delete"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

            {Object.entries(heroImages || {})
              .filter(([, imageData]) => imageData === null)
              .map(([position]) => (
                <div key={position} className="hero-image-item hero-image-empty">
                  <div className="hero-image-position">{position}</div>
                  <div className="hero-image-placeholder">Empty</div>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

// Компонент для загрузки hero изображений
function HeroUploadForm() {
  const assignAllHeroImages = useAssignAllHeroImages();
  const uploadHeroImage = useUploadHeroImage();
  const toast = useToast();
  const [selectedFile, setSelectedFile] = useState(null);
  const [position, setPosition] = useState('garage');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [uploadToAll, setUploadToAll] = useState(false);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);

      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Select a file');
      return;
    }

    setUploading(true);
    try {
      if (uploadToAll) {
        const formData = new FormData();
        formData.append('image', selectedFile);

        const result = await assignAllHeroImages.mutateAsync(formData);

        toast.success(`Image successfully assigned to all hero blocks! Deleted old files: ${result.deletedFiles}`);
      } else {
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('pos', position);

        await uploadHeroImage.mutateAsync(formData);

        toast.success('Hero image uploaded successfully!');
      }

      setSelectedFile(null);
      setPosition('garage');
      setPreview(null);
      setUploadToAll(false);
    } catch (e) {
      console.error('Error uploading hero image:', e);
      toast.error('Error uploading hero image: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="hero-upload-container">
      <form onSubmit={handleSubmit} className="hero-upload-form">
        <div className="upload-inputs">
          <input type="file" accept="image/*" onChange={handleFileSelect} />
          <div className="upload-options">
            <label className="upload-to-all-label">
              <input type="checkbox" checked={uploadToAll} onChange={(e) => setUploadToAll(e.target.checked)} />
              <span>Upload to all hero blocks</span>
            </label>
            {!uploadToAll && (
              <select value={position} onChange={(e) => setPosition(e.target.value)}>
                <option value="garage">Garage Hero</option>
                <option value="plan">Plan Hero</option>
                <option value="trainings">Trainings Hero</option>
                <option value="checklist">Checklist Hero</option>
              </select>
            )}
          </div>
          <button className="btn" type="submit" disabled={uploading}>
            {uploading ? 'Uploading...' : uploadToAll ? 'Upload to all' : 'Upload'}
          </button>
        </div>

        {preview && (
          <div className="upload-preview">
            <h4>Preview:</h4>
            <img src={preview} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'cover' }} />
            <div className="file-info">
              <strong>File:</strong> {selectedFile.name}<br />
              <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(1)} KB<br />
              <strong>Type:</strong> {selectedFile.type}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
