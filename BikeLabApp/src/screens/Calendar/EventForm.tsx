// Create/edit form for a calendar event, shown inside EventDetailSheet's
// modal (T-5.4/T-5.1, audit A-27).
import React, {useState} from 'react';
import {Platform, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import {makeStyles} from '../../theme';
import {getDateLocale} from '../../i18n/dateLocale';
import {EVENT_TYPES, type EventType} from './lib';
import {EVENT_COLORS} from './DayList';

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  type: string;
  date: Date;
}

interface EventFormProps {
  values: EventFormValues;
  saving: boolean;
  onChange: (values: EventFormValues) => void;
  onCancel: () => void;
  onSave: () => void;
}

export const EventForm: React.FC<EventFormProps> = ({values, saving, onChange, onCancel, onSave}) => {
  const {t} = useTranslation();
  const locale = getDateLocale();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    onChange({...values, [key]: value});

  return (
    <>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('calendar.eventDetails')}</Text>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.modalClose}>×</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.typeRow}>
        {EVENT_TYPES.map((type: EventType) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.typeChip,
              values.type === type && {backgroundColor: EVENT_COLORS[type], borderColor: EVENT_COLORS[type]},
            ]}
            onPress={() => set('type', type)}>
            <View style={[styles.typeChipDot, {backgroundColor: EVENT_COLORS[type]}]} />
            <Text style={[styles.typeChipText, values.type === type && styles.typeChipTextActive]}>
              {t(`calendar.types.${type}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('calendar.titleLabel')}</Text>
        <TextInput
          style={styles.formInput}
          placeholder={t('calendar.titlePlaceholder')}
          placeholderTextColor="#aaaaaa"
          value={values.title}
          onChangeText={text => set('title', text)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('calendar.dateLabel')}</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.datePickerText}>
            {values.date.toLocaleDateString(locale, {weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'})}
          </Text>
        </TouchableOpacity>
        {showDatePicker ? <DateTimePicker
            value={values.date}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_e: unknown, date?: Date) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (date) set('date', date);
            }}
            themeVariant="light"
          /> : null}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('calendar.locationLabel')}</Text>
        <TextInput
          style={styles.formInput}
          placeholder={t('calendar.locationPlaceholder')}
          placeholderTextColor="#aaaaaa"
          value={values.location}
          onChangeText={text => set('location', text)}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>{t('calendar.descriptionLabel')}</Text>
        <TextInput
          style={[styles.formInput, styles.formTextarea]}
          placeholder={t('calendar.descriptionPlaceholder')}
          placeholderTextColor="#aaaaaa"
          multiline
          numberOfLines={3}
          value={values.description}
          onChangeText={text => set('description', text)}
        />
      </View>

      <View style={styles.modalButtons}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
          <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitBtn} onPress={onSave} disabled={saving}>
          <Text style={styles.submitBtnText}>{saving ? t('calendar.saving') : t('calendar.save')}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = makeStyles(theme => ({
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[12],
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  modalClose: {
    fontSize: theme.typography.fontSize.xxxl + 4,
    color: '#999999',
    fontWeight: '300',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[16],
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[8],
  },
  typeChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing[6],
  },
  typeChipText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.medium,
    color: '#666666',
  },
  typeChipTextActive: {
    color: theme.colors.text.inverse,
  },
  formGroup: {
    marginBottom: theme.spacing[16],
  },
  formLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: '#666666',
    marginBottom: theme.spacing[6],
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[10],
    fontSize: theme.typography.fontSize.xl - 1,
    color: theme.colors.text.primary,
  },
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  datePickerBtn: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[12],
  },
  datePickerText: {
    fontSize: theme.typography.fontSize.xl - 1,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing[12],
    marginTop: theme.spacing[8],
  },
  cancelBtn: {
    flex: 1,
    padding: theme.spacing[14],
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: theme.radii.sm,
  },
  cancelBtnText: {
    fontSize: theme.typography.fontSize.xl - 1,
    fontWeight: theme.typography.fontWeight.medium,
    color: '#666666',
  },
  submitBtn: {
    flex: 1,
    padding: theme.spacing[14],
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.sm,
  },
  submitBtnText: {
    fontSize: theme.typography.fontSize.xl - 1,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.inverse,
  },
}));
