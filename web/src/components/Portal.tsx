import { useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let portalRoot: HTMLElement | null = null
function getRoot(): HTMLElement {
  if (portalRoot && portalRoot.isConnected) return portalRoot
  let el = document.getElementById('anwo-portal')
  if (!el) {
    el = document.createElement('div')
    el.id = 'anwo-portal'
    document.body.appendChild(el)
  }
  portalRoot = el
  return el
}

/** Renders children into a body-level container (overlays, tooltips, toasts). */
// The root is resolved synchronously on the client so floating elements exist in the same commit as their anchor
// (useAnchorPosition measures them in a layout effect; a deferred root left menus at -9999px until a scroll/resize).
export function Portal({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(() => (typeof document !== 'undefined' ? getRoot() : null))
  useLayoutEffect(() => {
    if (!root || !root.isConnected) setRoot(getRoot())
  }, [root])
  return root ? createPortal(children, root) : null
}
