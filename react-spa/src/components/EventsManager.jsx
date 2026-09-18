import React, { useState } from 'react';
import { useEvents, useSaveEvent, useDeleteEvent } from '../data/hooks';
import { useConfirm, useToast } from '../ui';
import Modal from '../ui/Modal';
import './EventsManager.css';
import styles from './EventsManager.module.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  link: '',
  start_date: '',
  background_color: '#274DD3',
};

// T-6.3 (audit W-21/W-26): the ad-hoc `.modal-overlay`/`.modal-content`
// markup (App.css's shared, pre-`src/ui` modal convention) is gone in favor
// of the shared Modal primitive; `window.confirm` on delete -> `useConfirm`.
export default function EventsManager({ isOpen, onClose }) {
  const { data: events = [], isFetching: loading } = useEvents();
  const saveEvent = useSaveEvent();
  const deleteEvent = useDeleteEvent();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  // Предустановленные цвета для выбора
  const colorOptions = [
    '#274DD3', // Default blue
    '#C24648', // Red
    '#2766D3', // Light blue
    '#ea580c', // Orange
    '#4127D3', // Purple
    '#D06C5C', // Salmon
    '#99A6B6', // Cold
    '#8A8A8A', // Gray
    '#252730', // Amber
    '#059669'  // Emerald
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'Event title is required';
    }

    if (!formData.start_date) {
      newErrors.start_date = 'Start date is required';
    }

    // Validate URL if provided
    if (formData.link && formData.link.trim()) {
      try {
        new URL(formData.link);
      } catch {
        newErrors.link = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      const eventData = {
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        link: formData.link?.trim() || null,
        start_date: formData.start_date,
        background_color: formData.background_color
      };

      await saveEvent.mutateAsync({ id: editingEvent?.id, body: eventData });

      handleCloseForm();
    } catch {
      setErrors({ submit: 'Failed to save event. Please try again.' });
    }
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      link: event.link || '',
      start_date: event.start_date.split('T')[0], // Convert to YYYY-MM-DD format
      background_color: event.background_color
    });
    setShowForm(true);
    setErrors({});
  };

  const handleDelete = async (eventId) => {
    const ok = await confirm({
      title: 'Delete event',
      message: 'Are you sure you want to delete this event?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteEvent.mutateAsync(eventId);
    } catch {
      toast.error('Error deleting event');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingEvent(null);
    setFormData(EMPTY_FORM);
    setErrors({});
  };

  const handleAddNew = () => {
    setEditingEvent(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
    setErrors({});
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={showForm ? (editingEvent ? 'Edit Event' : 'Add New Event') : 'Events Manager'}
      className={`events-manager ${styles.dialog}`}
    >
      {!showForm ? (
        <>
          <div className="events-header">
            <p>Manage your trips, competitions, and upcoming events</p>
            <button className="accent-btn" onClick={handleAddNew} disabled={loading}>
              Add New Event
            </button>
          </div>

          {loading ? (
            <div className="loading-state">Loading events...</div>
          ) : events.length > 0 ? (
            <div className="events-grid">
              {events.map(event => (
                <div key={event.id} className="event-card" style={{ borderLeftColor: event.background_color }}>
                  <div className="event-header">
                    <h3>{event.title}</h3>
                    <div className="event-actions">
                      <button className="edit-btn" onClick={() => handleEdit(event)}>
                        Edit
                      </button>
                      <button className="delete-btn" onClick={() => handleDelete(event.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="event-details">
                    <p className="event-date">{formatDate(event.start_date)}</p>
                    {event.description && (
                      <p className="event-description">{event.description}</p>
                    )}
                    {event.link && (
                      <a href={event.link} target="_blank" rel="noopener noreferrer" className="event-link">
                        View Details →
                      </a>
                    )}
                  </div>
                  <div className="event-color-indicator" style={{ backgroundColor: event.background_color }}></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No events yet. Add your first trip or competition!</p>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-group">
            <label htmlFor="title">Event Title *</label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="e.g., Gran Fondo Italia 2024"
              maxLength="255"
              required
            />
            {errors.title && <span className="error">{errors.title}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Event details, distances, qualification info, etc."
              rows="4"
              maxLength="1000"
            />
            {errors.description && <span className="error">{errors.description}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="link">Event Link</label>
            <input
              type="url"
              id="link"
              value={formData.link}
              onChange={(e) => handleInputChange('link', e.target.value)}
              placeholder="https://example.com/event"
            />
            {errors.link && <span className="error">{errors.link}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="start_date">Start Date *</label>
            <input
              type="date"
              id="start_date"
              value={formData.start_date}
              onChange={(e) => handleInputChange('start_date', e.target.value)}
              required
            />
            {errors.start_date && <span className="error">{errors.start_date}</span>}
          </div>

          <div className="form-group">
            <label>Background Color</label>
            <div className="color-options">
              {colorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${formData.background_color === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleInputChange('background_color', color)}
                  title={color}
                ></button>
              ))}
            </div>
          </div>

          {errors.submit && (
            <div className="error-message">{errors.submit}</div>
          )}

          <div className="form-actions">
            <button type="button" onClick={handleCloseForm} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="accent-btn" disabled={loading}>
              {loading ? 'Saving...' : editingEvent ? 'Update Event' : 'Add Event'}
            </button>
          </div>
        </form>
      )}
      {confirmDialog}
    </Modal>
  );
}
