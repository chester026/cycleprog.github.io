// The coach tab's "home" view — segmented Coach/Goals tabs, the greeting
// hero, quick-start chips, and either the recent-chats list or GoalsPanel
// underneath. Extracted from CoachChatScreen (T-5.x wave 2 decomposition);
// still fairly large because it owns most of this screen's visual chrome
// (blob backdrop, segmented control, empty states) — behaviour/pixels are
// unchanged from the pre-decomposition screen.
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {AppNavigationProp} from '../../navigation/types';
import {ConversationSummary, SuggestionItem} from '../../types/coach';
import {ConversationListItem} from '../../components/coach/ConversationListItem';
import {GoalsPanel} from '../../components/coach/GoalsPanel';
import {CoachHomeHero} from '../../components/coach/CoachHomeHero';
import {CoachHomePromptInput} from '../../components/coach/CoachHomePromptInput';
import BlobOrb from '../../components/BlobOrb';
import {SuggestionChips} from './SuggestionChips';
import {makeStyles, useTheme, withOpacity} from '../../theme';

export type TopSection = 'coach' | 'goals';

export interface HomeListProps {
  navigation: AppNavigationProp;
  t: (key: string) => string;
  topSection: TopSection;
  onChangeTopSection: (section: TopSection) => void;
  conversations: ConversationSummary[];
  loadingConversations: boolean;
  refreshConversations: () => void;
  onOpenConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (conversation: ConversationSummary) => void;
  onNewChat: () => void;
  quickStartSuggestions: (SuggestionItem & {prompt?: string})[];
  onQuickStart: (item: SuggestionItem & {prompt?: string}) => void;
  onHomeSubmit: (text: string) => void;
  bottomPadding: number;
}

