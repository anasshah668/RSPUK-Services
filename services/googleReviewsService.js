const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const AVATAR_COLORS = ['#89CFF0', '#F08080', '#98D8AA', '#D4A5FF', '#FFB347', '#7EC8E3'];

let cache = null;

const defaultReviewsUrl = () =>
  process.env.GOOGLE_REVIEWS_URL?.trim() || 'https://share.google/vANleAmxbXBYeeSkp';

const avatarColorForName = (name) => {
  let hash = 0;
  const text = String(name || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const normalizePlaceId = (placeId) => {
  const raw = String(placeId || '').trim();
  if (!raw) return '';
  if (raw.startsWith('places/')) return raw.slice('places/'.length);
  return raw;
};

const getApiKey = () => process.env.GOOGLE_PLACES_API_KEY?.trim() || '';

async function googlePlacesRequest(url, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('Google Places API is not configured on the server');
    err.code = 'GOOGLE_REVIEWS_NOT_CONFIGURED';
    throw err;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Google Places API error (${response.status})`);
    err.code = 'GOOGLE_REVIEWS_FETCH_FAILED';
    err.status = response.status;
    throw err;
  }

  return data;
}

async function resolvePlaceId() {
  const configured = normalizePlaceId(process.env.GOOGLE_PLACE_ID);
  if (configured) return configured;

  const textQuery =
    process.env.GOOGLE_PLACE_SEARCH_QUERY?.trim() ||
    'River Signs and Print Unit D2 Warelands Way Middlesbrough TS4 2JY';

  const data = await googlePlacesRequest('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'X-Goog-FieldMask': 'places.id,places.displayName',
    },
    body: JSON.stringify({ textQuery }),
  });

  const place = data?.places?.[0];
  const id = normalizePlaceId(place?.id || place?.name);
  if (!id) {
    const err = new Error('Could not find a Google place for this business');
    err.code = 'GOOGLE_PLACE_NOT_FOUND';
    throw err;
  }

  return id;
}

const formatReviewDate = (publishTime) => {
  if (!publishTime) return '';
  const date = new Date(publishTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const mapReview = (review, index) => {
  const name = review?.authorAttribution?.displayName || 'Google user';
  const text = review?.text?.text || review?.originalText?.text || '';
  const id = review?.name || `${name}-${review?.publishTime || index}`;

  return {
    id: String(id),
    name,
    date: formatReviewDate(review?.publishTime),
    rating: Number(review?.rating) || 5,
    text,
    avatarUrl: review?.authorAttribution?.photoUri || null,
    avatarColor: avatarColorForName(name),
  };
};

export async function fetchGoogleReviews() {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.payload;
  }

  const placeId = await resolvePlaceId();
  const fieldMask = [
    'id',
    'displayName',
    'rating',
    'userRatingCount',
    'reviews',
    'googleMapsUri',
  ].join(',');

  const details = await googlePlacesRequest(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: 'GET',
      headers: {
        'X-Goog-FieldMask': fieldMask,
      },
    },
  );

  const payload = {
    ok: true,
    rating: Number(details.rating) || 0,
    reviewCount: Number(details.userRatingCount) || 0,
    reviewsUrl: defaultReviewsUrl() || details.googleMapsUri || '',
    placeName: details.displayName?.text || 'River Signs & Print',
    reviews: (details.reviews || []).map(mapReview),
  };

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  };

  return payload;
}

export function getGoogleReviewsFallback() {
  return {
    ok: false,
    reviewsUrl: defaultReviewsUrl(),
  };
}
