const conversationContext = {
  lastCreatedTask: null,
  lastUpdatedTask: null,
  lastDeletedCandidate: null,
  lastReadResults: [],
  pendingDeleteTask: null,
  pendingDeleteRequest: null,
}

export function getConversationContext() {
  return conversationContext
}

export function updateConversationContext(updates) {
  Object.assign(conversationContext, updates)
  return conversationContext
}

export function setPendingDeleteTask(task) {
  conversationContext.pendingDeleteTask = task
  conversationContext.lastDeletedCandidate = task
}

export function clearPendingDeleteTask() {
  conversationContext.pendingDeleteTask = null
}

export function setPendingDeleteRequest(deleteRequest) {
  conversationContext.pendingDeleteRequest = deleteRequest
  conversationContext.lastDeletedCandidate = deleteRequest.tasks.at(-1) || null
}

export function clearPendingDeleteRequest() {
  conversationContext.pendingDeleteRequest = null
}
