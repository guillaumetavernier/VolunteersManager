export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJSON(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body, `${res.status} ${res.statusText}`);
  }
  return body as T;
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
