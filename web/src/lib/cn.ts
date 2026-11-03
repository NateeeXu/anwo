import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must know our token names so `cn('text-body', 'text-ink')` keeps both
// (text-body is a font size, text-ink a color) and `cn('rounded-card', 'rounded-sm')` keeps the last.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'display-sm', 'h1', 'h1-sm', 'h2', 'h3', 'body-lg', 'body', 'small', 'caption', 'price-lg', 'price'],
      radius: ['xs', 'sm', 'ctl', 'card', 'lg', 'pill', 'none'],
      shadow: ['sm', 'md', 'lg', 'pin', 'none'],
      container: ['content', 'detail', 'reading', 'form'],
      ease: ['out', 'in-out', 'emphasis'],
      animate: ['fade-in', 'rise-in', 'sheet-up', 'pin-pop', 'shimmer'],
    },
    classGroups: {
      z: [{ 'z-layer': ['base', 'raised', 'sticky', 'nav', 'dropdown', 'overlay', 'modal', 'toast', 'tooltip'] }],
      duration: [{ 'duration-token': ['fast', 'base', 'slow', 'sheet'] }],
    },
  },
})

/** Merge class names: clsx semantics + Tailwind conflict resolution aware of our tokens. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
