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
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {useBottomTabBarHeight} from '@react-navigation/bottom-tabs';
import {useFocusEffect} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useActivities} from '../data/hooks/useActivities';
import {api, bikes} from '../data/api';
import {useCoachChat} from '../hooks/useCoachChat';
import {useHealthData} from '../hooks/useHealthData';
import {ChatMessage, ConversationSummary, SuggestionItem} from '../types/coach';
import {ChatInput} from '../components/coach/ChatInput';
import {ActivityPickerModal, AttachedActivity} from '../components/coach/ActivityPickerModal';
import BlobOrb from '../components/BlobOrb';
import {DEFAULT_TAB_BAR_STYLE} from '../constants/tabBar';
import {useAppNavigation, useAppRoute} from '../navigation/hooks';
import {ChatHeader} from './CoachChat/ChatHeader';
import {HomeList} from './CoachChat/HomeList';
import {MessageList} from './CoachChat/MessageList';
import {SuggestionChips} from './CoachChat/SuggestionChips';
import {ContextBar} from './CoachChat/ContextBar';
import {serializeAttachedActivities, buildWelcomeSuggestions, buildQuickStartSuggestions} from './CoachChat/lib';
import {makeStyles, useTheme, withOpacity} from '../theme';

type CoachView = 'list' | 'chat';
type TopSection = 'coach' | 'goals';

