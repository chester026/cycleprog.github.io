import React from 'react';
import { groupToolCalls } from '@bikelab/shared/coach';
import ToolCallPill from './ToolCallPill';
import StreamingDots from './StreamingDots';
import { parseFormattedLines } from './lib';
import styles from './ChatMessageBubble.module.css';

/**
 * Where rich cards render inside an assistant message, in the app's order:
 *   tool pills → BEFORE_TEXT cards (RideScore, OvertrainingTrend, Recovery)
 *   → text bubble → AFTER_TEXT cards (MetricComparison ×2, SkillsDelta,
 *   GoalCreated, GoalCompleted, CalendarEvent/Plan, ChecklistUpdated ×N,
 *   CoachMemory ×N, ProfileUpdated ×N).
 * The cards themselves live in `./cards` and are supplied through the
 * `renderCards` prop so this bubble stays free of tool-result parsing.
 */
export const CARD_SLOTS = Object.freeze({ BEFORE_TEXT: 'beforeText', AFTER_TEXT: 'afterText' });

// Minimal markdown — **bold** and "- " bullets — matching the app's
// renderFormatted; the coach's replies never need more than that.
function FormattedText({ content }) {
  const lines = parseFormattedLines(content);
  return (
    <>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} className={line.bullet ? styles.bulletLine : styles.line}>
          {line.bullet ? <span className={styles.bulletMark} aria-hidden="true">•</span> : null}
          <span>
            {line.segments.length === 0
              ? '\u00a0'
              : line.segments.map((seg, segIndex) =>
                  seg.bold ? <strong key={segIndex}>{seg.text}</strong> : <React.Fragment key={segIndex}>{seg.text}</React.Fragment>,
                )}
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * One transcript row: the rider's bubble on the right, the coach's on the
 * left with its tool pills above and card slots around the text.
 *
 * @param {object} props
 * @param {import('@bikelab/shared/types').CoachChatMessage} props.message
 * @param {{showAnalysisDetails: boolean, isFirstAnalysis: boolean}} [props.analysisMeta]
 *   Reveal flags from `computeAnalysisMeta` (shared), handed to `renderCards`.
 * @param {(slot: string, ctx: {message, analysisMeta}) => React.ReactNode} [props.renderCards]
 *   Called once per CARD_SLOTS entry for assistant messages.
 */
export default function ChatMessageBubble({ message, analysisMeta, renderCards }) {
  const isUser = message.role === 'user';
  const toolCalls = !isUser && message.toolCalls?.length ? message.toolCalls : null;
  const showTyping = !isUser && Boolean(message.streaming) && !message.content && !toolCalls;
  const showBubble = message.content.length > 0 || showTyping;
  const cards = (slot) => (!isUser && renderCards ? renderCards(slot, { message, analysisMeta }) : null);

  return (
    <div className={[styles.row, isUser ? styles.rowUser : styles.rowCoach].join(' ')} data-role={message.role}>
      {toolCalls ? (
        <div className={styles.toolCalls}>
          {groupToolCalls(toolCalls).map((group) => (
            <ToolCallPill key={group.key} name={group.name} status={group.status} />
          ))}
        </div>
      ) : null}

      {cards(CARD_SLOTS.BEFORE_TEXT)}

      {showBubble ? (
        <div
          className={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleCoach, message.error ? styles.bubbleError : null]
            .filter(Boolean)
            .join(' ')}
          data-testid={`chat-bubble-${message.role}`}
          aria-live={message.streaming ? 'polite' : undefined}
          aria-busy={message.streaming ? 'true' : undefined}
        >
          {showTyping ? <StreamingDots /> : <FormattedText content={message.content} />}
        </div>
      ) : null}

      {cards(CARD_SLOTS.AFTER_TEXT)}
    </div>
  );
}
