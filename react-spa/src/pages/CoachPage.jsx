import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { serializeAttachedActivities } from '@bikelab/shared/coach';
import { useCoachChat } from '../hooks/useCoachChat';
import { useActivities, useDeleteConversation, useRenameConversation, conversationByActivityQuery } from '../data/hooks';
import { queryClient } from '../data/queryClient';
import { Loader, useConfirm, useToast } from '../ui';
import CoachHome from './coach/CoachHome';
import ChatLayout from './coach/ChatLayout';
import ChatHeader from './coach/ChatHeader';
import MessageList from './coach/MessageList';
import ChatInput from './coach/ChatInput';
import ContextBar from './coach/ContextBar';
import SuggestedActions from './coach/SuggestedActions';
import ActivityPickerModal from './coach/ActivityPickerModal';
import { renderCoachCards } from './coach/cards';
import { buildEntryHiddenContext, buildWelcomeSuggestions, toAttachedActivity, visibleSuggestions } from './coach/lib';
import { t } from './coach/copy';
import styles from './coach/CoachPage.module.css';

const welcomeSuggestions = buildWelcomeSuggestions();

/**
 * `/coach` (home) and `/coach/c/:conversationId` (chat) share this page so
 * a chat started from the home hero keeps its state while the URL catches
 * up (the hook navigates to `/coach/c/:id` once the server has an id).
 *
 * Entry points link here with search params, consumed once and stripped:
 *   ?prompt=<text>                 start a new chat and send the prompt
 *   ?prompt=<text>&activity=<id>   open the chat that already covers this
 *                                  ride, else send the prompt with
 *                                  `activity_id: <id>` as hidden context
 *   ?prompt=<text>&event=<id>      send with `calendar_event_id: <id>`
 *   ?open=<conversationId>         open that conversation
 */
