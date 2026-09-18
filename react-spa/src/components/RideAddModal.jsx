import React, { useEffect, useState } from 'react';
import { useAddRide, useUpdateRide } from '../data/hooks';
import { useToast } from '../ui';
import Modal from '../ui/Modal';
import ErrorMessage from '../ui/ErrorMessage';
import './RideAddModal.css';

const EMPTY_FORM = { title: '', location: '', date: '', details: '' };

// T-6.3 (audit W-21/W-26): the ad-hoc `.ride-add-modal-overlay` markup is
// gone in favor of the shared `src/ui` Modal (portal, focus trap, Esc,
// body-scroll lock); `window.alert` on submit failure is gone in favor of
// `useToast`. Also now doubles as the "edit ride" form (MyRidesBlock) —
// pass `ride` to prefill the fields and PUT instead of POST.
const RideAddModal = ({ isOpen, onClose, onAdd, ride }) => {
  const isEdit = Boolean(ride);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const addRide = useAddRide();
  const updateRide = useUpdateRide();
  const loading = addRide.isPending || updateRide.isPending;
  const [errors, setErrors] = useState({});
  const toast = useToast();

  // Prefill the form when opening in edit mode, or opening fresh to add.
  useEffect(() => {
    if (!isOpen) return;
    if (ride) {
      setFormData({
        title: ride.title || '',
        location: ride.location || '',
        date: ride.start ? ride.start.slice(0, 10) : '',
        details: ride.details || '',
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setErrors({});
  }, [isOpen, ride]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Очищаем ошибку при изменении поля
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const response = isEdit
        ? await updateRide.mutateAsync({ id: ride.id, ...formData, start: formData.date })
        : await addRide.mutateAsync({ ...formData, start: formData.date });
      onAdd(response);
      handleClose();
    } catch {
      toast.error(isEdit ? 'Error updating ride' : 'Error adding ride');
    }
  };

  const handleClose = () => {
    setFormData(EMPTY_FORM);
    setErrors({});
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Edit Ride' : 'Add New Ride'}
      footer={
        <>
          <button className="ride-add-btn-cancel" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button className="ride-add-btn-submit" onClick={handleSubmit} disabled={loading}>
            {loading ? (isEdit ? 'Saving...' : 'Adding...') : isEdit ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <form className="ride-add-modal-content" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Ride title"
            className={errors.title ? 'error' : ''}
          />
          {errors.title && <ErrorMessage inline>{errors.title}</ErrorMessage>}
        </div>

        <div className="form-group">
          <label htmlFor="location">Location *</label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleInputChange}
            placeholder="Ride location"
            className={errors.location ? 'error' : ''}
          />
          {errors.location && <ErrorMessage inline>{errors.location}</ErrorMessage>}
        </div>

        <div className="form-group">
          <label htmlFor="date">Date *</label>
          <input
            type="date"
            id="date"
            name="date"
            value={formData.date}
            onChange={handleInputChange}
            className={errors.date ? 'error' : ''}
          />
          {errors.date && <ErrorMessage inline>{errors.date}</ErrorMessage>}
        </div>

        <div className="form-group">
          <label htmlFor="details">Description</label>
          <textarea
            id="details"
            name="details"
            value={formData.details}
            onChange={handleInputChange}
            placeholder="Ride description (optional)"
            rows="3"
          />
        </div>
      </form>
    </Modal>
  );
};

export default RideAddModal;
