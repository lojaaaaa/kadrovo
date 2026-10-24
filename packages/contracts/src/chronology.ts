export type ChronologyFilm = {
  name: string;
  posterUrl?: string;
  year?: number;
};
export type ChronologySnapshot = {
  sessionId: string;
  pairId: string;
  round: number;
  total: number;
  score: number;
  phase: 'answer' | 'reveal' | 'finished';
  anchor: ChronologyFilm;
  challenger: ChronologyFilm;
  result?: {
    correct: boolean;
    choice: 'earlier' | 'later';
    answer: 'earlier' | 'later';
  };
};
