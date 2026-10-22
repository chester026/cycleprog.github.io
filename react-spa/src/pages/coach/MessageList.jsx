import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeAnalysisMeta } from '@bikelab/shared/coach';
import ChatMessageBubble from './ChatMessageBubble';
import SuggestedActions from './SuggestedActions';
import { WEB_COPY } from './copy';
import styles from './MessageList.module.css';

// How far from the bottom still counts as "reading the latest" — within
// this the list follows new tokens; further up it leaves the reader alone
// and offers the pill instead.
const NEAR_BOTTOM_PX = 80;

// One row, memoized so a token flushing into ONE streaming bubble doesn't
// re-render every settled message on each flush tick.
const MessageRow = React.memo(function MessageRow({ message, analysisMeta, renderCards }) {
  return <ChatMessageBubble message={message} analysisMeta={analysisMeta} renderCards={renderCards} />;
});

/**
 * The scrolling transcript. Auto-scrolls to the end only when the
 * transcript grew (a new message, or tokens streaming into the last bubble)
 * AND the reader was already near the bottom; otherwise a "↓ New messages"
 * pill appears instead of yanking them down.
 */
export default function MessageList({ messages, suggestions, streaming, onSuggestionPress, renderCards }) {
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [showNewPill, setShowNewPill] = useState(false);

  const analysisMeta = useMemo(() => computeAnalysisMeta(messages), [messages]);

  const scrollToEnd = useCallback((behavior = 'smooth') => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowNewPill(false);
  }, []);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    nearBottomRef.current = distance < NEAR_BOTTOM_PX;
    if (nearBottomRef.current) setShowNewPill(false);
  };

  // Runs after every render the transcript changed in; the count check
  // makes a card expanding or a chip row appearing NOT scroll the reader.
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    const grew = messages.length !== lastCountRef.current;
    if (!grew && !streaming) return;
    lastCountRef.current = messages.length;
    if (nearBottomRef.current) {
      scrollToEnd(grew ? 'smooth' : 'auto');
    } else {
      setShowNewPill(true);
    }
  }, [messages.length, lastMessage?.content, lastMessage?.toolCalls, streaming, scrollToEnd]);

  return (
    <div className={styles.wrap}>
      <div ref={scrollRef} className={styles.scroll} onScroll={handleScroll} data-testid="coach-message-list">
        <div className={styles.list}>
          {messages.map((message, index) => (
            <MessageRow key={message.id} message={message} analysisMeta={analysisMeta[index]} renderCards={renderCards} />
          ))}
          {!streaming && suggestions.length > 0 ? (
            <SuggestedActions items={suggestions} onPress={onSuggestionPress} className={styles.suggestions} />
          ) : null}
        </div>
      </div>
      {showNewPill ? (
        <button type="button" className={styles.newPill} onClick={() => scrollToEnd('smooth')}>
          {WEB_COPY.newMessages}
        </button>
      ) : null}
    </div>
  );
}
