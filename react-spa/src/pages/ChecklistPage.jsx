// Checklist & todos page in MaintenancePage's visual language: an overview
// card (progress ring, totals, "ask coach" banner) and then a board with one
// column of item cards per section. Structure mirrors the app's
// src/screens/ChecklistScreen.tsx and its screens/Checklist/* pieces; the
// data hooks (src/data/hooks/useChecklist.js) and the contract are the same
// ones the previous page used.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { groupBySection, computeOverview } from '@bikelab/shared/checklist';
import Footer from '../components/Footer';
import { ErrorMessage, Loader, useConfirm, useToast } from '../ui';
import {
  useChecklist,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useDeleteChecklistSection,
  useRenameChecklistSection,
} from '../data/hooks';
import OverviewCard from './checklist/OverviewCard';
import SectionGrid from './checklist/SectionGrid';
import NewItemSheet from './checklist/NewItemSheet';
import NewSectionSheet from './checklist/NewSectionSheet';
import SectionSheet from './checklist/SectionSheet';
import ItemDetailSheet from './checklist/ItemDetailSheet';
import { PlusIcon } from './checklist/icons';
import styles from './ChecklistPage.module.css';

// Same prompt the app sends (en.json checklist.askCoachPrompt).
const ASK_COACH_PROMPT = 'Can you help me with shopping and packing advice for my checklist?';

const NO_ROWS = [];

export default function ChecklistPage() {
  const navigate = useNavigate();
  const { data: rows = NO_ROWS, isLoading, isError, error } = useChecklist();

  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const deleteSection = useDeleteChecklistSection();
  const renameSection = useRenameChecklistSection();

  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const [addingToSection, setAddingToSection] = useState(null); // section name
  const [newSectionOpen, setNewSectionOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null); // ChecklistSection
  const [activeItemId, setActiveItemId] = useState(null);

  const sections = useMemo(() => groupBySection(rows), [rows]);
  const overview = useMemo(() => computeOverview(rows), [rows]);
  // Resolved from the cache so the open sheet reflects a save without closing.
  const activeItem = rows.find((row) => row.id === activeItemId) ?? null;
  const otherSections = activeItem
    ? sections.map((s) => s.section).filter((name) => name !== activeItem.section)
    : [];

  const run = async (mutation, input, failureMessage) => {
    try {
      await mutation.mutateAsync(input);
      return true;
    } catch {
      toast.error(failureMessage);
      return false;
    }
  };

  const handleToggle = (item) =>
    run(updateItem, { id: item.id, body: { checked: !item.checked } }, 'Failed to update the item. Please try again.');

  const handleAddItem = async (section, text) => {
    if (await run(addItem, { section, item: text }, 'Failed to add the item. Please try again.')) {
      setAddingToSection(null);
    }
  };

  const handleAddSection = async (section, item) => {
    if (await run(addItem, { section, item }, 'Failed to add the section. Please try again.')) {
      setNewSectionOpen(false);
    }
  };

  const handleRenameSection = async (newSection) => {
    if (!editingSection) return;
    if (newSection === editingSection.section) {
      setEditingSection(null);
      return;
    }
    const input = { section: editingSection.section, newSection };
    if (await run(renameSection, input, 'Failed to rename the section. Please try again.')) {
      setEditingSection(null);
    }
  };

  const handleDeleteSection = async () => {
    if (!editingSection) return;
    const { section, done, total } = editingSection;
    const ok = await confirm({
      title: `Delete section "${section}"?`,
      message: `This will remove ${total} item${total === 1 ? '' : 's'} (${done} completed). This action cannot be undone.`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (await run(deleteSection, section, 'Failed to delete the section. Please try again.')) {
      setEditingSection(null);
    }
  };

  const updateActiveItem = (body, failureMessage) => {
    if (!activeItem) return Promise.resolve(false);
    return run(updateItem, { id: activeItem.id, body }, failureMessage);
  };

  const handleRenameItem = async (text) => {
    if (await updateActiveItem({ item: text }, 'Failed to rename the item. Please try again.')) {
      setActiveItemId(null);
    }
  };

  const handleSaveLink = async (link) => {
    if (await updateActiveItem({ link: link || null }, 'Failed to save the link. Please try again.')) {
      setActiveItemId(null);
    }
  };

  const handleMoveItem = async (section) => {
    if (await updateActiveItem({ section }, 'Failed to move the item. Please try again.')) {
      setActiveItemId(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!activeItem) return;
    const ok = await confirm({ title: 'Delete item', message: `Delete "${activeItem.item}"?`, confirmText: 'Delete', danger: true });
    if (!ok) return;
    if (await run(deleteItem, activeItem.id, 'Failed to delete the item. Please try again.')) {
      setActiveItemId(null);
    }
  };

  const askCoach = () => navigate(`/coach?prompt=${encodeURIComponent(ASK_COACH_PROMPT)}`);

  let content;
  if (isLoading) {
    content = (
      <div className={styles.center}>
        <Loader label="Loading checklist..." tone="light" />
      </div>
    );
  } else if (isError) {
    content = (
      <div className={styles.center}>
        <ErrorMessage>Couldn&apos;t load checklist: {error?.message || 'unknown error'}</ErrorMessage>
      </div>
    );
  } else {
    content = (
      <>
        <OverviewCard overview={overview} onAskCoach={askCoach} />
        {sections.length === 0 && <p className={styles.emptyText}>Add your first checklist section</p>}
        <SectionGrid
          sections={sections}
          onToggleItem={handleToggle}
          onOpenItem={(item) => setActiveItemId(item.id)}
          onAddItem={setAddingToSection}
          onEditSection={setEditingSection}
          onNewSection={() => setNewSectionOpen(true)}
        />
      </>
    );
  }

  return (
    <div className="main-layout">
      <div className={`main ${styles.page}`}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Checklist</h1>
            <button type="button" className={styles.pillBtn} onClick={() => setNewSectionOpen(true)}>
              <PlusIcon size={14} />
              New section
            </button>
          </div>
          {content}
        </div>
      </div>

      <Footer />

      <NewItemSheet section={addingToSection} onClose={() => setAddingToSection(null)} onAdd={handleAddItem} />
      <NewSectionSheet
        open={newSectionOpen}
        saving={addItem.isPending}
        onClose={() => setNewSectionOpen(false)}
        onAdd={handleAddSection}
      />
      <SectionSheet
        key={editingSection?.section ?? 'none'}
        section={editingSection}
        saving={renameSection.isPending || deleteSection.isPending}
        onClose={() => setEditingSection(null)}
        onSave={handleRenameSection}
        onDelete={handleDeleteSection}
      />
      <ItemDetailSheet
        key={activeItemId ?? 'none'}
        item={activeItem}
        otherSections={otherSections}
        saving={updateItem.isPending || deleteItem.isPending}
        onClose={() => setActiveItemId(null)}
        onRename={handleRenameItem}
        onMove={handleMoveItem}
        onSaveLink={handleSaveLink}
        onDelete={handleDeleteItem}
      />
      {confirmDialog}
    </div>
  );
}
