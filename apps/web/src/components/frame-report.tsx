'use client';
import { Flag } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/account';
import type { RoomSession } from '@filmless/contracts';
export function FrameReport({ session }: { session: RoomSession }) {
  const report = useMutation({
    mutationFn: (reason: string) =>
      api('experience/report', 'POST', {
        code: session.code,
        token: session.token,
        reason,
      }),
  });
  return (
    <details className="frame-report">
      <summary>
        <Flag size={13} />
        Проблема с кадром
      </summary>
      <div>
        {report.isSuccess ? (
          <span role="status">Спасибо, сообщение сохранено.</span>
        ) : (
          <>
            {[
              ['broken', 'Не загружается'],
              ['text', 'Видно название'],
              ['wrong-film', 'Не тот фильм'],
            ].map(([id, label]) => (
              <button
                key={id}
                disabled={report.isPending}
                onClick={() => report.mutate(id!)}
              >
                {label}
              </button>
            ))}
          </>
        )}
        {report.error && <span role="alert">{report.error.message}</span>}
      </div>
    </details>
  );
}
