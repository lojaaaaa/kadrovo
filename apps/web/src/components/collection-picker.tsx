'use client';
import {
  collectionDefinitions,
  type CollectionId,
  type ContentAvailability,
  type CreateRoom,
} from '@filmless/contracts';
import { Check, Film } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
export function CollectionPicker({
  value,
  onChange,
  availability,
  category,
  mode,
  disabled = false,
  isLoading = false,
}: {
  value: CollectionId;
  onChange: (id: CollectionId) => void;
  availability?: ContentAvailability;
  category: CreateRoom['category'];
  mode: CreateRoom['mode'];
  disabled?: boolean;
  isLoading?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="collection-picker">
      <legend>
        <Film size={15} />
        Подборка фильмов
      </legend>
      <div className="collection-picker-grid">
        {collectionDefinitions.map((list) => {
          const count =
            availability?.collections
              ?.find((c) => c.id === list.id)
              ?.categories.find((c) => c.category === category)?.[mode] ?? 0;
          return isLoading ? (
            <Skeleton key={list.id} className="h-14 w-full" />
          ) : (
            <button
              type="button"
              key={list.id}
              disabled={!!availability && count < 3}
              aria-pressed={value === list.id}
              title={list.description}
              onClick={() => onChange(list.id)}
            >
              <span>
                {list.name}
                <small>{count} фильмов</small>
              </span>
              {value === list.id && <Check size={16} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