// Replaces the old single-prompt GoalAssistantScreen on the Goals tab.
// GoalDetailsScreen is untouched — tapping "View Details" on a
// GoalCreatedCard just navigates there like the old flow did.
//
// This screen has two internal views (not separate nav routes, so the tab
// stays on "Goals" the whole time): a conversation list (the default
// landing) and the chat itself, with its own Back button returning to the
// list. Kept as one screen since the two views share the same hook state.
//
// T-5.x wave 2: no longer takes `navigation`/`route` as props — it's
// registered directly as `component={CoachChatScreen}` in App.tsx, so
// react-navigation injects them there regardless, but every other
// wave-2-migrated screen reads them via the typed `useAppNavigation()`/
// `useAppRoute()` hooks instead, and this one now matches.
export const CoachChatScreen: React.FC = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const route = useAppRoute<'CoachChat'>();
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

  // healthContext (from Apple Health, when connected) rides along on every
  // outgoing turn — see sendMessageWithHealth below. `useHealthData` itself
  // never triggers the permission dialog here, it just reads whatever's
  // already cached (see AppleHealthScreen for the actual connect flow).
  const {healthContext} = useHealthData();

  const [view, setView] = useState<CoachView>('list');
  // The tab switcher lives where the static "AI Coach" title used to sit, in
  // the home/list header only — once inside an actual conversation (view ===
  // 'chat') the header goes back to Back/title/icon actions, since switching
  // sections mid-chat doesn't make sense there.
  const [topSection, setTopSection] = useState<TopSection>('coach');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // requestId (A-22): each navigate('CoachChat', {..., requestId: Date.now()})
  // call site stamps a fresh id on every navigation, so a re-navigation into
  // an already-mounted CoachChatScreen (e.g. tapping "Discuss with Coach"
  // twice for two different rides) still fires — a per-mount `firedRef`
  // guard didn't re-fire since the screen never remounted, so the second
  // ride's prompt/conversation silently never opened. Tracks every
  // requestId this screen instance has already handled, whichever of the
  // two effects below it belongs to.
  const handledRequestIdsRef = useRef<Set<number>>(new Set());
  const {data: activitiesData} = useActivities();
  const activities = activitiesData ?? [];

  // Activity-attachment picker (Phase 1 of CALENDAR_SPEC.md) — UI-only state,
  // never persisted. Cleared after every send, same lifecycle as a draft
  // message.
  const [pickerVisible, setPickerVisible] = useState(false);
  const [attachedActivities, setAttachedActivities] = useState<AttachedActivity[]>([]);

  // Warm the server's in-memory bikes cache as soon as the coach screen
  // opens, so the first tool call doesn't hit a cold cache and have to tell
  // the user to go visit Garage first. Hits the exact same endpoint that tab
  // already calls (`/api/bikes`) — no new Strava-fetching path. Activities
  // no longer need a matching manual warm-up here: `useActivities()` above
  // is the shared TanStack query every other screen reads too, so mounting
  // it here already triggers (or reuses) the same fetch. Fired once per
  // mount and never awaited — must not block the input or the conversation
  // list from rendering.
  const cacheWarmedRef = useRef(false);
  useEffect(() => {
    if (cacheWarmedRef.current) return;
    cacheWarmedRef.current = true;
    api.call(bikes.list).catch(() => {});
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
    const {initialPrompt, requestId} = route?.params ?? {};
    if (!initialPrompt || requestId == null || handledRequestIdsRef.current.has(requestId)) {
      return;
    }
    handledRequestIdsRef.current.add(requestId);
    const activityId = route?.params?.activityId;
    // Same idea as activityId — CalendarScreen's "Ask Agent" button passes
    // the calendar_events row id along so the model can call
    // update_calendar_event/delete_calendar_event on the exact right row
    // if the user asks to change or cancel it, without hunting through
    // get_calendar results first.
    const calendarEventId = route?.params?.calendarEventId;
    navigation.setParams({
      initialPrompt: undefined,
      activityId: undefined,
      calendarEventId: undefined,
      requestId: undefined,
    });
    startNewConversation();
    setView('chat');
    const hiddenContext =
      activityId != null
        ? `activity_id: ${activityId}`
        : calendarEventId != null
          ? `calendar_event_id: ${calendarEventId}`
          : undefined;
    sendMessageWithHealth(initialPrompt, hiddenContext ? {hiddenContext} : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.initialPrompt, route?.params?.requestId]);

  // Companion deep-link: RideAnalyticsScreen already found a conversation
  // that previously analyzed this exact activity (see its "Discuss with
  // Coach" handler + GET /api/coach/conversations/by-activity/:id) and wants
  // to reopen it instead of starting a new duplicate analysis thread.
  useEffect(() => {
    const {openConversationId, requestId} = route?.params ?? {};
    if (!openConversationId || requestId == null || handledRequestIdsRef.current.has(requestId)) {
      return;
    }
    handledRequestIdsRef.current.add(requestId);
    navigation.setParams({openConversationId: undefined, requestId: undefined});
    setView('chat');
    openConversation(openConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openConversationId, route?.params?.requestId]);

  // Every user-initiated send goes through here so healthContext rides
  // along automatically without every call site having to remember it —
  // it's undefined/omitted whenever Health isn't connected, so this is a
  // no-op until the user connects via AppleHealthScreen.
  const sendMessageWithHealth = useCallback(
    (text: string, options?: {hiddenContext?: string; revealDetail?: SuggestionItem['detail']}) => {
      sendMessage(text, {...options, healthContext});
    },
    [sendMessage, healthContext],
  );

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

  const welcomeSuggestions = buildWelcomeSuggestions(t);
  const quickStartSuggestions = buildQuickStartSuggestions(t);

  // Suggestion chips never carry hiddenContext — the label itself is the
  // visible message, but a `detail` chip (see SuggestionItem) also tags the
  // reply we're about to create so ChatMessageBubble reveals only that one
  // card instead of every angle at once (see useCoachChat.sendMessage).
  const handleSuggestionPress = (item: SuggestionItem) => {
    // `action` chips navigate instead of sending `label` as a chat message —
    // currently just the coach's "Connect Apple Health" suggestion (see
    // server.js's suggestedConnectHealth). ProfileTab/AppleHealth is a
    // cross-tab jump: CoachChat lives in GoalsStack, AppleHealth in
    // ProfileStack, so this goes through the parent Tab.Navigator rather
    // than a same-stack `navigation.navigate('AppleHealth')`.
    if (item.action === 'connect_health') {
      navigation.navigate('ProfileTab', {screen: 'AppleHealth'});
      return;
    }
    sendMessageWithHealth(item.label, item.detail ? {revealDetail: item.detail} : undefined);
  };

  const handleQuickStart = (item: SuggestionItem & {prompt?: string}) => {
    startNewConversation();
    setView('chat');
    sendMessageWithHealth(item.prompt ?? item.label);
  };

  // Free-text prompt box at the top of the home screen (CoachHomePromptInput)
  // — same "always starts fresh" behavior as a quick-start chip, just with
  // whatever the rider actually typed instead of a preset label.
  const handleHomeSubmit = (text: string) => {
    startNewConversation();
    setView('chat');
    sendMessageWithHealth(text);
  };

  // Wraps sendMessage so attached activities ride along as hidden context on
  // this one turn — never baked into the visible bubble, never remembered
  // for the next message (cleared right after send, same as the spec's
  // one-shot design).
  const handleSend = (text: string) => {
    const opts = attachedActivities.length > 0
      ? {hiddenContext: serializeAttachedActivities(attachedActivities)}
      : undefined;
    sendMessageWithHealth(text, opts);
    setAttachedActivities([]);
  };

  const handleAttachActivities = (chosen: AttachedActivity[]) => {
    setAttachedActivities(chosen);
    setPickerVisible(false);
  };

  const handleRemoveAttachment = (id: number) => {
    setAttachedActivities(prev => prev.filter(a => a.id !== id));
  };

  const handleGoalPress = useCallback(
    (goalId: number) => navigation.navigate('GoalDetails', {goalId}),
    [navigation],
  );
  const handleCalendarEventPress = useCallback(
    () => navigation.navigate('CalendarTab', {screen: 'Calendar'}),
    [navigation],
  );
  const handleChecklistPress = useCallback(
    () => navigation.navigate('GarageTab', {screen: 'Checklist'}),
    [navigation],
  );
  // Coach-memory card (CoachMemoryCard) — same cross-tab jump pattern as the
  // "Connect Apple Health" suggestion above: CoachChat lives in GoalsStack,
  // the dedicated memory screen in ProfileStack. `initial: false` mounts
  // Profile underneath so the screen's back arrow returns to Profile instead
  // of popping the whole tab.
  const handleProfileMemoryPress = useCallback(
    () => navigation.navigate('ProfileTab', {screen: 'CoachMemory', initial: false}),
    [navigation],
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
        <HomeList
          navigation={navigation}
          t={t}
          topSection={topSection}
          onChangeTopSection={setTopSection}
          conversations={conversations}
          loadingConversations={loadingConversations}
          refreshConversations={refreshConversations}
          onOpenConversation={handleOpenConversation}
          onDeleteConversation={handleDelete}
          onNewChat={handleNewChat}
          quickStartSuggestions={quickStartSuggestions}
          onQuickStart={handleQuickStart}
          onHomeSubmit={handleHomeSubmit}
          bottomPadding={tabBarHeight + 20}
        />
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
          <ChatHeader
            onBack={handleBack}
            onNewChat={handleNewChat}
            onDeleteCurrent={handleDeleteCurrent}
            streaming={streaming}
            hasConversation={!!conversationId}
          />

          {loadingConversation ? (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.newChatBody}>
              <Text style={styles.welcomeTitleSmall}>{t('coach.welcomeTitle')}</Text>
              <Text style={styles.welcomeSubtitleSmall}>{t('coach.welcomeSubtitle')}</Text>
              <SuggestionChips items={welcomeSuggestions} onPress={handleSuggestionPress} disabled={streaming} />
            </View>
          ) : (
            <MessageList
              listRef={listRef}
              messages={messages}
              suggestions={suggestions}
              streaming={streaming}
              onGoalPress={handleGoalPress}
              onCalendarEventPress={handleCalendarEventPress}
              onChecklistPress={handleChecklistPress}
              onProfileMemoryPress={handleProfileMemoryPress}
              onSuggestionPress={handleSuggestionPress}
              healthContext={healthContext}
              activities={activities}
            />
          )}

          <ContextBar error={error} />

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

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.coachChatBg,
  },
  // Used only in the chat view — the list view's own version of this fixed
  // decorative backdrop now lives in HomeList (same idea, taller band since
  // that view also has hero content under it).
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
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeTitleSmall: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitleSmall: {
    fontSize: 13,
    color: withOpacity(theme.colors.black, 0.5),
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
}));
