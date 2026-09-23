// One modal chrome for every simple edit sheet in the app — originally built
// for the checklist screen (rename section, new item, new section, item
// detail: rename/move/link/delete — owner request, 19.09) and generic enough
// to reuse for the coach-memory note editor (CoachMemoryScreen):
// white rounded card, bold title, grey subtitle, grey input(s), a full-width
// blue pill for the primary action, and an optional plain-text destructive
// action below it. Pixels match the pre-existing "Rename section" sheet this
// was extracted from — moving it here changed nothing visual.
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
import {PrimaryButton} from './PrimaryButton';
import {makeStyles, useTheme} from '../theme';

export interface FormSheetField {
  key: string;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /** Small uppercase caption above the input (item detail's "Item name"/"Link"). Omit for a plain input. */
  label?: string;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: KeyboardTypeOptions;
  /** Multi-line input (coach-memory note editor) — grows to a few lines instead of one. */
  multiline?: boolean;
  maxLength?: number;
}

export interface FormSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  fields: FormSheetField[];
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onClose: () => void;
  /** Extra content between the fields and the primary button (open-link row, move-to-section chips, category chips). */
  children?: React.ReactNode;
  destructiveLabel?: string;
  onDestructivePress?: () => void;
}

export const FormSheet: React.FC<FormSheetProps> = ({
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
  const theme = useTheme();

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
                style={[styles.input, field.multiline && styles.inputMultiline]}
                value={field.value}
                onChangeText={field.onChangeValue}
                placeholder={field.placeholder}
                placeholderTextColor={theme.colors.separator}
                autoCapitalize={field.autoCapitalize}
                keyboardType={field.keyboardType}
                multiline={field.multiline}
                maxLength={field.maxLength}
                autoFocus={index === 0}
                // A multiline field's return key inserts a newline (the note
                // editor is the only multiline field today) — only a
                // single-line field submits/advances focus on return.
                returnKeyType={field.multiline ? 'default' : index === fields.length - 1 ? 'done' : 'next'}
                onSubmitEditing={
                  field.multiline
                    ? undefined
                    : () => {
                        const next = inputRefs.current[index + 1];
                        if (next) next.focus();
                        else onPrimaryPress();
                      }
                }
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
  title: {fontSize: 18, fontWeight: '800', color: theme.colors.text.primary, marginBottom: theme.spacing[6], letterSpacing: -0.3},
  hint: {fontSize: theme.typography.fontSize.base, color: theme.colors.text.iosMuted, lineHeight: 18, marginBottom: theme.spacing[16]},
  fieldLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.text.iosMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[8],
  },
  input: {
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing[16],
    paddingVertical: theme.spacing[14],
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[16],
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
    fontSize: theme.typography.fontSize.base,
    fontWeight: '500',
  },
  primaryBtn: {paddingVertical: theme.spacing[14]},
  destructiveRow: {alignItems: 'center', marginTop: theme.spacing[16], paddingVertical: theme.spacing[4]},
  destructiveText: {fontSize: theme.typography.fontSize.base, fontWeight: '600', color: theme.colors.danger},
}));
