import React, { useState, useRef } from 'react';
import './ImageUploadModal.css';

const ImageUploadModal = ({ isOpen, onClose, onUpload, position }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (file.type.startsWith('image/')) {
      setSelectedFile(file);
      
      // Создаем preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      alert('Пожалуйста, выберите изображение');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('pos', position);

      const response = await fetch('/api/garage/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        onUpload(result);
        onClose();
      } else {
        const error = await response.json();
        alert(`Ошибка загрузки: ${error.error}`);
      }
    } catch (error) {
      alert('Ошибка загрузки изображения');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    setDragActive(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="image-upload-modal-overlay" onClick={handleClose}>
      <div className="image-upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-upload-modal-header">
          <h3>Загрузить изображение для позиции: {position}</h3>
          <button className="image-upload-modal-close" onClick={handleClose}>×</button>
        </div>
        
        <div className="image-upload-modal-content">
          <div 
            className={`image-upload-dropzone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="image-preview">
                <img src={preview} alt="Preview" />
                <div className="image-preview-overlay">
                  <span>Нажмите для выбора другого изображения</span>
                </div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <div className="upload-icon material-symbols-outlined">folder</div>
                <p>Перетащите изображение сюда или нажмите для выбора</p>
                <p className="upload-hint">Поддерживаются: JPG, PNG, GIF</p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
          </div>
          
          {selectedFile && (
            <div className="image-upload-info">
              <p><strong>Файл:</strong> {selectedFile.name}</p>
              <p><strong>Размер:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
        </div>
        
        <div className="image-upload-modal-footer">
         
          <button 
            className="accent-btn" 
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Загрузка...' : 'Загрузить'}
          </button>
          <button 
            className="image-upload-btn-cancel" 
            onClick={handleClose}
            disabled={uploading}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageUploadModal; 