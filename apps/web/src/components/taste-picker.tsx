'use client';
import { collectionDefinitions, type CollectionId } from '@filmless/contracts';
export function TastePicker({
  value,
  onChange,
  disabled,
}: {
  value: CollectionId[];
  onChange: (v: CollectionId[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {collectionDefinitions
        .filter((c) => c.id !== 'all')
        .map((c) => (
          <button
            type="button"
            className="taste-chip"
            key={c.id}
            aria-pressed={value.includes(c.id)}
            disabled={disabled || (!value.includes(c.id) && value.length >= 3)}
            onClick={() =>
              onChange(
                value.includes(c.id)
                  ? value.filter((v) => v !== c.id)
                  : [...value, c.id],
              )
            }
          >
            {c.name}
          </button>
        ))}
    </div>
  );
}
