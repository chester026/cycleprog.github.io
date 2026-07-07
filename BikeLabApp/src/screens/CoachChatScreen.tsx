import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAppData} from '../contexts/AppDataContext';
import {apiFetch} from '../utils/api';
import {useCoachChat} from '../hooks/useCoachChat';
import {ChatMessage, ConversationSummary, SuggestionItem} from '../types/coach';
import {ChatMessageBubble} from '../components/coach/ChatMessageBubble';
import {ChatInput} from '../components/coach/ChatInput';
import {ActivityPickerModal, AttachedActivity} from '../components/coach/ActivityPickerModal';
import {SuggestedActions} from '../components/coach/SuggestedActions';
import {ConversationListItem} from '../components/coach/ConversationListItem';
import {GoalsPanel} from '../components/coach/GoalsPanel';
import {CoachHomeHero} from '../components/coach/CoachHomeHero';
import {CoachHomePromptInput} from '../components/coach/CoachHomePromptInput';
import BlobOrb from '../components/BlobOrb';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';

type CoachView = 'list' | 'chat';
type TopSection = 'coach' | 'goals';

// Turns picked activities into a plain-text block the model reads as hidden
// context (see useCoachChat.sendMessage's `hiddenContext` option) — the
// user's own chat bubble stays free of this, only the request payload
// carries it. ~200 tokens/activity is the budget ActivityPickerModal's
// MAX_ATTACHMENTS assumes.
function serializeAttachedActivities(activities: AttachedActivity[]): string {
  const lines = activities.map(a => {
    const date = new Date(a.start_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const dist = (a.distance / 1000).toFixed(1);
    const duration = `${Math.floor(a.moving_time / 3600)}h${Math.floor((a.moving_time % 3600) / 60)}m`;
    const elev = Math.round(a.total_elevation_gain);
    let line = `[Activity ${a.id}] ${a.name} (${a.type}) — ${date}, ${dist}km, ${duration}, ${elev}m↑`;
    if (a.average_heartrate) line += `, avg HR ${Math.round(a.average_heartrate)}`;
    if (a.average_watts) line += `, avg ${Math.round(a.average_watts)}W`;
    return line;
  });
  return `The user has attached the following activities for context:\n${lines.join('\n')}`;
}

// Replaces the old single-prompt GoalAssistantScreen on the Goals tab.
// GoalDetailsScreen is untouched — tapping "View Details" on a
// GoalCreatedCard just navigates there like the old flow did.
//
// This screen has two internal views (not separate nav routes, so the tab
// stays on "Goals" the whole time): a conversation list (the default
// landing) and the chat itself, with its own Back button returning to the
// list. Kept as one screen since the two views share the same hook state.
export const CoachChatScreen: React.FC<{navigation: any; route?: any}> = ({navigation, route}) => {
  const {t} = useTranslation();
  const {
    conversations,
    loadingConversations,
    refreshConversations,
    conversationId,
    loadingConversation,
    messages,
    streaming,
    suggestions,
    error,
    sendMessage,
    cancelStream,
    startNewConversation,
    openConversation,
    deleteConversation,
  } = useCoachChat();

  const [view, setView] = useState<CoachView>('list');
  // The tab switcher lives where the static "AI Coach" title used to sit, in
  // the home/list header only — once inside an actual conversation (view ===
  // 'chat') the header goes back to Back/title/icon actions, since switching
  // sections mid-chat doesn't make sense there.
  const [topSection, setTopSection] = useState<TopSection>('coach');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const firedInitialPromptRef = useRef(false);
  const {activities, loadActivities} = useAppData();

  // Activity-attachment picker (Phase 1 of CALENDAR_SPEC.md) — UI-only state,
  // never persisted. Cleared after every send, same lifecycle as a draft
  // message.
  const [pickerVisible, setPickerVisible] = useState(false);
  const [attachedActivities, setAttachedActivities] = useState<AttachedActivity[]>([]);

  // Warm the server's in-memory activities/bikes caches as soon as the coach
  // screen opens, so the first tool call doesn't hit a cold cache and have
  // to tell the user to go visit Activities/Garage first. Both calls hit the
  // exact same endpoints those tabs already call (`/api/activities`,
  // `/api/bikes`) — no new Strava-fetching path, and `loadActivities` itself
  // already dedupes against its own TTL/AsyncStorage cache, so this is a
  // no-op if activities were fetched recently elsewhere in the app. Fired
  // once per mount and never awaited — must not block the input or the
  // conversation list from rendering.
  const cacheWarmedRef = useRef(false);
  useEffect(() => {
    if (cacheWarmedRef.current) return;
    cacheWarmedRef.current = true;
    loadActivities().catch(() => {});
    apiFetch('/api/bikes').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The bottom tab bar is `position: 'absolute'` (see MainTabs in App.tsx) —
  // a floating blurred bar that overlaps the last ~74px of every screen. Any
  // content pinned to the bottom of a normal flex layout renders underneath
  // it, invisible. Other screens dodge this with a big paddingBottom on
  // their ScrollView; here we do the same for the input bar and the list.
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  // Extra bottom clearance under the input, for the home indicator — but
  // ONLY when the keyboard is hidden. `KeyboardAvoidingView` already pads
  // the view up above the keyboard when it's open, so leaving this
  // insets.bottom padding in place at the same time double-counted it,
  // showing as a gap between the input and the keyboard. Driving it off the
  // real keyboardWillShow/Hide events (with the OS-reported duration) keeps
  // it in the same animation frame as the keyboard itself, instead of a
  // second, unsynced layout jump.
  const keyboardPadding = useRef(new Animated.Value(insets.bottom)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      Animated.timing(keyboardPadding, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e: KeyboardEvent) => {
      Animated.timing(keyboardPadding, {
        toValue: insets.bottom,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardPadding]);

  // Hide the tab bar entirely while inside a chat — nothing in it is useful
  // mid-conversation and it just eats screen space. `useFocusEffect` (rather
  // than a plain effect on `view`) also restores it automatically if the
  // user navigates away to a sibling screen in this stack (e.g. GoalDetails
  // via a GoalCreatedCard), since its cleanup runs on blur, not just unmount.
  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent?.();
      if (!parent) return;
      parent.setOptions({tabBarStyle: view === 'chat' ? {display: 'none'} : DEFAULT_TAB_BAR_STYLE});
      return () => {
        parent.setOptions({tabBarStyle: DEFAULT_TAB_BAR_STYLE});
      };
    }, [navigation, view]),
  );

  // Deep-link entry point: RideAnalyticsScreen's "Discuss with Coach" button
  // (and any future callers) navigates here with an initialPrompt — jump
  // straight into a fresh chat and send it, instead of landing on the list.
  // `activityId`, if present, rides along as hidden model context (see
  // useCoachChat.sendMessage) rather than being baked into the visible
  // prompt text — keeps the user's own chat bubble free of anything that
  // looks like a leaked internal id.
  useEffect(() => {
    const initialPrompt = route?.params?.initialPrompt;
    if (initialPrompt && !firedInitialPromptRef.current) {
      firedInitialPromptRef.current = true;
      const activityId = route?.params?.activityId;
      // Same idea as activityId — CalendarScreen's "Ask Agent" button passes
      // the calendar_events row id along so the model can call
      // update_calendar_event/delete_calendar_event on the exact right row
      // if the user asks to change or cancel it, without hunting through
      // get_calendar results first.
      const calendarEventId = route?.params?.calendarEventId;
      navigation.setParams({initialPrompt: undefined, activityId: undefined, calendarEventId: undefined});
      startNewConversation();
      setView('chat');
      const hiddenContext =
        activityId != null
          ? `activity_id: ${activityId}`
          : calendarEventId != null
            ? `calendar_event_id: ${calendarEventId}`
            : undefined;
      sendMessage(initialPrompt, hiddenContext ? {hiddenContext} : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.initialPrompt]);

  // Companion deep-link: RideAnalyticsScreen already found a conversation
  // that previously analyzed this exact activity (see its "Discuss with
  // Coach" handler + GET /api/coach/conversations/by-activity/:id) and wants
  // to reopen it instead of starting a new duplicate analysis thread.
  const firedOpenConversationRef = useRef(false);
  useEffect(() => {
    const openConversationId = route?.params?.openConversationId;
    if (openConversationId && !firedOpenConversationRef.current) {
      firedOpenConversationRef.current = true;
      navigation.setParams({openConversationId: undefined});
      setView('chat');
      openConversation(openConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openConversationId]);

  const handleOpenConversation = async (conversation: ConversationSummary) => {
    setView('chat');
    await openConversation(conversation.id);
  };

  const handleNewChat = () => {
    startNewConversation();
    setView('chat');
  };

  const handleBack = () => {
    if (streaming) cancelStream();
    setView('list');
    refreshConversations();
  };

  const handleDelete = (conversation: ConversationSummary) => {
    Alert.alert(t('coach.deleteChat'), t('coach.deleteChatConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => deleteConversation(conversation.id)},
    ]);
  };

  // Delete the conversation currently open in the chat view, then bounce
  // back to the list — there's nothing left to look at once it's gone.
  const handleDeleteCurrent = () => {
    if (!conversationId) return;
    Alert.alert(t('coach.deleteChat'), t('coach.deleteChatConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteConversation(conversationId);
          setView('list');
        },
      },
    ]);
  };

  const welcomeSuggestions: SuggestionItem[] = [
    {label: t('coach.suggestProgress')},
    {label: t('coach.suggestGoal')},
    {label: t('coach.suggestLastRide')},
    {label: t('coach.suggestWeekPlan')},
  ];
  const displayedSuggestions = messages.length === 0 ? welcomeSuggestions : suggestions;

  // Suggestion chips never carry hiddenContext — the label itself is the
  // visible message, but a `detail` chip (see SuggestionItem) also tags the
  // reply we're about to create so ChatMessageBubble reveals only that one
  // card instead of every angle at once (see useCoachChat.sendMessage).
  const handleSuggestionPress = (item: SuggestionItem) => {
    sendMessage(item.label, item.detail ? {revealDetail: item.detail} : undefined);
  };

  // Same most-useful prompts as the empty-chat welcome screen (reusing the
  // same i18n copy so the phrasing is consistent everywhere), but reachable
  // straight from the home hero — no need to tap "+ New chat" first just to
  // get to a preset. Tapping one starts a fresh conversation and fires it
  // immediately.
  //
  // `prompt`, when present, is what actually gets SENT instead of `label` —
  // "Show my total stats" reads fine as a chip, but the model needs the
  // longer, explicit version (both all-time AND last-year, all four
  // metrics) to reliably call get_activity_totals twice instead of picking
  // just one period.
  const quickStartSuggestions: (SuggestionItem & {prompt?: string})[] = [
    {label: t('coach.suggestLastRide')},
    {label: t('coach.suggestProgress')},
    {label: t('coach.suggestSchedule')},
    {label: t('coach.suggestGoal')},
    {label: t('coach.suggestBikeCheck')},
    {label: t('coach.suggestTotalStats'), prompt: t('coach.suggestTotalStatsPrompt')},
  ];
  const handleQuickStart = (item: SuggestionItem & {prompt?: string}) => {
    startNewConversation();
    setView('chat');
    sendMessage(item.prompt ?? item.label);
  };

  // Free-text prompt box at the top of the home screen (CoachHomePromptInput)
  // — same "always starts fresh" behavior as a quick-start chip, just with
  // whatever the rider actually typed instead of a preset label.
  const handleHomeSubmit = (text: string) => {
    startNewConversation();
    setView('chat');
    sendMessage(text);
  };

  // Wraps sendMessage so attached activities ride along as hidden context on
  // this one turn — never baked into the visible bubble, never remembered
  // for the next message (cleared right after send, same as the spec's
  // one-shot design).
  const handleSend = (text: string) => {
    const opts = attachedActivities.length > 0
      ? {hiddenContext: serializeAttachedActivities(attachedActivities)}
      : undefined;
    sendMessage(text, opts);
    setAttachedActivities([]);
  };

  const handleAttachActivities = (chosen: AttachedActivity[]) => {
    setAttachedActivities(chosen);
    setPickerVisible(false);
  };

  const handleRemoveAttachment = (id: number) => {
    setAttachedActivities(prev => prev.filter(a => a.id !== id));
  };

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
            style={[styles.segment, topSection === 'coach' && styles.segmentActive]}
            onPress={() => setTopSection('coach')}>
            <Text style={[styles.segmentText, topSection === 'coach' && styles.segmentTextActive]}>
              {t('coach.headerTitle')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, topSection === 'goals' && styles.segmentActive]}
            onPress={() => setTopSection('goals')}>
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
        <CoachHomePromptInput onSubmit={handleHomeSubmit} />
      </View>
      <SuggestedActions
        items={quickStartSuggestions}
        onPress={handleQuickStart}
        label={t('coach.quickStartLabel')}
        style={styles.heroQuickActions}
        contentContainerStyle={styles.heroQuickActionsContent}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* No keyboardVerticalOffset here (unlike some header+KeyboardAvoidingView
          setups) — our header is a child of this view, not a separate native
          stack header sitting above it, so an offset just double-counts and
          leaves a large gap between the input and the keyboard. The old
          GoalAssistantScreen didn't set one either, for the same reason. */}
      {view === 'list' ? (
        <>
          {/* Fixed behind everything — does NOT scroll with topCard/the
              list below it, unlike everything else on this screen (see the
              scrolling comment further down). Shared by both sections since
              the tab switcher itself sits on top of it either way. */}
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
            // Tabs, hero, and "Recent chats" scroll together as one list —
            // only the blob behind them (rendered above, as a fixed sibling)
            // stays put.
            <FlatList
              data={conversations}
              keyExtractor={item => item.id}
              renderItem={({item}) => (
                <ConversationListItem
                  conversation={item}
                  onPress={() => handleOpenConversation(item)}
                  onDelete={() => handleDelete(item)}
                />
              )}
              refreshControl={
                <RefreshControl refreshing={loadingConversations} onRefresh={refreshConversations} tintColor="#274dd3" />
              }
              ListHeaderComponent={
                <>
                  {topCard}
                  <View style={styles.recentChatsHeader}>
                    <Text style={styles.recentChatsTitle}>{t('coach.recentChats')}</Text>
                    <TouchableOpacity style={styles.newChatButtonBig} onPress={handleNewChat}>
                      <Text style={styles.newChatButtonBigText}>+ {t('coach.newChat')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              }
              ListEmptyComponent={
                loadingConversations ? (
                  <View style={styles.listLoading}>
                    <ActivityIndicator size="large" color="#274dd3" />
                  </View>
                ) : (
                  <View style={styles.welcomeContainer}>
                    <Text style={styles.welcomeTitle}>{t('coach.welcomeTitle')}</Text>
                    <Text style={styles.welcomeSubtitle}>{t('coach.welcomeSubtitle')}</Text>
                    <TouchableOpacity style={styles.startButton} onPress={handleNewChat}>
                      <Text style={styles.startButtonText}>{t('coach.newChat')}</Text>
                    </TouchableOpacity>
                  </View>
                )
              }
              contentContainerStyle={[styles.listContentPadding, {paddingBottom: tabBarHeight + 20}]}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.heroBackgroundFixed} pointerEvents="none">
            <View style={styles.BlobOrbContainer}>
              <BlobOrb size={420} />
            </View>
            <BlurView
              blurType="light"
              blurAmount={25}
              style={StyleSheet.absoluteFill}
              reducedTransparencyFallbackColor="rgba(250, 250, 250, 0.9)"
            />
          </View>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <Text style={styles.backButtonText}>{t('coach.back')}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitleSmall}>{t('coach.headerTitle')}</Text>
            <View style={styles.headerActions}>
              {!!conversationId && (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleDeleteCurrent}
                  disabled={streaming}>
                  <Text style={styles.iconButtonText}>×</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.iconButton} onPress={handleNewChat} disabled={streaming}>
                <Text style={styles.iconButtonText}>＋</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loadingConversation ? (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color="#274dd3" />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.newChatBody}>
              <Text style={styles.welcomeTitleSmall}>{t('coach.welcomeTitle')}</Text>
              <Text style={styles.welcomeSubtitleSmall}>{t('coach.welcomeSubtitle')}</Text>
              <SuggestedActions items={welcomeSuggestions} onPress={handleSuggestionPress} disabled={streaming} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              style={styles.messagesList}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({item, index}) => {
                // Show the vs-baseline/similar-ride/skills-delta cards only
                // from the SECOND time get_activity_analysis shows up in
                // this conversation onward — the first time, we deliberately
                // hold those back so the bottom suggestion chips ("compare
                // to my average", etc.) have something to invite the user
                // into asking for. See ChatMessageBubble's showAnalysisDetails doc.
                const hasAnalysis = item.toolCalls?.some(
                  tc => tc.name === 'get_activity_analysis' && tc.status === 'done',
                );
                const priorAnalysisCount = hasAnalysis
                  ? messages
                      .slice(0, index)
                      .filter(m => m.toolCalls?.some(tc => tc.name === 'get_activity_analysis' && tc.status === 'done'))
                      .length
                  : 0;
                return (
                  <ChatMessageBubble
                    message={item}
                    onGoalPress={goalId => navigation.navigate('GoalDetails', {goalId})}
                    onCalendarEventPress={() => navigation.navigate('CalendarTab', {screen: 'Calendar'})}
                    showAnalysisDetails={priorAnalysisCount > 0}
                    // The effort score card is the "here's your ride" headline
                    // — repeating it on every follow-up (each of which also
                    // re-runs get_activity_analysis and gets a fresh
                    // effort_score) just clutters the thread with the same
                    // number over and over, so it only renders the very
                    // first time analysis shows up in this conversation.
                    isFirstAnalysis={hasAnalysis && priorAnalysisCount === 0}
                  />
                );
              }}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                !streaming && suggestions.length > 0 ? (
                  <SuggestedActions items={suggestions} onPress={handleSuggestionPress} disabled={streaming} />
                ) : null
              }
            />
          )}

          {!!error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Tab bar is hidden in this view (see useFocusEffect above), so we
              only need to clear the home indicator's safe area — and only
              while the keyboard is down (see keyboardPadding above). */}
          <Animated.View style={{paddingBottom: keyboardPadding}}>
            <ChatInput
              onSend={handleSend}
              onCancel={cancelStream}
              streaming={streaming}
              onAttachPress={() => setPickerVisible(true)}
              attachedActivities={attachedActivities}
              onRemoveAttachment={handleRemoveAttachment}
            />
          </Animated.View>
        </>
      )}

      <ActivityPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onAttach={handleAttachActivities}
        activities={activities}
        alreadyAttachedIds={attachedActivities.map(a => a.id)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfdfd',
  },
  // Transparent now — the blob sits behind it as a separate FIXED layer
  // (see `heroBackground` below), so this just holds the tabs/hero content
  // and scrolls with the list, letting the blob show through as it passes.
  topCard: {
    marginBottom:18,
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
  // justifyContent/alignItems center the BlobOrb (a plain flex child, ~480dp
  // square — deliberately larger than this 320dp band so it bleeds evenly
  // off both edges, clipped by overflow:'hidden'). BlurView, rendered right
  // after it, uses StyleSheet.absoluteFill and so ignores this flex layout
  // entirely — it still covers the full band regardless.
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    height: 320,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Used only in the chat view — same fixed-backdrop idea, just a shorter
  // height since that view's header has no hero content under it.
  heroBackgroundFixed: {
    ...StyleSheet.absoluteFillObject,
    height: 260,
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
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 20,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 17,
  },
  segmentActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(0, 0, 0, 0.45)',
  },
  segmentTextActive: {
    color: '#1a1a1a',
  },
  headerTitleSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
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
    color: '#1a1a1a',
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
    color: '#274dd3',
  },
  listLoading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#274dd3',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#274dd3',
    marginTop: -1,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
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
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 10,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: '#274dd3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  newChatBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeTitleSmall: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitleSmall: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  listContentPadding: {
    paddingBottom: 40,
  },
  messagesList: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 8,
  },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    textAlign: 'center',
  },
});
