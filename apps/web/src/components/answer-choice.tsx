'use client';
import { TextCursorInput, ListChecks } from 'lucide-react';
export function AnswerChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: 'search' | 'choices';
  onChange: (value: 'search' | 'choices') => void;
  disabled?: boolean;
}) {
  return (
    <div className="answer-choice" role="group" aria-label="Формат ответа">
      {(['search', 'choices'] as const).map((mode) => (
        <button
          type="button"
          key={mode}
          aria-pressed={value === mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
        >
          {mode === 'search' ? (
            <TextCursorInput aria-hidden="true" />
          ) : (
            <ListChecks aria-hidden="true" />
          )}
          {mode === 'search' ? 'Ввод названия' : 'Выбор из 4'}
        </button>
      ))}
    </div>
  );
}
