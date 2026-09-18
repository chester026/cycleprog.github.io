import React, { useState } from 'react';
import './MyRidesBlock.css';
import { useRides, useDeleteRide } from '../data/hooks';
import { useConfirm, useToast, ErrorMessage, Loader } from '../ui';
import RideAddModal from './RideAddModal';

export default function MyRidesBlock() {
  // T-6.2: no more page-local cache — GET /api/rides goes through the
  // shared TanStack Query cache (useRides), always a fresh request on
  // first mount just like before, but shared with any other reader.
  const { data, isLoading: loading, error } = useRides();
  const deleteRideMutation = useDeleteRide();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingRide, setEditingRide] = useState(null);
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const rides = [...(data || [])].sort((a, b) => new Date(a.start) - new Date(b.start));

  // T-6.3 (audit W-21): `window.confirm` -> `useConfirm`.
  const deleteRide = async (id) => {
    const ok = await confirm({
      title: 'Delete ride',
      message: 'Delete this ride?',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRideMutation.mutateAsync(id);
    } catch {
      toast.error('Error deleting ride');
    }
  };

  const handleAddRide = () => {
    // useAddRide/useUpdateRide (RideAddModal) already invalidate the
    // `rides` query on success — the list here refetches on its own.
  };

  const openAddModal = () => {
    setEditingRide(null);
    setAddModalOpen(true);
  };

  const openEditModal = (ride) => {
    setEditingRide(ride);
    setAddModalOpen(true);
  };

  const closeModal = () => {
    setAddModalOpen(false);
    setEditingRide(null);
  };

  if (loading) {
    return (
      <div className="my-rides-loading">
        <Loader label="Loading rides..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-rides-error">
        <ErrorMessage>Loading error: {error.message}</ErrorMessage>
      </div>
    );
  }

  if (rides.length === 0) {
    return (
      <div className="my-rides-empty">
        <span>No planned rides yet</span>
        <button
          className="add-ride-btn"
          onClick={openAddModal}
        >
          Add Ride
        </button>

        <RideAddModal
          isOpen={addModalOpen}
          ride={editingRide}
          onClose={closeModal}
          onAdd={handleAddRide}
        />
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="rides-dynamic-block">
      <div className="rides-header">
        <button
          className="add-ride-btn"
          onClick={openAddModal}
        >
          + Add ride
        </button>
      </div>

      {rides.map((ride) => {
        const startDate = new Date(ride.start);
        const dateStr = startDate.toLocaleDateString('en-US', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        });
        const timeStr = startDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false // 24-hour format
        });

        return (
          <div key={ride.id} className="ride-card" data-ride-id={ride.id}>
            <button
              className="ride-card-edit"
              title="Edit ride"
              onClick={() => openEditModal(ride)}
            >
              ✎
            </button>
            <button
              className="ride-card-del"
              title="Delete ride"
              onClick={() => deleteRide(ride.id)}
            >
              &times;
            </button>
            <b className="ride-card-date">{dateStr}, {timeStr}</b><br />
            <span className="ride-card-place">
              Location: {ride.location}
              {ride.locationLink && (
                <>, <a href={ride.locationLink} target="_blank" rel="noopener noreferrer">location</a></>
              )}
            </span><br />
            {ride.details && (
              <div className="ride-card-details">{ride.details}</div>
            )}
          </div>
        );
      })}

      <RideAddModal
        isOpen={addModalOpen}
        ride={editingRide}
        onClose={closeModal}
        onAdd={handleAddRide}
      />
      {confirmDialog}
    </div>
  );
}
