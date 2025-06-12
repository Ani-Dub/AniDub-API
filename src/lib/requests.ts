import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

const DEFAULT_RETRY_AFTER_MS = 1000;
const MAX_RETRIES = 3;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRateLimitRetry = async <T>(
  fn: () => Promise<AxiosResponse<T>>,
  retriesLeft: number = MAX_RETRIES
): Promise<AxiosResponse<T>> => {
  const response = await fn();

  if (response.status !== 429) return response;

  if (retriesLeft <= 0) {
    throw new Error("Too many retries after hitting rate limit.");
  }

  const resetTimeHeader = response.headers["x-ratelimit-reset"];

  if (!resetTimeHeader) {
    const retryAfterHeader = response.headers["retry-after"];

    if (retryAfterHeader) {
      const retryAfterMs = parseInt(retryAfterHeader, 10) * 1000;
      console.warn(`Rate limit hit. Retrying in ${retryAfterMs}ms...`);
      await delay(retryAfterMs);
      return withRateLimitRetry(fn, retriesLeft - 1);
    }
  }

  const retryAfterMs = resetTimeHeader
    ? Math.max(
        new Date(parseInt(resetTimeHeader, 10) * 1000).getTime() - Date.now(),
        DEFAULT_RETRY_AFTER_MS
      )
    : DEFAULT_RETRY_AFTER_MS;

  console.warn(`Rate limit hit. Retrying in ${retryAfterMs}ms...`);

  await delay(retryAfterMs);
  return withRateLimitRetry(fn, retriesLeft - 1);
};

export const repeatablePOSTRequest = async <T>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig<T>
): Promise<AxiosResponse<T>> => {
  return withRateLimitRetry(() => axios.post<T>(url, data, config));
};

export const repeatableGETRequest = async <T>(
  url: string,
  config?: AxiosRequestConfig<T>
): Promise<AxiosResponse<T>> => {
  return withRateLimitRetry(() => axios.get<T>(url, config));
};
