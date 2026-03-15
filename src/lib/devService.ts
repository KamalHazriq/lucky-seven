import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db, ensureAuth } from './firebase'
import type { DevAccessDoc, DevPrivileges, PrivatePlayerDoc, Card } from './types'

// ─── Client-side dev mode (no Cloud Functions needed) ────────────

/**
 * Activate dev mode by verifying the code against `config/dev` doc in Firestore.
 * The code is stored as a plain field — security relies on dev mode being hidden (Ctrl+Shift+D).
 */
export async function activateDevMode(
  gameId: string,
  code: string,
): Promise<{ success: boolean }> {
  const user = await ensureAuth()

  // Read the dev config doc
  const configSnap = await getDoc(doc(db, 'config', 'dev'))
  if (!configSnap.exists()) {
    throw new Error('Dev mode is not configured. Set up the config/dev document in Firestore.')
  }

  // Two access levels:
  //   1. Shared dev code (`code` field) — standard dev privileges for you + friend
  //   2. Owner-only code (`ownerCode` field) — grants all privileges including canReorderDiscardPile
  const sharedCode = configSnap.data()?.code as string | undefined
  const ownerCode = configSnap.data()?.ownerCode as string | undefined

  const isOwnerCode = !!ownerCode && code === ownerCode
  const isSharedCode = !!sharedCode && code === sharedCode

  if (!isOwnerCode && !isSharedCode) {
    throw new Error('Invalid access code')
  }

  // Write the devAccess doc for this user
  const privileges: DevPrivileges = {
    canSeeAllCards: true,
    canPeekDrawPile: true,
    canInspectGameState: true,
    canUseCheatActions: true,
    canReorderDiscardPile: isOwnerCode, // only granted with the owner code
  }

  const accessDoc: DevAccessDoc = {
    activatedAt: Date.now(),
    uid: user.uid,
    privileges,
  }

  await setDoc(doc(db, 'games', gameId, 'devAccess', user.uid), accessDoc)
  return { success: true }
}

/**
 * Deactivate dev mode by deleting the devAccess doc.
 */
export async function deactivateDevMode(gameId: string): Promise<{ success: boolean }> {
  const user = await ensureAuth()
  await deleteDoc(doc(db, 'games', gameId, 'devAccess', user.uid))
  return { success: true }
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
