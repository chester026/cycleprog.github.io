// Uppercase, letter-spaced section header with an optional pencil-edit
// affordance — shared between BikeGarage's component groups and the
// Checklist screen's sections (owner request: redesign Checklist in
// BikeGarage's visual language). Styles are copied 1:1 from the header row
// BikeGarage/ComponentsGrid.tsx used to render inline, so extracting this
// didn't change BikeGarage's pixels.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {EditIcon} from '../assets/img/icons/EditIcon';
import {makeStyles, useTheme} from '../theme';

export interface SectionHeaderProps {
  title: string;
  /** Omit to render a plain, non-editable header. */
  onEdit?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({title, onEdit}) => {
  const theme = useTheme();
  if (!onEdit) {
    return (
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onEdit}
      activeOpacity={0.6}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Text style={styles.title}>{title}</Text>
      <EditIcon size={13} color={theme.colors.separator} />
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[6],
    marginBottom: theme.spacing[10],
    marginTop: theme.spacing[20],
  },
  title: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text.iosMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
}));
