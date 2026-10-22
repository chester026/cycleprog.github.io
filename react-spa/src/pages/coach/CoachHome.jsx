import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useActivities, useCoachConversations } from '../../data/hooks';
import { SegmentedControl } from '../../ui';
import GoalsHero from '../goals/GoalsHero';
import MetaGoalList from '../goals/MetaGoalList';
import Footer from '../../components/Footer';
import CoachHomePromptInput from './CoachHomePromptInput';
import SuggestedActions from './SuggestedActions';
import ConversationList from './ConversationList';
import { buildQuickStartSuggestions } from './lib';
import { t } from './copy';
import styles from './CoachHome.module.css';

const SECTIONS = [
  { value: 'coach', label: t('coach.headerTitle'), testId: 'coach-tab' },
  { value: 'goals', label: t('coach.goalsTabTitle'), testId: 'goals-tab' },
];

const quickStartSuggestions = buildQuickStartSuggestions();

/**
 * `/coach` home: hero greeting + prompt + quick-start chips, then the
 * AI Coach / Goals section switch over the recent-chats list or the goals
 * panel. Both sections share the hero because both land in the same chat.
 */
export default function CoachHome({ onHomeSubmit, onQuickStart, onOpenConversation, onDeleteConversation, onRenameConversation, onNewChat }) {
  const { user } = useAuth();
  const { data: activitiesData } = useActivities();
  const conversations = useCoachConversations();
  const [section, setSection] = useState('coach');

  const firstName = user?.name?.trim().split(/\s+/)[0] || t('coach.greetingFallbackName');

  return (
    <div className={styles.home} data-testid="coach-home">
      <GoalsHero userName={firstName} subtitle={t('coach.homeSubtitle')} activities={activitiesData || []}>
        <CoachHomePromptInput onSubmit={onHomeSubmit} />
        <SuggestedActions
          items={quickStartSuggestions}
          onPress={onQuickStart}
          label={t('coach.quickStartLabel')}
          className={styles.quickStart}
        />
      </GoalsHero>

      <div className={styles.sectionSwitch}>
        <SegmentedControl aria-label="Coach section" options={SECTIONS} value={section} onChange={setSection} />
      </div>

      {section === 'coach' ? (
        <ConversationList
          conversations={conversations.data ?? []}
          isLoading={conversations.isLoading}
          isError={conversations.isError}
          onOpen={onOpenConversation}
          onDelete={onDeleteConversation}
          onRename={onRenameConversation}
          onNewChat={onNewChat}
        />
      ) : (
        <MetaGoalList />
      )}

      <Footer />
    </div>
  );
}
