// Checklist & todos screen, redesigned in BikeGarage's visual language
// (owner request, 19.09): header + overview ring card with an attached
// "ask coach" footer + per-section grids of light-grey cards, mirroring
// src/screens/BikeGarageScreen.tsx's composition. Data hooks/contract are
// unchanged (see src/data/hooks/useChecklist.ts) — this pass is a redesign
// of the screen and its pieces only.
import React, {useMemo, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAppNavigation, useAppRoute} from '../navigation/hooks';
import {makeStyles, useTheme} from '../theme';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';
import {
  useChecklist,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useToggleChecklistItem,
  useDeleteChecklistItem,
  useDeleteChecklistSection,
  useRenameChecklistSection,
} from '../data/hooks';
import type {ChecklistItem} from '@bikelab/shared/types';
import {computeCardWidth} from './BikeGarage/lib';
import {groupBySection, computeOverview, type ChecklistSection} from './Checklist/lib';
import {ChecklistHeader} from './Checklist/Header';
import {ChecklistOverviewCard} from './Checklist/OverviewCard';
import {SectionGrid} from './Checklist/SectionGrid';
import {SectionSheet} from './Checklist/SectionSheet';
import {ItemDetailSheet} from './Checklist/ItemDetailSheet';
import {NewSectionSheet} from './Checklist/NewSectionSheet';

export const ChecklistScreen: React.FC = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const route = useAppRoute<'Checklist'>();
  const insets = useSafeAreaInsets();
  const {width: screenWidth} = useWindowDimensions();
  const cardWidth = computeCardWidth(screenWidth);

  const checklistQuery = useChecklist();
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const deleteSection = useDeleteChecklistSection();
  const renameSection = useRenameChecklistSection();

  const [editingSection, setEditingSection] = useState<ChecklistSection | null>(null);
  const [sectionNameDraft, setSectionNameDraft] = useState('');
  const [activeItem, setActiveItem] = useState<ChecklistItem | null>(null);
  const [newSectionOpen, setNewSectionOpen] = useState(!!route?.params?.focusAddItem);

  const rows = useMemo(() => checklistQuery.data ?? [], [checklistQuery.data]);
  const sections = useMemo(() => groupBySection(rows), [rows]);
  const overview = useMemo(() => computeOverview(rows), [rows]);

  const handleToggle = (item: ChecklistItem) => {
    toggleItem.mutate({id: item.id, checked: !item.checked});
  };

  const handleAddItem = (section: string, text: string) => {
    addItem.mutate({section, item: text});
  };

  const handleAddSection = (section: string, item: string) => {
    addItem.mutate({section, item});
    setNewSectionOpen(false);
  };

  const openEditSection = (section: ChecklistSection) => {
    setEditingSection(section);
    setSectionNameDraft(section.section);
  };

  const closeEditSection = () => {
    setEditingSection(null);
    setSectionNameDraft('');
  };

  const saveEditSection = () => {
    if (!editingSection || !sectionNameDraft.trim()) return;
    const newSection = sectionNameDraft.trim();
    if (newSection !== editingSection.section) {
      renameSection.mutate({section: editingSection.section, newSection});
    }
    closeEditSection();
  };

  const confirmDeleteSection = () => {
    if (!editingSection) return;
    deleteSection.mutate(editingSection.section);
    closeEditSection();
  };

  const closeItemDetail = () => setActiveItem(null);

  const otherSectionsFor = (item: ChecklistItem) =>
    sections.map(s => s.section).filter(name => name !== item.section);

  return (
    <View style={styles.container} testID="checklist-screen">
      <ChecklistHeader onBack={() => navigation.goBack()} />

      {checklistQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ChecklistOverviewCard
            overview={overview}
            onAskCoach={() =>
              navigation.navigate('CoachChat', {
                initialPrompt: t('checklist.askCoachPrompt'),
                requestId: Date.now(),
              })
            }
          />

          {sections.length === 0 ? (
            <Text style={styles.emptyText}>{t('checklist.empty')}</Text>
          ) : (
            sections.map(section => (
              <SectionGrid
                key={section.section}
                section={section}
                cardWidth={cardWidth}
                onToggleItem={handleToggle}
                onLongPressItem={setActiveItem}
                onAddItem={handleAddItem}
                onEditSection={() => openEditSection(section)}
              />
            ))
          )}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[styles.newSectionFab, {bottom: DEFAULT_TAB_BAR_STYLE.height + insets.bottom + 16}]}
        onPress={() => setNewSectionOpen(true)}
        activeOpacity={0.85}>
        <Text style={styles.newSectionFabText}>{t('checklist.addSection')}</Text>
      </TouchableOpacity>

      <NewSectionSheet
        visible={newSectionOpen}
        saving={addItem.isPending}
        onClose={() => setNewSectionOpen(false)}
        onAdd={handleAddSection}
      />

      <SectionSheet
        section={editingSection}
        value={sectionNameDraft}
        saving={renameSection.isPending}
        onChangeValue={setSectionNameDraft}
        onClose={closeEditSection}
        onSave={saveEditSection}
        onDelete={confirmDeleteSection}
      />

      <ItemDetailSheet
        item={activeItem}
        otherSections={activeItem ? otherSectionsFor(activeItem) : []}
        saving={deleteItem.isPending}
        onClose={closeItemDetail}
        onRename={text => {
          if (activeItem) updateItem.mutate({id: activeItem.id, body: {item: text}});
          closeItemDetail();
        }}
        onMove={section => {
          if (activeItem) updateItem.mutate({id: activeItem.id, body: {section}});
          closeItemDetail();
        }}
        onSaveLink={link => {
          if (activeItem) updateItem.mutate({id: activeItem.id, body: {link: link || null}});
          closeItemDetail();
        }}
        onDelete={() => {
          if (activeItem) deleteItem.mutate(activeItem.id);
          closeItemDetail();
        }}
      />
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  loadingContainer: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  // Extra bottom padding so the pinned "New section" pill never covers the
  // last section's grid (same reasoning as Calendar's DayList bottomPadding).
  scrollContent: {paddingHorizontal: 16, paddingBottom: 160},
  emptyText: {textAlign: 'center', color: '#8E8E93', marginTop: 40, fontSize: 15},
  // Pinned "New section" pill — copied 1:1 from CalendarScreen's planFab
  // (owner request: same pinned-pill language across screens).
  newSectionFab: {
    position: 'absolute',
    bottom: 20,
    marginBottom: -24,
    alignSelf: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[14],
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  newSectionFabText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
}));
