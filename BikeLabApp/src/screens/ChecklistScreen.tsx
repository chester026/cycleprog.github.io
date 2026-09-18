// Checklist & todos screen (owner decision 18.09, T-6.x) — ported "as is"
// from the web SPA's react-spa/src/pages/ChecklistPage.jsx: sections of
// items with a checkbox, per-section add-item input, delete item, delete
// section (confirm), and an "add section" form at the bottom. Owner will
// restyle later; this pass wires real data + navigation + theme tokens,
// not a redesign.
import React, {useState} from 'react';
import {View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useAppNavigation} from '../navigation/hooks';
import {makeStyles, useTheme} from '../theme';
import {
  useChecklist,
  useAddChecklistItem,
  useToggleChecklistItem,
  useDeleteChecklistItem,
  useDeleteChecklistSection,
} from '../data/hooks';
import type {ChecklistItem} from '@bikelab/shared/types';
import {groupBySection} from './Checklist/lib';
import {SectionCard} from './Checklist/SectionCard';

export const ChecklistScreen: React.FC = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useAppNavigation();

  const checklistQuery = useChecklist();
  const addItem = useAddChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const deleteSection = useDeleteChecklistSection();

  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionFirstItem, setNewSectionFirstItem] = useState('');

  const rows = checklistQuery.data ?? [];
  const sections = groupBySection(rows);

  const handleToggle = (item: ChecklistItem) => {
    toggleItem.mutate({id: item.id, checked: !item.checked});
  };

  const handleDeleteItem = (item: ChecklistItem) => {
    deleteItem.mutate(item.id);
  };

  const handleAddItem = (section: string, text: string) => {
    addItem.mutate({section, item: text});
  };

  const handleDeleteSection = (section: string) => {
    deleteSection.mutate(section);
  };

  const handleAddSection = () => {
    const section = newSectionName.trim();
    const item = newSectionFirstItem.trim();
    if (!section || !item) return;
    addItem.mutate({section, item});
    setNewSectionName('');
    setNewSectionFirstItem('');
  };

  if (checklistQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('checklist.title')}</Text>
          <View style={styles.headerRight} />
        </View>

        {sections.length === 0 ? (
          <Text style={styles.emptyText}>{t('checklist.empty')}</Text>
        ) : (
          sections.map(section => (
            <SectionCard
              key={section.section}
              section={section}
              onToggleItem={handleToggle}
              onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem}
              onDeleteSection={handleDeleteSection}
            />
          ))
        )}

        <View style={styles.addSectionCard}>
          <Text style={styles.addSectionTitle}>{t('checklist.addSection')}</Text>
          <TextInput
            style={styles.addSectionInput}
            value={newSectionName}
            onChangeText={setNewSectionName}
            placeholder={t('checklist.sectionNamePlaceholder')}
            placeholderTextColor={theme.colors.text.muted}
          />
          <TextInput
            style={styles.addSectionInput}
            value={newSectionFirstItem}
            onChangeText={setNewSectionFirstItem}
            placeholder={t('checklist.firstItemPlaceholder')}
            placeholderTextColor={theme.colors.text.muted}
            onSubmitEditing={handleAddSection}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addSectionButton} onPress={handleAddSection}>
            <Text style={styles.addSectionButtonText}>{t('checklist.addSection')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: '#f8f8fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8fa',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[12],
    backgroundColor: '#f8f8fa',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 32,
    color: theme.colors.black,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.black,
    letterSpacing: 0.5,
  },
  headerRight: {
    width: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.text.secondary,
    marginTop: theme.spacing[32],
    marginHorizontal: theme.spacing[16],
    fontSize: theme.typography.fontSize.base,
  },
  addSectionCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.md,
    padding: theme.spacing[16],
    marginHorizontal: theme.spacing[16],
    marginTop: theme.spacing[8],
  },
  addSectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[12],
  },
  addSectionInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[8],
  },
  addSectionButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing[10],
    alignItems: 'center',
    marginTop: theme.spacing[4],
  },
  addSectionButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.medium,
    fontSize: theme.typography.fontSize.base,
  },
}));
