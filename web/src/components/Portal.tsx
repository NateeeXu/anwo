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
export function Portal({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => setRoot(getRoot()), [])
  return root ? createPortal(children, root) : null
}
