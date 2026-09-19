// Back + centered title, same visual language as BikeGarage/Header.tsx
// (owner request: redesign Checklist in BikeGarage's visual language).
// Styles copied 1:1 from that header — kept as its own small component
// rather than importing BikeGarage's (a different screen's title/back
// target), same pattern BikeGarage itself uses for its own header.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles} from '../../theme';

export interface ChecklistHeaderProps {
  onBack: () => void;
}

export const ChecklistHeader: React.FC<ChecklistHeaderProps> = ({onBack}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
        <Text style={styles.backArrow}>{'‹'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('checklist.title')}</Text>
      <View style={styles.spacer} />
    </View>
  );
};

const styles = makeStyles(theme => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: theme.spacing[16],
    paddingBottom: theme.spacing[8],
  },
  backArrow: {fontSize: 32, color: '#1A1A1A', lineHeight: 34, fontWeight: '300'},
  headerTitle: {fontSize: 17, fontWeight: '600', color: '#1A1A1A', letterSpacing: -0.3},
  spacer: {width: 28},
}));
