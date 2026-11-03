import { forwardRef, useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { Button } from './Button'
import { Modal } from './Modal'

export interface GalleryPhoto {
  src: string
  alt: string
  id?: string
}

export interface PhotoGalleryProps extends HTMLAttributes<HTMLDivElement> {
  photos: GalleryPhoto[]
  /** `hero`: 1 large + 4 small (desktop), swipeable 4:3 with dots (mobile). `grid`: uniform 4:3 grid. */
  layout?: 'hero' | 'grid'
  /** Called with the index when a photo is opened (lightbox opens regardless unless `noLightbox`). */
  onOpen?: (index: number) => void
  noLightbox?: boolean
  /** Aspect for `grid` tiles and mobile hero (default 4/3; use 1 for items) */
  aspect?: '4/3' | '1'
}

/** DESIGN.md §5 PhotoGallery. */
export const PhotoGallery = forwardRef<HTMLDivElement, PhotoGalleryProps>(function PhotoGallery(
  { photos, layout = 'hero', onOpen, noLightbox, aspect = '4/3', className, ...rest },
  ref,
) {
  const t = useT()
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [dot, setDot] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const ratio = aspect === '1' ? 'aspect-square' : 'aspect-[4/3]'

  const open = (i: number) => {
    onOpen?.(i)
    if (!noLightbox) setLightbox(i)
  }
  const step = (d: 1 | -1) => setLightbox((i) => (i == null ? i : (i + d + photos.length) % photos.length))

  useEffect(() => {
    if (lightbox == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setDot(Math.round(el.scrollLeft / el.clientWidth))
  }

  if (photos.length === 0) {
    return (
      <div ref={ref} className={cn('flex items-center justify-center rounded-lg bg-sunken text-ink-4', ratio, className)} {...rest}>
        <Images size={40} strokeWidth={1.5} aria-hidden />
      </div>
    )
  }

  const img = (p: GalleryPhoto, i: number, cls?: string) => (
    <button
      key={p.id ?? i}
      type="button"
      onClick={() => open(i)}
      aria-label={p.alt}
      className={cn('group/ph relative block overflow-hidden bg-sunken focus-visible:z-[1]', cls)}
    >
      <img src={p.src} alt={p.alt} loading={i === 0 ? 'eager' : 'lazy'} className="size-full object-cover transition-transform duration-token-slow ease-out group-hover/ph:scale-[1.02] dark:brightness-[.92]" />
    </button>
  )

  const lightboxEl = !noLightbox && lightbox != null && (
    <Modal open onClose={() => setLightbox(null)} size="lg" forceModal hideClose={false} bodyClassName="p-0 pb-0" className="bg-paper" title={<span className="text-small font-medium text-ink-2 tabular-nums">{t('ui.photoCounter', { index: lightbox + 1, count: photos.length })}</span>}>
      <div className="relative flex items-center justify-center bg-sunken">
        <img src={photos[lightbox].src} alt={photos[lightbox].alt} className="max-h-[70dvh] w-auto max-w-full object-contain dark:brightness-[.92]" />
        {photos.length > 1 && (
          <>
            <Button variant="secondary" size="md" iconOnly aria-label={t('ui.prevPhoto')} onClick={() => step(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-pill shadow-md">
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="md" iconOnly aria-label={t('ui.nextPhoto')} onClick={() => step(1)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill shadow-md">
              <ChevronRight />
            </Button>
          </>
        )}
      </div>
    </Modal>
  )

  if (layout === 'grid') {
    return (
      <div ref={ref} className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4', className)} {...rest}>
        {photos.map((p, i) => img(p, i, cn('rounded-sm', ratio)))}
        {lightboxEl}
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('relative', className)} {...rest}>
      {/* desktop hero */}
      <div className="hidden overflow-hidden rounded-lg md:grid md:h-[420px] md:grid-cols-4 md:grid-rows-2 md:gap-2">
        {img(photos[0], 0, 'col-span-2 row-span-2 h-full')}
        {photos.slice(1, 5).map((p, i) => img(p, i + 1, 'h-full'))}
        {photos.length < 5 &&
          Array.from({ length: 5 - photos.length }).map((_, i) => <div key={`f${i}`} className="bg-sunken" aria-hidden />)}
      </div>
      {/* mobile swipe */}
      <div ref={scroller} onScroll={onScroll} className={cn('no-scrollbar flex snap-x snap-mandatory overflow-x-auto md:hidden', ratio)}>
        {photos.map((p, i) => (
          <div key={p.id ?? i} className="w-full shrink-0 snap-center">
            {img(p, i, 'size-full')}
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden" aria-hidden>
          {photos.slice(0, 10).map((_, i) => (
            <span key={i} className={cn('size-1.5 rounded-pill bg-white/80 transition-opacity', i === dot ? 'opacity-100' : 'opacity-40')} />
          ))}
        </div>
      )}
      {photos.length > 1 && (
        <Button variant="secondary" size="sm" iconLeft={<Images />} onClick={() => open(0)} className="absolute bottom-3 right-3 shadow-md">
          {t('ui.showAllPhotos', { count: photos.length })}
        </Button>
      )}
      {lightboxEl}
    </div>
  )
})