export const HomeList: React.FC<HomeListProps> = ({
  navigation,
  t,
  topSection,
  onChangeTopSection,
  conversations,
  loadingConversations,
  refreshConversations,
  onOpenConversation,
  onDeleteConversation,
  onNewChat,
  quickStartSuggestions,
  onQuickStart,
  onHomeSubmit,
  bottomPadding,
}) => {
  const theme = useTheme();
  // Tabs and the greeting/stats hero as one see-through "card" — the same
  // header for both sections now, only the content below it (chat list vs
  // goals list) changes when switching tabs. Built once here so it can be
  // dropped into whichever list's ListHeaderComponent is currently on
  // screen and scroll away with the rest of the content. The blob backdrop
  // is deliberately NOT part of this anymore (see the fixed layer rendered
  // separately below) — it stays put behind this as it scrolls past,
  // instead of scrolling away together with it.
  const topCard = (
    <View style={styles.topCard}>
      <View style={styles.header}>
        {/* A compact pill segmented control, NOT the same big-bold-caps
            style as the Active/Completed filter inside GoalsPanel below —
            that visual sameness was the actual bug (looked like two
            stacked tab bars). This one reads as "which section", the one
            below reads as "filter within this section". */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            testID="coach-tab"
            style={[styles.segment, topSection === 'coach' && styles.segmentActive]}
            onPress={() => onChangeTopSection('coach')}>
            <Text style={[styles.segmentText, topSection === 'coach' && styles.segmentTextActive]}>
              {t('coach.headerTitle')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="goals-tab"
            style={[styles.segment, topSection === 'goals' && styles.segmentActive]}
            onPress={() => onChangeTopSection('goals')}>
            <Text style={[styles.segmentText, topSection === 'goals' && styles.segmentTextActive]}>
              {t('coach.goalsTabTitle')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <CoachHomeHero />
      {/* Shown on both the Coach and Goals sections now — both land in the
          exact same conversational coach underneath (create_goal is just one
          of its tools), so "ask anything" and the quick-start chips make
          sense as an entry point from either tab, not only the Coach one. */}
      <View style={styles.heroPromptInput}>
        <CoachHomePromptInput onSubmit={onHomeSubmit} />
      </View>
      <SuggestionChips
        items={quickStartSuggestions}
        onPress={onQuickStart}
        label={t('coach.quickStartLabel')}
        style={styles.heroQuickActions}
        contentContainerStyle={styles.heroQuickActionsContent}
      />
    </View>
  );

  return (
    <>
      {/* Fixed behind everything — does NOT scroll with topCard/the list
          below it, unlike everything else on this screen. Shared by both
          sections since the tab switcher itself sits on top of it either
          way. */}
      <View style={styles.heroBackground} pointerEvents="none">
        <View style={styles.BlobOrbContainer}>
          <BlobOrb size={450} />
        </View>
        <BlurView
          blurType="light"
          blurAmount={25}
          style={StyleSheet.absoluteFill}
          reducedTransparencyFallbackColor="rgba(250, 250, 250, 0.9)"
        />
      </View>
      {topSection === 'goals' ? (
        <GoalsPanel navigation={navigation} headerExtra={topCard} />
      ) : (
        // Tabs, hero, and "Recent chats" scroll together as one list — only
        // the blob behind them (rendered above, as a fixed sibling) stays put.
        <FlatList
          testID="coach-screen"
          data={conversations}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <ConversationListItem
              conversation={item}
              onPress={() => onOpenConversation(item)}
              onDelete={() => onDeleteConversation(item)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={loadingConversations} onRefresh={refreshConversations} tintColor={theme.colors.accent} />
          }
          ListHeaderComponent={
            <>
              {topCard}
              <View style={styles.recentChatsHeader}>
                <Text style={styles.recentChatsTitle}>{t('coach.recentChats')}</Text>
                <TouchableOpacity style={styles.newChatButtonBig} onPress={onNewChat}>
                  <Text style={styles.newChatButtonBigText}>+ {t('coach.newChat')}</Text>
                </TouchableOpacity>
              </View>
            </>
          }
          ListEmptyComponent={
            loadingConversations ? (
              <View style={styles.listLoading}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
              </View>
            ) : (
              <View style={styles.welcomeContainer}>
                <Text style={styles.welcomeTitle}>{t('coach.welcomeTitle')}</Text>
                <Text style={styles.welcomeSubtitle}>{t('coach.welcomeSubtitle')}</Text>
                <TouchableOpacity style={styles.startButton} onPress={onNewChat}>
                  <Text style={styles.startButtonText}>{t('coach.newChat')}</Text>
                </TouchableOpacity>
              </View>
            )
          }
          contentContainerStyle={[styles.listContentPadding, {paddingBottom: bottomPadding}]}
        />
      )}
    </>
  );
};

const styles = makeStyles(theme => ({
  // Transparent now — the blob sits behind it as a separate FIXED layer
  // (see `heroBackground` below), so this just holds the tabs/hero content
  // and scrolls with the list, letting the blob show through as it passes.
  topCard: {
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: withOpacity(theme.colors.black, 0.06),
    borderRadius: 20,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
  },
  segmentActive: {
    backgroundColor: theme.colors.text.inverse,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: withOpacity(theme.colors.black, 0.45),
  },
  segmentTextActive: {
    color: theme.colors.text.primary,
  },
  // Outer scroller: just adds breathing room below the block before
  // whatever comes next in topCard.
  heroPromptInput: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  heroQuickActions: {
    marginBottom: 12,
  },
  // Inner scrollable content: the "Ask for:" label now renders as the first
  // scrollable item itself (see SuggestedActions' `label` prop), so this
  // just needs the same 20px inset the hero's own text uses, on both edges.
  heroQuickActionsContent: {
    paddingHorizontal: 28,
  },
  // Rendered as a sibling ABOVE the scrolling list/GoalsPanel (not inside
  // topCard, which scrolls) — a bounded-height decorative backdrop that
  // stays fixed in place while the tabs/hero/chips scroll past it. Once the
  // list's own opaque cards scroll up over this region, they naturally
  // cover it — no need for the height to precisely match topCard's content.
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    height: 320,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  BlobOrbContainer: {
    position: 'absolute',
    top: -250,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.8,
  },
  recentChatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 8,
  },
  recentChatsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  // Plain text button, no fill/border — sits next to "Recent chats" the same
  // way a "See all" link would, rather than reading as a second primary
  // action competing with the prompt input/quick-start chips above it.
  newChatButtonBig: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  newChatButtonBigText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  listLoading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: withOpacity(theme.colors.black, 0.5),
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startButtonText: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: '700',
  },
  listContentPadding: {
    paddingBottom: 40,
  },
}));
