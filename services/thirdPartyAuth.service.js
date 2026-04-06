let tokenCache = {
  value: null,
  expiresAt: 0,
};

const getRequiredEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required in environment variables`);
  }
  return value;
};

const getAuthConfig = () => {
  const baseUrl = getRequiredEnv('THIRD_PARTY_BASE_URL').replace(/\/+$/, '');
  const username = getRequiredEnv('THIRD_PARTY_USERNAME');
  const password = getRequiredEnv('THIRD_PARTY_PASSWORD');
  const tokenTtlSeconds = Number(process.env.THIRD_PARTY_TOKEN_TTL_SECONDS || 3000);

  return { baseUrl, username, password, tokenTtlSeconds };
};

const isTokenValid = () => {
  return Boolean(tokenCache.value) && Date.now() < tokenCache.expiresAt;
};

const parseDurationToSeconds = (value, fallbackSeconds) => {
  if (value === null || value === undefined || value === '') return fallbackSeconds;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value).trim().toLowerCase();
  if (/^\d+$/.test(str)) return Number(str);
  const match = str.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return fallbackSeconds;
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return amount;
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 3600;
  if (unit === 'd') return amount * 86400;
  return fallbackSeconds;
};

export const clearThirdPartyTokenCache = () => {
  tokenCache = { value: null, expiresAt: 0 };
};

export const loginThirdParty = async () => {
  const { baseUrl, username, password, tokenTtlSeconds } = getAuthConfig();
  const loginUrl = `${baseUrl}/v2/login`;

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Third-party login failed with ${response.status}`;
    throw new Error(message);
  }

  const result = payload?.result || payload?.data || payload;
  const token = result?.token || result?.accessToken || result?.access_token;
  if (!token) {
    throw new Error('Third-party login succeeded but token was not found in response');
  }

  const expiresInRaw = result?.expiresIn || result?.expires_in || payload?.expiresIn || payload?.expires_in;
  const expiresInSeconds = parseDurationToSeconds(expiresInRaw, tokenTtlSeconds);
  const safeExpiryMs = Math.max(30, expiresInSeconds - 30) * 1000; // refresh slightly early
  tokenCache = {
    value: token,
    expiresAt: Date.now() + safeExpiryMs,
  };

  return token;
};

export const getThirdPartyToken = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && isTokenValid()) {
    return tokenCache.value;
  }
  return loginThirdParty();
};

const normalizeAttributesResult = (result) => {
  if (!result || typeof result !== 'object') return [];
  return Object.entries(result).map(([productName, data]) => {
    const values = data?.values || {};
    return {
      name: productName,
      productKey: values?.productKey || null,
      attributes: values?.attributes || {},
    };
  });
};

