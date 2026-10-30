// Links into the coach from other pages. The coach page consumes these
// search params once and strips them (see CoachPage.jsx's header comment),
// so a reload of the chat never re-sends the prompt.

/** `/coach?prompt=…` — start a new chat with this message. */
export function coachPromptUrl(prompt, { activityId, eventId } = {}) {
  const params = new URLSearchParams({ prompt });
  if (activityId != null) params.set('activity', String(activityId));
  if (eventId != null) params.set('event', String(eventId));
  return `/coach?${params.toString()}`;
}

/** `/coach?open=…` — open an existing conversation. */
export function coachOpenUrl(conversationId) {
  return `/coach?${new URLSearchParams({ open: conversationId }).toString()}`;
}
