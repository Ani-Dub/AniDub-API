import axios, { AxiosResponse, AxiosRequestConfig } from "axios";

export const repeatablePOSTRequest = async <T>(url: string, data?: any, config?: AxiosRequestConfig<T>): Promise<AxiosResponse<T>> => {
  const response = await axios.post<T>(url, data, config);

  // Ratelimit hit. Wait for the retry time and try again.
  if (response.status === 429) {
    const retryAfterTimestamp = response.headers["x-ratelimit-reset"];

    let retryAfter = new Date(parseInt(retryAfterTimestamp) * 1000).getTime() - Date.now();

    if (retryAfterTimestamp === undefined) {
      // If the header is not present, use a default value of 1 second
      retryAfter = 1000;
    }

    console.log(`Ratelimit hit. Waiting for ${retryAfter}ms...`);

    await new Promise((resolve) => setTimeout(resolve, retryAfter));
    return repeatablePOSTRequest(url, data, config);
  }
  return response;
}

export const repeatableGETRequest = async <T>(url: string, config?: AxiosRequestConfig<T>): Promise<AxiosResponse<T>> => {
  const response = await axios.get<T>(url, config);

  // Ratelimit hit. Wait for the retry time and try again.
  if (response.status === 429) {
    const retryAfterTimestamp = response.headers["x-ratelimit-reset"];

    let retryAfter = new Date(parseInt(retryAfterTimestamp) * 1000).getTime() - Date.now();

    if (retryAfterTimestamp === undefined) {
      // If the header is not present, use a default value of 1 second
      retryAfter = 1000;
    }

    console.log(`Ratelimit hit. Waiting for ${retryAfter}ms...`);

    await new Promise((resolve) => setTimeout(resolve, retryAfter));
    return repeatableGETRequest(url, config);
  }
  return response;
}