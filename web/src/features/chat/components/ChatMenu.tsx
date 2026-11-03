// Local wrapper around the kit DropdownMenu. The kit's Portal mounts its children one commit after the menu opens, so
// useAnchorPosition measures a missing element and leaves the menu at (-9999, -9999) until a scroll/resize event fires.
// Dispatching a synthetic resize right after open makes it recompute (integration request filed in docs/modules/chat.md).
import { DropdownMenu, type DropdownMenuProps } from '@/components';

export function ChatMenu(props: DropdownMenuProps) {
  return (
    <DropdownMenu
      {...props}
      onOpenChange={(open) => {
        props.onOpenChange?.(open);
        if (open) {
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
          });
        }
      }}
    />
  );
}
