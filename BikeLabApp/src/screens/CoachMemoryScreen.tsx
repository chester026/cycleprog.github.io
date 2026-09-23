// "What your coach remembers" — dedicated Profile sub-screen for coach
// memory (packages/shared/src/types/coachNotes.ts): short facts the coach
// picked up in conversation ("prefers morning rides") or the rider typed
// here directly, capped at COACH_NOTES_MAX so the system prompt built from
// them stays a paragraph. Replaces the old inline Profile/CoachMemorySection
// (owner request) — Profile now just links here via a single SettingsItem.
// Add/edit reuses FormSheet, the one modal chrome the Checklist screen
// already uses, with a category chip row as its extra content — carried
// over unchanged from CoachMemorySection.
import React, {useState} from 'react';
import {ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  COACH_NOTES_MAX,
  COACH_NOTE_CATEGORIES,
  COACH_NOTE_MAX_LENGTH,
  type CoachNote,
  type CoachNoteCategory,
} from '@bikelab/shared/types';
import {FormSheet} from '../components/FormSheet';
import {
  useCoachNotes,
  useCreateCoachNote,
  useUpdateCoachNote,
  useDeleteCoachNote,
} from '../data/hooks/useCoachNotes';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';

const CATEGORY_LABEL_KEYS: Record<CoachNoteCategory, string> = {
  preference: 'coachMemory.categoryPreference',
  health: 'coachMemory.categoryHealth',
  constraint: 'coachMemory.categoryConstraint',
  equipment: 'coachMemory.categoryEquipment',
  goal: 'coachMemory.categoryGoal',
  other: 'coachMemory.categoryOther',
};

