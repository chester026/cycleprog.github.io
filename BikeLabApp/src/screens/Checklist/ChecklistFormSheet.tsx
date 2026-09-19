// One modal chrome for every checklist edit — rename section, new item, new
// section, and the item detail sheet (rename/move/link/delete) all render
// through this (owner request, 19.09): white rounded card, bold title, grey
// subtitle, grey input(s), a full-width blue pill for the primary action,
// and an optional plain-text destructive action below it. Pixels match the
// pre-existing "Rename section" sheet this was extracted from.
import React, {useRef} from 'react';
import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import {PrimaryButton} from '../../components/PrimaryButton';
import {makeStyles} from '../../theme';

export interface ChecklistFormField {
  key: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /** Small uppercase caption above the input (item detail's "Item name"/"Link"). Omit for a plain input. */
  label?: string;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: KeyboardTypeOptions;
}

export interface ChecklistFormSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  fields: ChecklistFormField[];
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onClose: () => void;
  /** Extra content between the fields and the primary button (open-link row, move-to-section chips). */
  children?: React.ReactNode;
  destructiveLabel?: string;
  onDestructivePress?: () => void;
}

export const ChecklistFormSheet: React.FC<ChecklistFormSheetProps> = ({
  visible,
  title,
  subtitle,
  fields,
  primaryLabel,
  onPrimaryPress,
  primaryDisabled,
  primaryLoading,
  onClose,
  children,
  destructiveLabel,
  onDestructivePress,
}) => {
  // One ref per field so the return key on all but the last field moves
  // focus to the next one, and the last field's return key submits —
  // "submit on keyboard return" (owner request).
  const inputRefs = useRef<Array<TextInput | null>>([]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.hint}>{subtitle}</Text> : null}

          {fields.map((field, index) => (
            <View key={field.key}>
              {field.label ? <Text style={styles.fieldLabel}>{field.label}</Text> : null}
              <TextInput
                ref={ref => {
                  inputRefs.current[index] = ref;
                }}
                style={styles.input}
                value={field.value}
                onChangeText={field.onChangeValue}
                placeholder={field.placeholder}
                placeholderTextColor="#C7C7CC"
                autoCapitalize={field.autoCapitalize}
                keyboardType={field.keyboardType}
                autoFocus={index === 0}
                returnKeyType={index === fields.length - 1 ? 'done' : 'next'}
                onSubmitEditing={() => {
                  const next = inputRefs.current[index + 1];
                  if (next) next.focus();
                  else onPrimaryPress();
                }}
              />
            </View>
          ))}

          {children}

          <PrimaryButton
            title={primaryLabel}
            onPress={onPrimaryPress}
            disabled={primaryDisabled}
            loading={primaryLoading}
            style={styles.primaryBtn}
          />

          {destructiveLabel ? (
            <TouchableOpacity style={styles.destructiveRow} onPress={onDestructivePress} accessibilityLabel={destructiveLabel}>
              <Text style={styles.destructiveText}>{destructiveLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[24],
  },
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 20,
    padding: theme.spacing[24],
    width: '100%',
  },
  title: {fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: theme.spacing[6], letterSpacing: -0.3},
  hint: {fontSize: theme.typography.fontSize.base, color: '#8E8E93', lineHeight: 18, marginBottom: theme.spacing[16]},
  fieldLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[14],
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: theme.spacing[16],
  },
  primaryBtn: {paddingVertical: theme.spacing[14]},
  destructiveRow: {alignItems: 'center', marginTop: theme.spacing[16], paddingVertical: theme.spacing[4]},
  destructiveText: {fontSize: theme.typography.fontSize.base, fontWeight: '600', color: theme.colors.danger},
}));
