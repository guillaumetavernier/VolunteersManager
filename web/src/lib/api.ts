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
  // Only set application/json when the caller didn't pre-set a header AND the
  // body isn't a structured form (FormData/URLSearchParams/Blob). The browser
  // needs to set the multipart Content-Type with its own boundary; forcing
  // application/json there silently breaks file uploads (HTTP 413 / 422).
  if (init.body && !headers.has("Content-Type") && !isFormBody(init.body)) {
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

function isFormBody(body: BodyInit | null | undefined): boolean {
  return (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  );
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
