'use client';
import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, Copy, Share2 } from 'lucide-react';
import type { RoundReview } from '@filmless/contracts';
import { Button } from './ui/button';

/** Always leave a selectable, spoiler-free fallback when the clipboard is denied. */
export function ResultShare({
  history,
  score,
  day,
}: {
  history: RoundReview[];
  score: number;
  day?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const prepare = () => {
    const solved = history.filter((r) => r.solved).length;
    return `Кадрово${day ? ` · ${day}` : ''}\n${history.map((r) => (r.solved ? '🟩' : '⬛')).join('')}\n${solved}/${history.length} · ${score} очков\n${location.origin}`;
  };
  const copy = async () => {
    const result = prepare();
    setText(result);
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setCopied(false);
      setOpen(true);
    }
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          onClick={() => {
            setText(prepare());
            setCopied(false);
          }}
        >
          <Share2 /> Поделиться результатом
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="result-share-preview"
          sideOffset={8}
          collisionPadding={16}
          align="start"
          aria-label="Поделиться результатом"
        >
          <label
            className="text-xs text-muted-foreground"
            htmlFor="result-share-text"
          >
            Без названий фильмов и спойлеров
          </label>
          <textarea
            id="result-share-text"
            readOnly
            value={text}
            rows={4}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Скопировано' : 'Копировать'}
          </Button>
          <span className="text-xs text-muted-foreground" role="status">
            {copied
              ? 'Можно отправить друзьям.'
              : 'Или выделите и скопируйте текст.'}
          </span>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