export const CoachMemoryScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // ProfileStack sits inside MainTabs (same as GarageStack/Checklist), so the
  // bottom tab bar stays visible here — the pinned "Add note" pill needs to
  // clear it, exactly like ChecklistScreen's newSectionFab.
  const insets = useSafeAreaInsets();
  const notesQuery = useCoachNotes();
  const createNote = useCreateCoachNote();
  const updateNote = useUpdateCoachNote();
  const deleteNote = useDeleteCoachNote();

  const [editing, setEditing] = useState<CoachNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [category, setCategory] = useState<CoachNoteCategory>('other');

  const notes = notesQuery.data ?? [];
  const sheetVisible = creating || !!editing;

  const openCreate = () => {
    setNoteText('');
    setCategory('other');
    setCreating(true);
  };

  const openEdit = (note: CoachNote) => {
    setNoteText(note.note);
    setCategory(note.category);
    setEditing(note);
  };

  const closeSheet = () => {
    setCreating(false);
    setEditing(null);
  };

  const handleSave = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    if (editing) {
      await updateNote.mutateAsync({id: editing.id, body: {note: trimmed, category}});
    } else {
      await createNote.mutateAsync({note: trimmed, category});
    }
    closeSheet();
  };

  const confirmDelete = (note: CoachNote) => {
    Alert.alert(t('coachMemory.deleteConfirmTitle'), t('coachMemory.deleteConfirmMessage'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteNote.mutate(note.id);
          if (editing?.id === note.id) closeSheet();
        },
      },
    ]);
  };

  const saving = createNote.isPending || updateNote.isPending;

  // Reached from the chat's CoachMemoryCard this can be the only route in
  // ProfileStack — goBack() would then leave the tab, so fall back to Profile.
  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Profile');
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('coachMemory.title')}</Text>
        <Text style={styles.cap}>{t('coachMemory.cap', {count: notes.length, max: COACH_NOTES_MAX})}</Text>
      </View>

      {notesQuery.isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={theme.colors.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {notes.length === 0 ? (
            <Text style={styles.emptyState}>{t('coachMemory.empty')}</Text>
          ) : (
            notes.map(note => (
              <TouchableOpacity key={note.id} style={styles.noteCard} onPress={() => openEdit(note)} testID={`coach-note-${note.id}`}>
                <View style={styles.noteBody}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{t(CATEGORY_LABEL_KEYS[note.category])}</Text>
                  </View>
                  <Text style={styles.noteText} numberOfLines={2}>
                    {note.note}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => confirmDelete(note)}
                  hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                  accessibilityLabel={t('coachMemory.deleteNote')}
                  testID={`coach-note-delete-${note.id}`}>
                  <Text style={styles.trashIcon}>{'✕'}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {notes.length < COACH_NOTES_MAX && (
        <TouchableOpacity
          style={[styles.addNoteFab, {bottom: DEFAULT_TAB_BAR_STYLE.height + insets.bottom + 16}]}
          onPress={openCreate}
          activeOpacity={0.85}>
          <Text style={styles.addNoteFabText}>{t('coachMemory.addNote')}</Text>
        </TouchableOpacity>
      )}

      <FormSheet
        visible={sheetVisible}
        title={editing ? t('coachMemory.editNoteTitle') : t('coachMemory.addNoteTitle')}
        fields={[
          {
            key: 'note',
            value: noteText,
            onChangeValue: setNoteText,
            placeholder: t('coachMemory.notePlaceholder'),
            multiline: true,
            maxLength: COACH_NOTE_MAX_LENGTH,
          },
        ]}
        primaryLabel={editing ? t('common.save') : t('coachMemory.addNote')}
        onPrimaryPress={handleSave}
        primaryDisabled={!noteText.trim()}
        primaryLoading={saving}
        onClose={closeSheet}
        destructiveLabel={editing ? t('coachMemory.deleteNote') : undefined}
        onDestructivePress={editing ? () => confirmDelete(editing) : undefined}>
        <Text style={styles.categoryLabel}>{t('coachMemory.categoryLabel')}</Text>
        <View style={styles.chipRow}>
          {COACH_NOTE_CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}>
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                {t(CATEGORY_LABEL_KEYS[cat])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </FormSheet>
    </View>
  );
};

const styles = makeStyles(theme => ({
  root: {flex: 1, backgroundColor: theme.colors.backgroundLight},
  header: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  backArrow: {fontSize: 32, color: theme.colors.text.primary, lineHeight: 34, fontWeight: '300', marginBottom: 4},
  title: {fontSize: 32, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.8},
  cap: {fontSize: 14, fontWeight: '600', color: theme.colors.text.iosMuted, marginTop: 4},
  loading: {marginTop: theme.spacing[24]},
  // Extra bottom padding so the pinned "Add note" pill never covers the
  // last card — same reasoning as ChecklistScreen's scrollContent.
  scrollContent: {padding: 20, paddingBottom: 140},
  emptyState: {
    fontSize: 14,
    color: theme.colors.text.iosMuted,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: theme.spacing[24],
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: theme.spacing[12],
    gap: theme.spacing[8],
  },
  noteBody: {flex: 1},
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.coachMemory.pillBg,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: 2,
    marginBottom: theme.spacing[4],
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.coachMemory.pillText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noteText: {fontSize: 14, color: theme.colors.black, lineHeight: 19},
  trashIcon: {fontSize: 14, color: theme.colors.coachMemory.trashIcon, paddingHorizontal: theme.spacing[4]},
  // Pinned "Add note" pill — copied 1:1 from ChecklistScreen's
  // newSectionFab (owner request: same pinned-pill language across screens).
  addNoteFab: {
    position: 'absolute',
    bottom: 20,
    // Same -24 nudge as CalendarScreen's planFab — without it the pill sits
    // a full step higher than the calendar's, which the owner noticed.
    marginBottom: -24,
    alignSelf: 'center',
    backgroundColor: theme.colors.black,
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[14],
    borderRadius: 24,
    shadowColor: theme.colors.black,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  addNoteFabText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  categoryLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text.iosMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[8],
  },
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[8], marginBottom: theme.spacing[8]},
  chip: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing[14],
    paddingVertical: theme.spacing[8],
  },
  chipActive: {backgroundColor: theme.colors.accent},
  chipText: {fontSize: theme.typography.fontSize.base, fontWeight: '600', color: theme.colors.text.primary},
  chipTextActive: {color: theme.colors.text.inverse},
}));
