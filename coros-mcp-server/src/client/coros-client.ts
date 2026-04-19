export interface CorosRequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

export class CorosClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => Promise<string | null>,
  ) {}

  async request<T>(options: CorosRequestOptions): Promise<T> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error("AUTH_REQUIRED");
    }

    const response = await fetch(buildUrl(this.baseUrl, options.path, options.query), {
      method: options.method,
      headers: {
        accessToken: token,
        "Content-Type": "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    return (await response.json()) as T;
  }
}
