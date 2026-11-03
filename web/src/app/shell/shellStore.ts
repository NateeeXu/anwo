// Small zustand store the shell reads: mobile top-bar title, tab-bar visibility and layout mode.
// Pages set these through <Head> and useShellOptions(); route objects may also set `handle`.
import { create } from 'zustand';
import { useEffect } from 'react';

export type ShellLayout = 'default' | 'full' | 'bare';
export type ShellOptions = { title?: string; hideTabs?: boolean; layout?: ShellLayout; back?: boolean };

type State = ShellOptions & {
  title: string;
  postSheetOpen: boolean;
  setOptions: (o: ShellOptions) => void;
  reset: () => void;
  openPostSheet: () => void;
  closePostSheet: () => void;
};

export const useShellStore = create<State>((set) => ({
  title: '',
  hideTabs: false,
  layout: 'default',
  back: undefined,
  postSheetOpen: false,
  setOptions: (o) => set((s) => ({ ...s, ...o })),
  reset: () => set({ title: '', hideTabs: false, layout: 'default', back: undefined }),
  openPostSheet: () => set({ postSheetOpen: true }),
  closePostSheet: () => set({ postSheetOpen: false }),
}));

/** Declare shell options for the lifetime of the calling page (e.g. hideTabs on a chat thread). */
export function useShellOptions(options: ShellOptions) {
  const setOptions = useShellStore((s) => s.setOptions);
  const { title, hideTabs, layout, back } = options;
  useEffect(() => {
    setOptions({ title, hideTabs, layout, back });
    return () => setOptions({ hideTabs: false, layout: 'default', back: undefined });
  }, [title, hideTabs, layout, back, setOptions]);
}

/** Opens the "What are you posting?" sheet from anywhere (DESIGN.md §6.4). */
export function usePostSheet() {
  const open = useShellStore((s) => s.openPostSheet);
  const close = useShellStore((s) => s.closePostSheet);
  const isOpen = useShellStore((s) => s.postSheetOpen);
  return { open, close, isOpen };
}
