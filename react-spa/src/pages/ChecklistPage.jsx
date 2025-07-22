import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import './ChecklistPage.css';
import { heroImagesUtils } from '../utils/heroImages';
import { apiFetch } from '../utils/api';
import { useRef } from 'react';

export default function ChecklistPage() {
  const [items, setItems] = useState([]); // {id, section, item, checked}
  const [newItem, setNewItem] = useState({}); // { [section]: text }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [heroImage, setHeroImage] = useState(null);
  const [firstSection, setFirstSection] = useState('');
  const [firstItem, setFirstItem] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const addSectionRef = useRef();

  useEffect(() => {
    loadChecklist();
    fetchHeroImage();
  }, []);

  // Закрытие поповера при клике вне
  useEffect(() => {
    if (!showAddSection) return;
    const handler = (e) => {
      if (addSectionRef.current && !addSectionRef.current.contains(e.target)) {
        setShowAddSection(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddSection]);

  const loadChecklist = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/checklist');
      if (!res.ok) throw new Error('Failed to load checklist');
      const data = await res.json();
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (section) => {
    const text = (newItem[section] || '').trim();
    if (!text) return;
    const res = await apiFetch('/api/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, item: text })
    });
    if (res.ok) {
      setNewItem({ ...newItem, [section]: '' });
      loadChecklist();
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    await apiFetch(`/api/checklist/${id}`, { method: 'DELETE' });
    loadChecklist();
  };

  const handleCheck = async (id, checked) => {
    await apiFetch(`/api/checklist/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !checked })
    });
    loadChecklist();
  };

  const sections = Array.from(new Set(items.map(i => i.section)));

  const renderSection = (section) => {
    const sectionItems = items.filter(i => i.section === section);
    const unchecked = sectionItems.filter(i => !i.checked);
    const checked = sectionItems.filter(i => i.checked);
    const sorted = unchecked.concat(checked);
    // Прогресс по секции
    const percent = sectionItems.length ? Math.round((checked.length / sectionItems.length) * 100) : 0;
    return (
      <div className="checklist-section-card" key={section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
          <h2 style={{ margin: 0 }}>{section}</h2>
          <ProgressCircle percent={percent} size={40} stroke={4} />
        </div>
        <form onSubmit={e => { e.preventDefault(); handleAdd(section); }} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="submit" className="checklist-add-btn material-symbols-outlined" title="Add">
        keyboard_return
          </button>
          <input
            value={newItem[section] || ''}
            onChange={e => setNewItem({ ...newItem, [section]: e.target.value })}
            placeholder="Add new item..."
            className="checklist-add-input"
            autoComplete="off"
          />
         
        </form>
        <ul className="checklist-ul">
          {sorted.map(item => (
            <li key={item.id} className={`checklist-item${item.checked ? ' checked' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => handleCheck(item.id, item.checked)}
                />
                <span>{item.item}</span>
              </label>
              <button className="checklist-del-btn material-symbols-outlined" onClick={() => handleDelete(item.id)} title="Delete">delete</button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const fetchHeroImage = async () => {
    try {
      const imageFilename = await heroImagesUtils.getHeroImage('checklist');
      if (imageFilename) {
        setHeroImage(heroImagesUtils.getImageUrl(imageFilename));
      }
    } catch (error) {
      console.error('Error loading hero image:', error);
    }
  };

  // Функция для вычисления общего прогресса чеклиста
  const getChecklistProgress = () => {
    if (!items.length) return 0;
    const total = items.length;
    const checked = items.filter(i => i.checked).length;
    return Math.round((checked / total) * 100);
  };

  // Компонент круговой диаграммы
  function ProgressCircle({ percent, size = 48, stroke = 5 }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - percent / 100);
    return (
      <svg width={size} height={size} style={{ marginRight: 18 }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e3e8ee"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#274DD3"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dy="0.35em"
          fontSize={size * 0.25}
          fill="#222"
          fontWeight={700}
        >
          {percent}%
        </text>
      </svg>
    );
  }

  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main">
        {/* Hero блок */}
        <div id="checklist-hero-banner" className="plan-hero hero-banner" style={{
          backgroundImage: heroImage ? `url(${heroImage})` : 'url(/src/assets/img/bike_bg.png)'
        }}>
          <h1>Checklist for Gran Fondo</h1>
          <div style={{
            fontSize: '0.9em',
            color: '#fff',
            opacity: '0.7',
            marginTop: '0.5em',
            maxWidth: '600px',
            marginLeft: '4.3em'
          }}>
            Everything you need to buy and do for a successful Gran Fondo start. Mark completed items — your progress will be saved.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: '3.9em', marginTop:"32px", gap: 16, position: 'relative' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button className=" accent-btn" onClick={() => setShowAddSection(s => !s)}>
                {showAddSection ? 'Cancel' : 'Add section'}
              </button>
              {showAddSection && (
                <div ref={addSectionRef} style={{
                  position: 'absolute',
                  left: 0,
                  top: '0%',
                  background: '#fff',
                  border: '1px solid #e3e8ee',
                 
                  boxShadow: '0 4px 16px 0 rgba(0,0,0,0.10)',
                  padding: '12px',
                  zIndex: 1000,
                  minWidth: 260,
                  maxWidth: 340,
                  minHeight: 150
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: '1.05em' }}>Add new section</div>
                  <form onSubmit={async e => {
                    e.preventDefault();
                    if (!firstSection.trim() || !firstItem.trim()) return;
                    await apiFetch('/api/checklist', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ section: firstSection.trim(), item: firstItem.trim() })
                    });
                    setFirstSection('');
                    setFirstItem('');
                    setShowAddSection(false);
                    loadChecklist();
                  }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      value={firstSection}
                      onChange={e => setFirstSection(e.target.value)}
                      placeholder="Section name (e.g. What to buy)"
                      className="checklist-add-input"
                      style={{ marginBottom: 8 }}
                      autoFocus
                    />
                    <input
                      value={firstItem}
                      onChange={e => setFirstItem(e.target.value)}
                      placeholder="First item (e.g. Bicycle)"
                      className="checklist-add-input"
                      style={{ marginBottom: 8 }}
                    />
                    <button type="submit" className="checklist-add-btn" title="Add">Add</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="checklist-row-grid">
          {items.length === 0 && !showAddSection ? (
            <div className="checklist-section-card" style={{ minWidth: 320 }}>
              <h2>Add your first checklist section</h2>
              <form onSubmit={async e => {
                e.preventDefault();
                if (!firstSection.trim() || !firstItem.trim()) return;
                await apiFetch('/api/checklist', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ section: firstSection.trim(), item: firstItem.trim() })
                });
                setFirstSection('');
                setFirstItem('');
                loadChecklist();
              }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  value={firstSection}
                  onChange={e => setFirstSection(e.target.value)}
                  placeholder="Section name (e.g. What to buy)"
                  className="checklist-add-input"
                  style={{ marginBottom: 8 }}
                />
                <input
                  value={firstItem}
                  onChange={e => setFirstItem(e.target.value)}
                  placeholder="First item (e.g. Bicycle)"
                  className="checklist-add-input"
                  style={{ marginBottom: 8 }}
                />
                <button type="submit" className="checklist-add-btn">Add section & item</button>
              </form>
            </div>
          ) : (
            sections.map(renderSection)
          )}
        </div>
      </div>
    </div>
  );
} 