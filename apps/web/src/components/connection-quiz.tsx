'use client';
import { useState } from 'react';
import type { RoundReview } from '@filmless/contracts';
import { connectionQuiz } from '@/lib/connection';
import { Button } from './ui/button';
export function ConnectionQuiz({ history }: { history: RoundReview[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const quiz = connectionQuiz(history);
  if (!quiz) return null;
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        Связь · дополнительный вопрос
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Без очков — результат партии не меняется.
        </p>
        <p className="text-sm">{quiz.names.join(' · ')}</p>
        <h2 className="font-semibold">{quiz.prompt}</h2>
        <div className="grid grid-cols-2 gap-2">
          {quiz.options.map((value) => (
            <Button
              key={value}
              variant={chosen && value === quiz.correct ? 'default' : 'outline'}
              disabled={chosen !== null}
              onClick={() => setChosen(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        {chosen && (
          <p role="status" className="text-sm">
            {chosen === quiz.correct
              ? 'Верно.'
              : 'Правильный ответ: ' + quiz.correct}
          </p>
        )}
      </div>
    </details>
  );
}
