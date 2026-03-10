/**
 * Share utilities — v1.5
 * Generates shareable room links and invite messages.
 * No backend changes — uses existing lobby route with gameId.
 */

/** Get the shareable room link for a lobby */
export function getRoomLink(gameId: string): string {
  const origin = window.location.origin
  const base = window.location.pathname.replace(/\/$/, '')
  // HashRouter: links are like https://host/path/#/lobby/GAMEID
  return `${origin}${base}#/lobby/${gameId}`
}

/** Get a copyable invite message */
export function getInviteMessage(joinCode: string, gameId: string): string {
  const link = getRoomLink(gameId)
  return `Join my Lucky Seven room!\nCode: ${joinCode}\n${link}`
}

/** Copy text to clipboard with fallback */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers / insecure contexts
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      return true
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}
