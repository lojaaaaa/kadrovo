import { mkdir, writeFile } from 'node:fs/promises';
// Read-only, bounded provider probe. Does not download images or publish content.
const [provider, id, season, episode] = process.argv.slice(2);
const providers = {
  'kinopoisk-unofficial': {
    env: 'KINOPOISK_UNOFFICIAL_API_KEY',
    base: 'https://kinopoiskapiunofficial.tech',
    paths: (i) => [
      `/api/v2.2/films/${i}`,
      `/api/v2.2/films/${i}/images?type=STILL&page=1`,
    ],
  },
  poiskkino: {
    env: 'POISKKINO_API_KEY',
    base: 'https://api.poiskkino.dev',
    paths: (i) => [
      `/v1.5/movie/${i}`,
      `/v1.5/image?movieId=${i}&limit=50&type=frame&type=still&type=screenshot`,
    ],
  },
  'tmdb-movie': {
    env: 'TMDB_READ_TOKEN',
    base: 'https://api.themoviedb.org',
    paths: (i) => [
      `/3/movie/${i}?language=ru-RU`,
      `/3/movie/${i}/images?include_image_language=ru,en,null`,
    ],
  },
  'tmdb-series': {
    env: 'TMDB_READ_TOKEN',
    base: 'https://api.themoviedb.org',
    paths: (i) => [
      `/3/tv/${i}?language=ru-RU`,
      `/3/tv/${i}/images?include_image_language=ru,en,null`,
      ...(season && episode
        ? [`/3/tv/${i}/season/${season}/episode/${episode}/images`]
        : []),
    ],
  },
};
const selected = providers[provider];
if (
  !selected ||
  !/^\d+$/.test(id ?? '') ||
  [season, episode].some((v) => v !== undefined && !/^\d+$/.test(v))
) {
  console.error(
    'Usage: pnpm api:probe <poiskkino|kinopoisk-unofficial|tmdb-movie|tmdb-series> <numeric-id> [season episode]',
  );
  process.exitCode = 1;
} else if (!process.env[selected.env]) {
  console.error(
    `Missing ${selected.env}. Put it in local .env; never commit API keys.`,
  );
  process.exitCode = 1;
} else {
  const requests = [];
  for (const path of selected.paths(id)) {
    const started = Date.now();
    try {
      const headers = provider.startsWith('tmdb')
        ? { Authorization: `Bearer ${process.env[selected.env]}` }
        : { 'X-API-KEY': process.env[selected.env] };
      const response = await fetch(new URL(path, selected.base), {
        headers,
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      if (!response.ok) {
        requests.push({
          path,
          status: response.status,
          durationMs: Date.now() - started,
        });
        process.exitCode = 1;
        // Stop on auth/quota errors. No automatic retries consuming the quota.
        break;
      }
      const data = await response.json();
      const items =
        data.items ?? data.docs ?? data.stills ?? data.backdrops ?? [];
      requests.push({
        path,
        status: response.status,
        durationMs: Date.now() - started,
        title: data.nameRu ?? data.name ?? data.title,
        year: data.year ?? data.release_date ?? data.first_air_date,
        posterPresent: Boolean(
          data.posterUrl ?? data.poster?.url ?? data.poster_path,
        ),
        returnedImages: items.length,
        returnedPosters: data.posters?.length,
        hasNext: data.hasNext,
        total: data.total,
        types: [...new Set(items.map((i) => i.type).filter(Boolean))],
        images: items.map((i) => ({
          type: i.type,
          url: i.url ?? i.imageUrl ?? i.file_path,
          width: i.width,
          height: i.height,
        })),
      });
    } catch {
      requests.push({
        path,
        error: 'network_timeout_redirect_or_invalid_response',
      });
      process.exitCode = 1;
      break;
    }
  }
  await mkdir('reports', { recursive: true });
  const destination = `reports/${provider}-${id}-${Date.now()}.json`;
  await writeFile(
    destination,
    JSON.stringify(
      {
        provider,
        id,
        checkedAt: new Date().toISOString(),
        note: 'First page only; availability probe. Images are validated automatically by the content pipeline.',
        requests,
      },
      null,
      2,
    ),
  );
  console.log(`Report saved: ${destination}. Requests: ${requests.length}.`);
}
