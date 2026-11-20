// The chat transcript itself — extracted from CoachChatScreen (T-5.x wave 2
// decomposition). Owns the FlatList + per-row memoization; all message/
// suggestion state still lives in useCoachChat, passed down as props.
import React, {useMemo, useRef, useState} from 'react';
import {FlatList, ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {ChatMessageBubble} from '../../components/coach/ChatMessageBubble';
import {SuggestionChips} from './SuggestionChips';
import {ChatMessage, SuggestionItem} from '../../types/coach';
import type {Activity} from '../../types/activity';
import {HealthContext} from '../../utils/healthService';
import {computeAnalysisMeta, type RichCardKind} from '@bikelab/shared/coach';
import {makeStyles, useTheme} from '../../theme';
import {KEYBOARD_DISMISS_PROPS} from '../../constants/keyboard';
import {ArrowDownIcon} from '../../assets/img/icons/ArrowDownIcon';
import {isNearBottom} from './lib';

const TO_BOTTOM_ICON_SIZE_PX = 18;

interface MessageRowProps {
  message: ChatMessage;
  showAnalysisDetails: boolean;
  isFirstAnalysis: boolean;
  allowedCards: RichCardKind[];
  onGoalPress: (goalId: number) => void;
  onCalendarEventPress: () => void;
  onChecklistPress: () => void;
  onProfileMemoryPress: () => void;
  healthContext?: HealthContext;
  activities?: Activity[];
}

// One row, memoized so a token flushing into ONE streaming bubble (see
// useCoachChat's TOKEN_FLUSH_INTERVAL_MS) doesn't re-render every earlier,
// already-settled message in the list on each flush tick — only the row
// whose own `message` object identity actually changed.
const MessageRow = React.memo(function MessageRowComponent({
  message,
  showAnalysisDetails,
  isFirstAnalysis,
  allowedCards,
  onGoalPress,
  onCalendarEventPress,
  onChecklistPress,
  onProfileMemoryPress,
  healthContext,
  activities,
}: MessageRowProps) {
  return (
    <ChatMessageBubble
      message={message}
      onGoalPress={onGoalPress}
      onCalendarEventPress={onCalendarEventPress}
      onChecklistPress={onChecklistPress}
      onProfileMemoryPress={onProfileMemoryPress}
      showAnalysisDetails={showAnalysisDetails}
      isFirstAnalysis={isFirstAnalysis}
      allowedCards={allowedCards}
      healthContext={healthContext}
      activities={activities}
    />
  );
});

export interface MessageListProps {
  listRef: React.RefObject<FlatList<ChatMessage> | null>;
  messages: ChatMessage[];
  suggestions: SuggestionItem[];
  streaming: boolean;
  onGoalPress: (goalId: number) => void;
  onCalendarEventPress: () => void;
  onChecklistPress: () => void;
  onProfileMemoryPress: () => void;
  onSuggestionPress: (item: SuggestionItem) => void;
  healthContext?: HealthContext;
  activities?: Activity[];
}

export const MessageList: React.FC<MessageListProps> = ({
  listRef,
  messages,
  suggestions,
  streaming,
  onGoalPress,
  onCalendarEventPress,
  onChecklistPress,
  onProfileMemoryPress,
  onSuggestionPress,
  healthContext,
  activities,
}) => {
  // One O(n) pass over the transcript for every row's reveal flags and the
  // once-per-conversation rich-card gate — see computeAnalysisMeta in
  // @bikelab/shared/coach.
  const hasActivities = !!activities && activities.length > 0;
  const hasHealthContext = !!healthContext;
  const analysisMeta = useMemo(
    () => computeAnalysisMeta(messages, {hasActivities, hasHealthContext}),
    [messages, hasActivities, hasHealthContext],
  );

  const {t} = useTranslation();
  const theme = useTheme();

  // Where the reader is: at the latest message, or up in the transcript —
  // then the jump-to-latest button shows (owner, 19.11.2026).
  const nearBottom = useRef(true);
  const [showToBottom, setShowToBottom] = useState(false);
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    nearBottom.current = isNearBottom(event.nativeEvent);
    setShowToBottom(!nearBottom.current);
  };
  const scrollToBottom = () => {
    nearBottom.current = true;
    setShowToBottom(false);
    listRef.current?.scrollToEnd({animated: true});
  };

  // Auto-scroll to the end only when the transcript actually grew: a new
  // message, or tokens streaming into the last bubble. Any other content
  // change — the "Copied" label under a long-pressed bubble, a detail card
  // expanding — used to fire scrollToEnd too, yanking the reader from the
  // middle of the chat to the bottom every time they copied a message
  // (owner report, 07.10.2026). A new message always brings the reader
  // down (they have just sent it); streamed tokens follow only a reader who
  // is already there — one who scrolled up to re-read is left alone.
  const lastScrolledCount = useRef(0);
  const handleContentSizeChange = () => {
    const grew = messages.length !== lastScrolledCount.current;
    if (!grew && !(streaming && nearBottom.current)) return;
    lastScrolledCount.current = messages.length;
    scrollToBottom();
  };

  const renderItem = ({item, index}: ListRenderItemInfo<ChatMessage>) => {
    const meta = analysisMeta[index];
    return (
      <MessageRow
        message={item}
        showAnalysisDetails={meta.showAnalysisDetails}
        isFirstAnalysis={meta.isFirstAnalysis}
        allowedCards={meta.allowedCards}
        onGoalPress={onGoalPress}
        onCalendarEventPress={onCalendarEventPress}
        onChecklistPress={onChecklistPress}
        onProfileMemoryPress={onProfileMemoryPress}
        healthContext={healthContext}
        activities={activities}
      />
    );
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        style={styles.messagesList}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        {...KEYBOARD_DISMISS_PROPS}
        ListFooterComponent={
          !streaming && suggestions.length > 0 ? (
            <SuggestionChips items={suggestions} onPress={onSuggestionPress} disabled={streaming} style={styles.suggestions} />
          ) : null
        }
      />
      {showToBottom ? (
        <TouchableOpacity
          style={styles.toBottomButton}
          onPress={scrollToBottom}
          accessibilityRole="button"
          accessibilityLabel={t('coach.scrollToBottom')}
          testID="coach-scroll-to-bottom">
          <ArrowDownIcon size={TO_BOTTOM_ICON_SIZE_PX} color={theme.colors.text.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = makeStyles(theme => ({
  wrap: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  // Rows bring their own space above (ChatMessageBubble); the list only
  // closes the transcript off at the bottom.
  listContent: {
    paddingBottom: theme.spacing[16],
  },
  // The chips themselves are as they were; the rows no longer bring space
  // below them, so the footer keeps its own distance from the last reply.
  suggestions: {
    marginTop: theme.spacing[16],
  },
  toBottomButton: {
    position: 'absolute',
    right: theme.spacing[16],
    bottom: theme.spacing[12],
    width: 42,
    height: 42,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.card,
  },
}));
