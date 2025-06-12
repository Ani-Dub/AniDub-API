import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import PQueue from "p-queue";
import { URL } from "url";
import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } from "../config";

const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRIES = 3;

// Delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Domain queue management
const domainQueues = new Map<string, PQueue>();

function getDomainQueue(domain: string): PQueue {
  if (!domainQueues.has(domain)) {
    domainQueues.set(domain, new PQueue({ concurrency: 2 }));
  }
  return domainQueues.get(domain)!;
}

// Queue requests per domain
async function queueByDomain<T>(
  url: string,
  fn: () => Promise<T>
): Promise<T | void> {
  const domain = new URL(url).hostname;
  const queue = getDomainQueue(domain);
  return queue.add(fn);
}

// Retry wrapper for handling 429 rate limits
async function withRateLimitRetry<T>(
  fn: () => Promise<AxiosResponse<T>>,
  retriesLeft: number = MAX_RETRIES,
  url?: string
): Promise<AxiosResponse<T>> {
  const execute = url ? () => queueByDomain(url, fn) : fn;
  const response = await execute();

  if (!response) {
    throw new Error("Request failed without a response.");
  }

  if (response.status !== 429) {
    return response;
  }

  if (retriesLeft <= 0) {
    throw new Error("Too many retries after hitting rate limit.");
  }

  const retryAfterHeader = response.headers["retry-after"];
  const resetTimeHeader = response.headers["x-ratelimit-reset"];

  let retryAfterMs = DEFAULT_RETRY_AFTER_MS;

  if (retryAfterHeader) {
    retryAfterMs = parseInt(retryAfterHeader, 10) * 1000;
  } else if (resetTimeHeader) {
    const resetTimestamp = parseInt(resetTimeHeader, 10) * 1000;
    retryAfterMs = Math.max(
      resetTimestamp - Date.now(),
      DEFAULT_RETRY_AFTER_MS
    );
  }

  console.warn(`Rate limit hit. Retrying in ${retryAfterMs}ms...`);
  await delay(retryAfterMs);

  return withRateLimitRetry(fn, retriesLeft - 1, url);
}

// Exported utility for POST with retries
export async function repeatablePOSTRequest<T>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig<T>
): Promise<AxiosResponse<T>> {
  return withRateLimitRetry(
    () => axios.post<T>(url, data, config),
    MAX_RETRIES,
    url
  );
}

// Exported utility for GET with retries
export async function repeatableGETRequest<T>(
  url: string,
  config?: AxiosRequestConfig<T>
): Promise<AxiosResponse<T>> {
  return withRateLimitRetry(() => axios.get<T>(url, config), MAX_RETRIES, url);
}

// Centralized token refresh function
export const refreshAccessToken = async (refreshToken: string) => {
  return axios.post("https://anilist.co/api/v2/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    redirect_uri: REDIRECT_URL,
  });
};