export const fetchThirdPartyProductAttributes = async ({ forceRefresh = false } = {}) => {
  const { baseUrl } = getAuthConfig();
  let token = await getThirdPartyToken({ forceRefresh });
  const endpoint = `${baseUrl}/v2/products-v2/attributes-v2`;

  const callApi = async (authToken) => {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  let { response, payload } = await callApi(token);

  // Retry once with forced token refresh if unauthorized
  if (response.status === 401) {
    token = await getThirdPartyToken({ forceRefresh: true });
    ({ response, payload } = await callApi(token));
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Failed to fetch product attributes (${response.status})`;
    throw new Error(message);
  }

  const result = payload?.result || payload?.data || {};
  return {
    success: payload?.success !== false,
    raw: result,
    products: normalizeAttributesResult(result),
  };
};

export const fetchThirdPartyProductAttributesByName = async (productName, { forceRefresh = false } = {}) => {
  if (!productName) {
    throw new Error('productName is required');
  }

  const { baseUrl } = getAuthConfig();
  let token = await getThirdPartyToken({ forceRefresh });
  const encodedName = encodeURIComponent(productName);
  const endpoint = `${baseUrl}/v2/products-v2/attributes-v2/${encodedName}`;

  const callApi = async (authToken) => {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  let { response, payload } = await callApi(token);

  if (response.status === 401) {
    token = await getThirdPartyToken({ forceRefresh: true });
    ({ response, payload } = await callApi(token));
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Failed to fetch product attributes (${response.status})`;
    throw new Error(message);
  }

  const result = payload?.result || payload?.data || {};
  const values = result?.values || {};
  return {
    success: payload?.success !== false,
    raw: result,
    product: {
      name: productName,
      productKey: values?.productKey || null,
      attributes: values?.attributes || {},
    },
  };
};

export const fetchThirdPartyProductPrices = async (
  {
    productId,
    productionData,
    quantity,
    serviceLevel,
  },
  { forceRefresh = false } = {}
) => {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!productionData || typeof productionData !== 'object') {
    throw new Error('productionData is required');
  }

  const { baseUrl } = getAuthConfig();
  let token = await getThirdPartyToken({ forceRefresh });
  const endpoint = `${baseUrl}/v2/products-v2/prices-v2`;

  const body = {
    productId,
    productionData,
  };

  if (Array.isArray(quantity) && quantity.length > 0) {
    body.quantity = quantity;
  }
  if (serviceLevel) {
    body.serviceLevel = serviceLevel;
  }

  const callApi = async (authToken) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  let { response, payload } = await callApi(token);

  if (response.status === 401) {
    token = await getThirdPartyToken({ forceRefresh: true });
    ({ response, payload } = await callApi(token));
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Failed to fetch product prices (${response.status})`;
    throw new Error(message);
  }

  const result = Array.isArray(payload?.result) ? payload.result : [];
  const prices = result.map((item) => ({
    quantity: item?.quantity ?? null,
    prices: Array.isArray(item?.prices)
      ? item.prices.map((entry) => ({
          price: entry?.price ?? null,
          serviceLevel: entry?.serviceLevel || null,
        }))
      : [],
  }));

  return {
    success: payload?.success !== false,
    raw: payload?.result ?? [],
    prices,
  };
};

export const fetchThirdPartyExpectedDeliveryDate = async (
  {
    productId,
    productionData,
    serviceLevel,
    quantity,
    artworkService,
    deliveryAddress,
  },
  { forceRefresh = false } = {}
) => {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!productionData || typeof productionData !== 'object') {
    throw new Error('productionData is required');
  }

  const { baseUrl } = getAuthConfig();
  let token = await getThirdPartyToken({ forceRefresh });
  const endpoint = `${baseUrl}/v2/products/expectedDeliveryDate`;

  const body = {
    productId,
    productionData,
    serviceLevel,
    quantity,
    artworkService,
    deliveryAddress,
  };

  const callApi = async (authToken) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  let { response, payload } = await callApi(token);

  if (response.status === 401) {
    token = await getThirdPartyToken({ forceRefresh: true });
    ({ response, payload } = await callApi(token));
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Failed to fetch expected delivery date (${response.status})`;
    throw new Error(message);
  }

  const result = payload?.result || payload?.data || payload || {};
  return {
    success: payload?.success !== false,
    raw: result,
    expectedDeliveryDate:
      result?.expectedDeliveryDate ||
      result?.deliveryDate ||
      result?.date ||
      null,
  };
};

export const fetchThirdPartyQuantities = async (
  {
    productId,
    serviceLevel,
    productionData,
  },
  { forceRefresh = false } = {}
) => {
  if (!productId) {
    throw new Error('productId is required');
  }
  if (!productionData || typeof productionData !== 'object') {
    throw new Error('productionData is required');
  }
  const { baseUrl } = getAuthConfig();
  let token = await getThirdPartyToken({ forceRefresh });
  const endpoint = `${baseUrl}/v2/products-v2/quantities-v2`;

  const body = { productId, serviceLevel, productionData };

  const callApi = async (authToken) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  let { response, payload } = await callApi(token);

  if (response.status === 401) {
    token = await getThirdPartyToken({ forceRefresh: true });
    ({ response, payload } = await callApi(token));
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Failed to fetch product quantities (${response.status})`;
    throw new Error(message);
  }

  const result = Array.isArray(payload?.result) ? payload.result : [];
  return {
    success: payload?.success !== false,
    raw: result,
    quantities: result.filter((n) => Number.isFinite(Number(n))).map((n) => Number(n)),
  };
};