const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function readBodyLimited(req: Request, maxBytes: number): Promise<ArrayBuffer | Response> {
  const cl = req.headers.get("content-length");
  if (cl !== null) {
    const n = Number.parseInt(cl, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      return jsonResponse(413, {
        error: "payload_too_large",
        message: `Body exceeds STEVEDORE_REQUEST_BODY_MAX_BYTES (${maxBytes})`,
      });
    }
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) {
    return jsonResponse(413, {
      error: "payload_too_large",
      message: `Body exceeds STEVEDORE_REQUEST_BODY_MAX_BYTES (${maxBytes})`,
    });
  }
  return buf;
}
