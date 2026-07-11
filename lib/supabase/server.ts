import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type CachedClient = {
  url: string;
  serviceKey: string;
  client: SupabaseClient;
};

let cachedClient: CachedClient | null = null;

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
const retryableMethods = new Set(["GET", "HEAD"]);

function numericEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeoutMs = numericEnv("SUPABASE_FETCH_TIMEOUT_MS", 20000, 3000, 60000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
  }

  try {
    return await fetch(input, {
      ...init,
      keepalive: init?.keepalive ?? true,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}

async function resilientSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = requestMethod(input, init);
  const canRetry = retryableMethods.has(method);
  const retries = canRetry ? numericEnv("SUPABASE_FETCH_RETRY_COUNT", 2, 0, 5) : 0;
  const attempts = retries + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init);
      if (!canRetry || !retryableStatuses.has(response.status) || attempt === attempts - 1) return response;
    } catch (error) {
      lastError = error;
      if (!canRetry || attempt === attempts - 1) throw error;
    }

    await wait(150 * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error("Supabase 요청에 실패했습니다.");
}

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  if (cachedClient && cachedClient.url === url && cachedClient.serviceKey === serviceKey) {
    return cachedClient.client;
  }

  const client = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: resilientSupabaseFetch
    }
  });

  cachedClient = { url, serviceKey, client };
  return client;
}
