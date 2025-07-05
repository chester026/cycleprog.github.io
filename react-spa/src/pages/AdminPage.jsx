import React, { useState, useEffect } from 'react';
import './AdminPage.css';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('rides');
  const [rides, setRides] = useState([]);
  const [garageImages, setGarageImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingRide, setEditingRide] = useState(null);
  const [rideForm, setRideForm] = useState({
    title: '',
    location: '',
    locationLink: '',
    details: '',
    start: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('Loading data...');
      
      const [ridesRes, garageRes] = await Promise.all([
        fetch('/api/rides'),
        fetch('/api/garage/positions')
      ]);
      
      console.log('Rides response status:', ridesRes.status);
      console.log('Garage response status:', garageRes.status);
      
      if (ridesRes.ok) {
        const ridesData = await ridesRes.json();
        console.log('Rides data:', ridesData);
        setRides(ridesData);
      }
      
      if (garageRes.ok) {
        const garageData = await garageRes.json();
        console.log('Garage data:', garageData);
        setGarageImages(garageData);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearRideForm = () => {
    setRideForm({
      title: '',
      location: '',
      locationLink: '',
      details: '',
      start: ''
    });
    setEditingRide(null);
  };

  const handleRideSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingRide ? `/api/rides/${editingRide}` : '/api/rides';
      const method = editingRide ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rideForm)
      });
      
      if (response.ok) {
        clearRideForm();
        loadData();
      }
    } catch (err) {
      console.error('Error saving ride:', err);
    }
  };

  const editRide = (ride) => {
    setRideForm({
      title: ride.title,
      location: ride.location,
      locationLink: ride.locationLink || '',
      details: ride.details || '',
      start: ride.start
    });
    setEditingRide(ride.id);
  };

  const deleteRide = async (id) => {
    if (!confirm('Удалить этот заезд?')) return;
    try {
      await fetch(`/api/rides/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Error deleting ride:', err);
    }
  };

  const deleteAllRides = async () => {
    if (!confirm('Удалить ВСЕ заезды?')) return;
    try {
      await fetch('/api/rides/all', { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Error deleting all rides:', err);
    }
  };

  const deleteGarageImage = async (name) => {
    if (!confirm('Удалить это изображение?')) return;
    try {
      console.log('Deleting image:', name);
      const response = await fetch(`/api/garage/images/${name}`, { method: 'DELETE' });
      console.log('Delete response status:', response.status);
      
      if (response.ok) {
        console.log('Image deleted successfully');
        alert('Изображение удалено!');
        loadData();
      } else {
        const errorText = await response.text();
        console.error('Delete failed:', errorText);
        alert(`Ошибка удаления (${response.status}): ${errorText}`);
      }
    } catch (err) {
      console.error('Error deleting garage image:', err);
      alert('Ошибка удаления изображения: ' + err.message);
    }
  };

  const formatDT = (dt) => {
    return new Date(dt).toLocaleString('ru-RU');
  };

  if (loading) {
    return (
      <div className="admin-wrap">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2em' }}>
          <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #274DD3', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="admin-tabs">
        <button 
          className={`admin-tab-btn ${activeTab === 'rides' ? 'admin-tab-active' : ''}`}
          onClick={() => setActiveTab('rides')}
        >
          Управление заездами
        </button>
        <button 
          className={`admin-tab-btn ${activeTab === 'garage' ? 'admin-tab-active' : ''}`}
          onClick={() => setActiveTab('garage')}
        >
          Bike Garage Images
        </button>
      </div>

      {activeTab === 'rides' && (
        <div id="rides-tab-block">
          <h1>Управление заездами</h1>
          <form onSubmit={handleRideSubmit}>
            <input type="hidden" value={editingRide || ''} />
            <label>Название:<br />
              <input 
                value={rideForm.title}
                onChange={(e) => setRideForm({...rideForm, title: e.target.value})}
                required
              />
            </label><br />
            <label>Место:<br />
              <input 
                value={rideForm.location}
                onChange={(e) => setRideForm({...rideForm, location: e.target.value})}
                required
              />
            </label><br />
            <label>Ссылка на локацию:<br />
              <input 
                type="url" 
                placeholder="https://..."
                value={rideForm.locationLink}
                onChange={(e) => setRideForm({...rideForm, locationLink: e.target.value})}
              />
            </label><br />
            <label>Описание:<br />
              <textarea 
                rows="2"
                value={rideForm.details}
                onChange={(e) => setRideForm({...rideForm, details: e.target.value})}
              />
            </label><br />
            <label>Дата и время начала:<br />
              <input 
                type="datetime-local"
                value={rideForm.start}
                onChange={(e) => setRideForm({...rideForm, start: e.target.value})}
                required
              />
            </label><br />
            <button className="btn" type="submit">
              {editingRide ? 'Обновить' : 'Сохранить'}
            </button>
            {editingRide && (
              <button className="btn cancel" type="button" onClick={clearRideForm}>
                Отмена
              </button>
            )}
          </form>
          
          <button className="btn del" type="button" onClick={deleteAllRides} style={{float: 'right', marginBottom: '1em'}}>
            Удалить все записи
          </button>
          
          <table id="rides-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Место</th>
                <th>Локация</th>
                <th>Начало</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rides.map((ride) => (
                <tr key={ride.id}>
                  <td>{ride.title}</td>
                  <td>{ride.location}</td>
                  <td>
                    {ride.locationLink ? (
                      <a href={ride.locationLink} target="_blank" rel="noopener noreferrer">
                        Ссылка
                      </a>
                    ) : ''}
                  </td>
                  <td>{formatDT(ride.start)}</td>
                  <td className="row-actions">
                    <button className="btn" onClick={() => editRide(ride)}>✎</button>
                    <button className="btn del" onClick={() => deleteRide(ride.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'garage' && (
        <div id="garage-tab-block">
          <h2>Bike Garage Images</h2>
          <GarageUploadForm onUpload={loadData} />
          <div id="garage-images-list">
            {Object.keys(garageImages).length === 0 ? (
              <span style={{color: '#888'}}>Нет изображений</span>
            ) : (
              <>
                {/* Загруженные изображения */}
                {Object.entries(garageImages)
                  .filter(([position, filename]) => filename !== null)
                  .map(([position, filename]) => (
                    <div key={position} className="garage-image-item">
                      <div className="garage-image-position">{position}</div>
                      <img src={`/img/garage/${filename}`} alt="garage-img" />
                      <button 
                        title="Удалить" 
                        onClick={() => deleteGarageImage(filename)}
                        className="garage-image-delete"
                      >
                        ×
                      </button>
                    </div>
                  ))
                }
                
                {/* Пустые позиции */}
                {Object.entries(garageImages)
                  .filter(([position, filename]) => filename === null)
                  .map(([position, filename]) => (
                    <div key={position} className="garage-image-item garage-image-empty">
                      <div className="garage-image-position">{position}</div>
                      <div className="garage-image-placeholder">Пусто</div>
                    </div>
                  ))
                }
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Компонент для загрузки изображений
function GarageUploadForm({ onUpload }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [position, setPosition] = useState('right');
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Выберите файл');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('pos', position);
      
      console.log('Uploading file:', selectedFile.name, 'to position:', position);
      console.log('File size:', selectedFile.size, 'bytes');
      console.log('File type:', selectedFile.type);
      
      const response = await fetch('/api/garage/upload', { 
        method: 'POST', 
        body: formData 
      });
      
      console.log('Upload response status:', response.status);
      console.log('Upload response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const result = await response.json();
        console.log('Upload successful:', result);
        alert('Изображение успешно загружено!');
        setSelectedFile(null);
        setPosition('right');
        onUpload();
      } else {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        alert(`Ошибка загрузки (${response.status}): ${errorText}`);
      }
    } catch (e) {
      console.error('Error uploading image:', e);
      alert('Ошибка загрузки изображения: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="garage-upload-form">
      <input 
        type="file" 
        accept="image/*"
        onChange={(e) => setSelectedFile(e.target.files[0])}
      />
      <select 
        value={position}
        onChange={(e) => setPosition(e.target.value)}
      >
        <option value="right">Right (main)</option>
        <option value="left-top">Left Top</option>
        <option value="left-bottom">Left Bottom</option>
      </select>
      <button className="btn" type="submit" disabled={uploading}>
        {uploading ? 'Загрузка...' : 'Загрузить'}
      </button>
    </form>
  );
} 