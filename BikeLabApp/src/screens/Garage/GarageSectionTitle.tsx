// Big, faint uppercase section title shared by AchievementsPreview's
// "ACHIEVES" and ChecklistPreview's "CHECKLIST" (owner request, 19.09: the
// two must be pixel-identical). OverallStats/SnapshotWidgets use a
// different literal (fontSize 52, opacity 0.2) and stay as is.
import React from 'react';
import {Text} from 'react-native';
import {makeStyles} from '../../theme';

export interface GarageSectionTitleProps {
  title: string;
}

export const GarageSectionTitle: React.FC<GarageSectionTitleProps> = ({title}) => (
  <Text style={styles.title}>{title}</Text>
);

const styles = makeStyles(theme => ({
  title: {
    fontSize: 55,
    fontWeight: theme.typography.fontWeight.black,
    opacity: 0.15,
    textTransform: 'uppercase',
    color: theme.colors.text.primary,
    letterSpacing: -1,
  },
}));
