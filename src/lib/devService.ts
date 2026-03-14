import {
  doc,
  collection,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, db, ensureAuth } from './firebase'
import type { DevAccessDoc, PrivatePlayerDoc, Card } from './types'

// ─── Cloud Function calls ───────────────────────────────────────

const functions = getFunctions(app)

export async function activateDevMode(
  gameId: string,
  code: string,
): Promise<{ success: boolean }> {
  await ensureAuth()
  const fn = httpsCallable<{ gameId: string; code: string }, { success: boolean }>(
    functions,
    'activateDevMode',
  )
  const result = await fn({ gameId, code })
  return result.data
}

export async function deactivateDevMode(gameId: string): Promise<{ success: boolean }> {
  await ensureAuth()
  const fn = httpsCallable<{ gameId: string }, { success: boolean }>(
    functions,
    'deactivateDevMode',
  )
  const result = await fn({ gameId })
  return result.data
}

// ─── Subscriptions ──────────────────────────────────────────────

/** Subscribe to the current user's devAccess doc for a game */
export function subscribeDevAccess(
  gameId: string,
  uid: string,
  cb: (access: DevAccessDoc | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'games', gameId, 'devAccess', uid), (snap) => {
    if (snap.exists()) {
      cb(snap.data() as DevAccessDoc)
    } else {
      cb(null)
    }
  })
}

/** Subscribe to ALL players' private data (dev mode only) */
export function subscribeAllPrivate(
  gameId: string,
  cb: (allPrivate: Record<string, PrivatePlayerDoc>) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'games', gameId, 'private'), (snap) => {
    const result: Record<string, PrivatePlayerDoc> = {}
    snap.forEach((d) => {
      result[d.id] = d.data() as PrivatePlayerDoc
    })
    cb(result)
  })
}

/** Subscribe to the draw pile (dev mode only) */
export function subscribeDrawPile(
  gameId: string,
  cb: (cards: Card[]) => void,
): Unsubscribe {
  return onSnapshot(doc(db, 'games', gameId, 'internal', 'drawPile'), (snap) => {
    if (snap.exists()) {
      cb((snap.data()?.cards as Card[]) ?? [])
    } else {
      cb([])
    }
  })
}
