// Composer (DESIGN.md §7.6): [photo] [auto-grow textarea] [send]. Enter sends, Shift+Enter newline. Images upload
// immediately (PhotoUploader-lite: single file, purpose `chat`) and are sent as an `image` message with the upload id.
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Image as ImageIcon, SendHorizontal } from 'lucide-react';
import type { Upload } from '@shared/types';
import { Button } from '@/components';
import { cn } from '@/lib/cn';
import { uploadFiles } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { storage } from '@/lib/storage';

const MAX_MB = 10;

export function Composer({
  conversationId,
  group,
  disabled,
  onSend,
  onTyping,
}: {
  conversationId: string;
  group: boolean;
  disabled?: boolean;
  onSend: (input: { kind: 'text' | 'image'; body?: string; uploadId?: string; image?: Upload }) => Promise<unknown>;
  onTyping: (typing: boolean) => void;
}) {
  const t = useT();
  const draftKey = `anwo.chat.draft.${conversationId}`;
  const [text, setText] = useState<string>(() => storage.get<string>(draftKey, ''));
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // per-thread draft (localStorage, per viewer)
  useEffect(() => {
    setText(storage.get<string>(draftKey, ''));
  }, [draftKey]);
  useEffect(() => {
    if (text) storage.set(draftKey, text);
    else storage.remove(draftKey);
  }, [text, draftKey]);

  // auto-grow up to ~6 lines
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const canSend = text.trim().length > 0 && !disabled && !sending;

  const submit = async () => {
    const body = text.trim();
    if (!body || disabled || sending) return;
    setSending(true);
    setText('');
    onTyping(false);
    try {
      await onSend({ kind: 'text', body });
    } catch {
      /* the bubble shows the failed state + retry */
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('chat.composer.imageOnly'));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(t('chat.composer.imageTooLarge'));
      return;
    }
    setUploading(true);
    try {
      const [up] = await uploadFiles([file], 'chat');
      if (!up) throw new Error('upload failed');
      await onSend({ kind: 'image', uploadId: up.id, image: up, body: undefined });
    } catch (err) {
      if (!(err && typeof err === 'object' && 'code' in err)) toast.error(t('chat.toast.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden />
      <Button type="button" variant="ghost" iconOnly aria-label={t('chat.composer.image')} disabled={disabled || uploading} loading={uploading} onClick={() => fileRef.current?.click()} className="shrink-0">
        <ImageIcon />
      </Button>
      <div className="relative min-w-0 flex-1">
        <label htmlFor={`composer-${conversationId}`} className="sr-only">
          {t('chat.composer.placeholder')}
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={taRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={group ? t('chat.composer.placeholderGroup') : t('chat.composer.placeholder')}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) onTyping(true);
          }}
          onBlur={() => onTyping(false)}
          onKeyDown={onKeyDown}
          maxLength={4000}
          enterKeyHint="send"
          className={cn(
            'block max-h-40 w-full resize-none rounded-ctl border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-3',
            'focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3',
          )}
        />
      </div>
      <Button type="submit" variant="primary" iconOnly aria-label={t('chat.composer.send')} disabled={!canSend} className="shrink-0">
        <SendHorizontal />
      </Button>
    </form>
  );
}
