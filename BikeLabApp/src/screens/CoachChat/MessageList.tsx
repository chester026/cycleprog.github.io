// The chat transcript itself — extracted from CoachChatScreen (T-5.x wave 2
// decomposition). Owns the FlatList + per-row memoization; all message/
// suggestion state still lives in useCoachChat, passed down as props.
import React, {useMemo} from 'react';
import {FlatList, ListRenderItemInfo} from 'react-native';
import {ChatMessageBubble} from '../../components/coach/ChatMessageBubble';
import {SuggestionChips} from './SuggestionChips';
import {ChatMessage, SuggestionItem} from '../../types/coach';
import {HealthContext} from '../../utils/healthService';
import {computeAnalysisMeta} from './lib';
import {makeStyles} from '../../theme';

interface MessageRowProps {
  message: ChatMessage;
  showAnalysisDetails: boolean;
  isFirstAnalysis: boolean;
  onGoalPress: (goalId: number) => void;
  onCalendarEventPress: () => void;
  healthContext?: HealthContext;
  activities?: any[];
}

// One row, memoized so a token flushing into ONE streaming bubble (see
// useCoachChat's TOKEN_FLUSH_INTERVAL_MS) doesn't re-render every earlier,
// already-settled message in the list on each flush tick — only the row
// whose own `message` object identity actually changed.
const MessageRow = React.memo(function MessageRowComponent({
  message,
  showAnalysisDetails,
  isFirstAnalysis,
  onGoalPress,
  onCalendarEventPress,
  healthContext,
  activities,
}: MessageRowProps) {
  return (
    <ChatMessageBubble
      message={message}
      onGoalPress={onGoalPress}
      onCalendarEventPress={onCalendarEventPress}
      showAnalysisDetails={showAnalysisDetails}
      isFirstAnalysis={isFirstAnalysis}
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
  onSuggestionPress: (item: SuggestionItem) => void;
  healthContext?: HealthContext;
  activities?: any[];
}

export const MessageList: React.FC<MessageListProps> = ({
  listRef,
  messages,
  suggestions,
  streaming,
  onGoalPress,
  onCalendarEventPress,
  onSuggestionPress,
  healthContext,
  activities,
}) => {
  // One O(n) pass instead of the old per-row O(n^2) `messages.slice(0,
  // index).filter(...)` scan — see lib.ts's doc.
  const analysisMeta = useMemo(() => computeAnalysisMeta(messages), [messages]);

  const renderItem = ({item, index}: ListRenderItemInfo<ChatMessage>) => {
    const meta = analysisMeta[index];
    return (
      <MessageRow
        message={item}
        showAnalysisDetails={meta.showAnalysisDetails}
        isFirstAnalysis={meta.isFirstAnalysis}
        onGoalPress={onGoalPress}
        onCalendarEventPress={onCalendarEventPress}
        healthContext={healthContext}
        activities={activities}
      />
    );
  };

  return (
    <FlatList
      ref={listRef}
      style={styles.messagesList}
      data={messages}
      keyExtractor={item => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={
        !streaming && suggestions.length > 0 ? (
          <SuggestionChips items={suggestions} onPress={onSuggestionPress} disabled={streaming} />
        ) : null
      }
    />
  );
};

const styles = makeStyles(() => ({
  messagesList: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 8,
  },
}));
