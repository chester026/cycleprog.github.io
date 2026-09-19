import React, { useState, useEffect, useRef } from 'react';

import './ChecklistPage.css';
import { getHeroImageUrl } from '../utils/heroImages';
import PageLoadingOverlay from '../components/PageLoadingOverlay';
import Footer from '../components/Footer';
import defaultHeroImage from '../assets/img/hero/bn.webp';
import { useConfirm, useToast } from '../ui';
import {
  useChecklist,
  useHeroImages,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useDeleteChecklistSection,
} from '../data/hooks';

export default function ChecklistPage() {
  // T-6.2: checklist items and the hero image both come from the shared
  // TanStack Query cache now — no more page-local loadChecklist()/
  // heroImagesUtils fetch-on-mount pair.
  const { data: itemsData, isLoading: pageLoading } = useChecklist();
  const items = itemsData || [];
  const { data: heroImagesData } = useHeroImages();
  const heroImage = getHeroImageUrl(heroImagesData?.checklist);

  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const deleteSection = useDeleteChecklistSection();

  const [newItem, setNewItem] = useState({}); // { [section]: text }
  const [firstSection, setFirstSection] = useState('');
  const [firstItem, setFirstItem] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const [editingLink, setEditingLink] = useState(null); // { itemId, link }
  const addSectionRef = useRef();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

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

  // Закрытие редактирования ссылки при клике вне и Escape
  useEffect(() => {
    const clickHandler = (e) => {
      if (editingLink && !e.target.closest('.checklist-link-container')) {
        setEditingLink(null);
      }
    };
    
    const keyHandler = (e) => {
      if (e.key === 'Escape' && editingLink) {
        setEditingLink(null);
      }
    };
    
    document.addEventListener('mousedown', clickHandler);
    document.addEventListener('keydown', keyHandler);
    
    return () => {
      document.removeEventListener('mousedown', clickHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [editingLink]);

  const handleAdd = async (section) => {
    const text = (newItem[section] || '').trim();
    if (!text) return;
    await addItem.mutateAsync({ section, item: text });
    setNewItem({ ...newItem, [section]: '' });
  };

  // T-6.3 (audit W-21): `window.confirm`/`alert` -> `useConfirm`/`useToast`.
  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete item', message: 'Delete this item?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    await deleteItem.mutateAsync(id);
  };

  const handleDeleteSection = async (section) => {
    const sectionItems = items.filter(i => i.section === section);
    const itemCount = sectionItems.length;
    const checkedCount = sectionItems.filter(i => i.checked).length;

    const ok = await confirm({
      title: `Delete section "${section}"?`,
      message: `This will remove ${itemCount} item${itemCount !== 1 ? 's' : ''} ` +
        `(${checkedCount} completed, ${itemCount - checkedCount} remaining). This action cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteSection.mutateAsync(section);
    } catch {
      toast.error('Error deleting section');
    }
  };

  const handleCheck = async (id, checked) => {
    await updateItem.mutateAsync({ id, body: { checked: !checked } });
  };

  const handleLinkClick = (item) => {
    if (item.link) {
      window.open(item.link, '_blank');
    } else {
      // Если ссылки нет, открываем режим редактирования
      setEditingLink({ itemId: item.id, link: '' });
    }
  };

  const handleClearLink = async (itemId, event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await updateItem.mutateAsync({ id: itemId, body: { link: '' } });
    } catch (error) {
      console.error('Error clearing link:', error);
    }
  };

  const handleLinkSave = async () => {
    if (editingLink && editingLink.itemId) {
      try {
        await updateItem.mutateAsync({
          id: editingLink.itemId,
          body: { link: editingLink.link.trim() },
        });
      } catch (error) {
        console.error('Error saving link:', error);
      }
    }
    setEditingLink(null);
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
          <button 
            className="checklist-section-del-btn material-symbols-outlined" 
            onClick={() => handleDeleteSection(section)} 
            title="Delete section"
            style={{ marginLeft: 'auto' }}
          >
            delete_sweep
          </button>
        </div>
        <form onSubmit={e => { e.preventDefault(); handleAdd(section); }} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="submit" className="checklist-add-btn material-symbols-outlined" title="Add">
        keyboard_return
          </button>
          <input
            value={newItem[section] || ''}
            onChange={e => setNewItem({ ...newItem, [section]: e.target.value })}
            placeholder="Add new item..."
            aria-label="Add new item"
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
              <div className="checklist-item-actions">
                                                    <div className="checklist-link-container">
                    <button 
                      className={`checklist-link-btn material-symbols-outlined ${item.link ? 'has-link' : ''}`}
                      onClick={() => handleLinkClick(item)}
                      title={item.link ? 'Click to open link' : 'Click to add link'}
                    >
                      link
                    </button>
                    {editingLink && editingLink.itemId === item.id && (
                      <div className="checklist-link-tooltip show ">
                        <input
                          type="url"
                          value={editingLink.link}
                          onChange={(e) => setEditingLink(prev => ({ ...prev, link: e.target.value }))}
                          placeholder="Enter URL..."
                          aria-label="Item link URL"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleLinkSave();
                            }
                          }}
                        />
                        <div className="material-symbols-outlined">
                          keyboard_return
                        </div>
                      </div>
                    )}
                    {item.link && (
                      <div className="checklist-link-clear-tooltip">
                        <button 
                          className="checklist-link-clear-btn"
                          onClick={(e) => handleClearLink(item.id, e)}
                          title="Clear link"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                <button 
                  className="checklist-del-btn material-symbols-outlined" 
                  onClick={() => handleDelete(item.id)} 
                  title="Delete"
                >
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // T-6.3 (audit W-26): dropped `getChecklistProgress` — dead code, nothing
  // rendered the overall-progress number it computed (only per-section
  // `percent` inside `renderSection` is shown, via `ProgressCircle`).

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
      <PageLoadingOverlay isLoading={pageLoading} loadingText="Loading checklist..." />
            <div className="main">
        {!pageLoading && (
          <>
            {/* Hero блок */}
            <div id="checklist-hero-banner" className="plan-hero hero-banner" style={{
          backgroundImage: heroImage ? `url(${heroImage})` : `url(${defaultHeroImage})`
        }}>
          <h1>Checklist & todos</h1>
          <div className="checklist-hero-description">
            Everything you need to buy and do for a successful Gran Fondo start. Mark completed items — your progress will be saved.
          </div>
          <div className="checklist-hero-button-container">
            <div className="checklist-hero-add-section-wrapper">
              <button className="accent-btn" onClick={() => setShowAddSection(s => !s)}>
                {showAddSection ? 'Cancel' : 'Add section'}
              </button>
              {showAddSection && (
                <div ref={addSectionRef} className="checklist-add-section-popover">
                  <div className="checklist-add-section-popover-title">Add new section</div>
                  <form onSubmit={async e => {
                    e.preventDefault();
                    if (!firstSection.trim() || !firstItem.trim()) return;
                    await addItem.mutateAsync({ section: firstSection.trim(), item: firstItem.trim() });
                    setFirstSection('');
                    setFirstItem('');
                    setShowAddSection(false);
                  }} className="checklist-add-section-form">
                    <input
                      value={firstSection}
                      onChange={e => setFirstSection(e.target.value)}
                      placeholder="Section name (e.g. What to buy)"
                      aria-label="Section name"
                      className="checklist-add-input"
                    />
                    <input
                      value={firstItem}
                      onChange={e => setFirstItem(e.target.value)}
                      placeholder="First item (e.g. Bicycle)"
                      aria-label="First item"
                      className="checklist-add-input"
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
                await addItem.mutateAsync({ section: firstSection.trim(), item: firstItem.trim() });
                setFirstSection('');
                setFirstItem('');
              }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  value={firstSection}
                  onChange={e => setFirstSection(e.target.value)}
                  placeholder="Section name (e.g. What to buy)"
                  aria-label="Section name"
                  className="checklist-add-input"
                  style={{ marginBottom: 8 }}
                />
                <input
                  value={firstItem}
                  onChange={e => setFirstItem(e.target.value)}
                  placeholder="First item (e.g. Bicycle)"
                  aria-label="First item"
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
          </>
        )}
      </div>
      
      <Footer />
      {confirmDialog}
    </div>
  );
}