export default function CoachPage() {
  const navigate = useNavigate();
  const { conversationId: routeConversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const chat = useCoachChat();
  // The OvertrainingTrendCard draws from the rider's own ride list, not
  // from a tool result (see cards/index.jsx).
  const { data: activities } = useActivities();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();

  // A chat the rider just started that has no URL yet.
  const [draftChat, setDraftChat] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachedActivities, setAttachedActivities] = useState([]);
  const handledSearchRef = useRef(null);

  const view = routeConversationId || draftChat ? 'chat' : 'home';

  const { openConversation, startNewConversation, sendMessage, cancelStream, streaming } = chat;

  const beginNewChat = useCallback(() => {
    startNewConversation();
    setAttachedActivities([]);
    setDraftChat(true);
  }, [startNewConversation]);

  // Route → hook: open the conversation the URL names, and reset when the
  // URL goes back to the home without a draft in progress. Once the
  // stream's own `done` has set the id and navigated, both ids match and
  // nothing refetches. A pending `?prompt=` entry is left to the effect
  // below: resetting here as well would wipe the message it just sent when
  // StrictMode replays this effect with the pre-draft closure.
  const activeConversationId = chat.conversationId;
  const hasPendingPrompt = searchParams.has('prompt');
  useEffect(() => {
    if (routeConversationId) {
      setDraftChat(false);
      if (routeConversationId !== activeConversationId) openConversation(routeConversationId);
    } else if (!draftChat && !hasPendingPrompt) {
      startNewConversation();
    }
  }, [routeConversationId, activeConversationId, draftChat, hasPendingPrompt, openConversation, startNewConversation]);

  // Search-param entry points (see the header comment). The current
  // `location.search` is remembered so StrictMode's double effect run and
  // the strip-params navigation can't send the prompt twice.
  useEffect(() => {
    const search = searchParams.toString();
    if (!search || handledSearchRef.current === search) return;
    handledSearchRef.current = search;
    const prompt = searchParams.get('prompt');
    const activityId = searchParams.get('activity');
    const eventId = searchParams.get('event');
    const open = searchParams.get('open');
    setSearchParams({}, { replace: true });

    if (open) {
      navigate(`/coach/c/${open}`, { replace: true });
      return;
    }
    if (!prompt) return;

    const sendPrompt = () => {
      beginNewChat();
      sendMessage(prompt, { hiddenContext: buildEntryHiddenContext({ activityId, eventId }) });
    };

    if (!activityId) {
      // Deferred past this commit: useCoachChat aborts its stream on
      // unmount, and StrictMode's mount→unmount→mount replay would cancel a
      // turn started synchronously here (the activity branch below is
      // already async through fetchQuery).
      Promise.resolve().then(sendPrompt);
      return;
    }
    // A ride is only analysed once per conversation thread: reopen the
    // existing chat about it instead of starting a duplicate.
    setDraftChat(true);
    queryClient
      .fetchQuery(conversationByActivityQuery(Number(activityId)))
      .then((existing) => {
        if (existing?.id) navigate(`/coach/c/${existing.id}`, { replace: true });
        else sendPrompt();
      })
      .catch(sendPrompt);
  }, [searchParams, setSearchParams, navigate, beginNewChat, sendMessage]);

  const handleBack = () => {
    if (streaming) cancelStream();
    setDraftChat(false);
    navigate('/coach');
  };

  const handleNewChat = () => {
    beginNewChat();
    if (routeConversationId) navigate('/coach', { replace: false });
  };

  const confirmDelete = () => confirm({ title: t('coach.deleteChat'), message: t('coach.deleteChatConfirm'), confirmText: 'Delete', danger: true });

  const handleDeleteConversation = async (conversation) => {
    if (!(await confirmDelete())) return;
    deleteConversation.mutate(conversation.id, { onError: () => toast.error('Failed to delete the chat.') });
  };

  const handleDeleteCurrent = async () => {
    if (!chat.conversationId) return;
    if (!(await confirmDelete())) return;
    const id = chat.conversationId;
    setDraftChat(false);
    navigate('/coach', { replace: true });
    deleteConversation.mutate(id, { onError: () => toast.error('Failed to delete the chat.') });
  };

  const handleRenameConversation = (conversation, title) => {
    renameConversation.mutate({ id: conversation.id, title }, { onError: () => toast.error('Failed to rename the chat.') });
  };

  const handleOpenConversation = (conversation) => navigate(`/coach/c/${conversation.id}`);

  const renderCards = useCallback(
    (slot, ctx) => renderCoachCards(slot, { ...ctx, navigate, activities }),
    [navigate, activities],
  );

  const handleHomeSubmit = (text) => {
    beginNewChat();
    sendMessage(text);
  };

  const handleQuickStart = (item) => {
    beginNewChat();
    sendMessage(item.prompt ?? item.label);
  };

  // Chips send their label verbatim; a `detail` chip also tags the reply so
  // the bubble reveals exactly that one analysis card.
  const handleSuggestionPress = (item) => {
    sendMessage(item.label, item.detail ? { revealDetail: item.detail } : undefined);
  };

  // Attached rides ride along as hidden context on this one turn only.
  const handleSend = (text) => {
    const opts = attachedActivities.length > 0 ? { hiddenContext: serializeAttachedActivities(attachedActivities) } : undefined;
    sendMessage(text, opts);
    setAttachedActivities([]);
  };

  const handleAttach = (chosen) => {
    setAttachedActivities(chosen.map(toAttachedActivity));
    setPickerOpen(false);
  };

  if (view === 'home') {
    return (
      <>
        <CoachHome
          onHomeSubmit={handleHomeSubmit}
          onQuickStart={handleQuickStart}
          onOpenConversation={handleOpenConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          onNewChat={handleNewChat}
        />
        {confirmDialog}
      </>
    );
  }

  const suggestions = visibleSuggestions(chat.suggestions);

  return (
    <ChatLayout>
      <ChatHeader
        onBack={handleBack}
        onNewChat={handleNewChat}
        onDeleteCurrent={handleDeleteCurrent}
        streaming={streaming}
        hasConversation={Boolean(chat.conversationId)}
      />

      {chat.loadingConversation ? (
        <div className={styles.centerFill}>
          <Loader label="Loading conversation..." size="lg" />
        </div>
      ) : chat.messages.length === 0 ? (
        <div className={styles.welcome}>
          <h2 className={styles.welcomeTitle}>{t('coach.welcomeTitle')}</h2>
          <p className={styles.welcomeSubtitle}>{t('coach.welcomeSubtitle')}</p>
          <SuggestedActions items={welcomeSuggestions} onPress={handleSuggestionPress} disabled={streaming} className={styles.welcomeChips} />
        </div>
      ) : (
        <MessageList
          messages={chat.messages}
          suggestions={suggestions}
          streaming={streaming}
          onSuggestionPress={handleSuggestionPress}
          renderCards={renderCards}
        />
      )}

      <ContextBar error={chat.error} />

      <ChatInput
        onSend={handleSend}
        onCancel={cancelStream}
        streaming={streaming}
        disabled={chat.loadingConversation}
        onAttachPress={() => setPickerOpen(true)}
        attachedActivities={attachedActivities}
        onRemoveAttachment={(id) => setAttachedActivities((prev) => prev.filter((a) => a.id !== id))}
      />

      <ActivityPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleAttach}
        preselectedIds={attachedActivities.map((a) => a.id)}
      />
      {confirmDialog}
    </ChatLayout>
  );
}
