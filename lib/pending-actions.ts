// In-memory store for pending AI actions
// In production, use Redis or database
export const pendingActions = new Map<string, any>()

// Clean up expired actions periodically
setInterval(() => {
  const now = Date.now()
  for (const [id, action] of pendingActions.entries()) {
    if (now - action.createdAt.getTime() > 5 * 60 * 1000) {
      pendingActions.delete(id)
    }
  }
}, 60 * 1000) // Check every minute

