import { describe, expect, test } from "bun:test";
import { readBodyLimited } from "./body-limit";

describe("readBodyLimited", () => {
  test("rejects when Content-Length exceeds max without reading a huge body", async () => {
    const req = new Request("http://localhost/hook", {
      method: "POST",
      headers: { "content-length": "10000" },
    });
    const out = await readBodyLimited(req, 64);
    expect(out).toBeInstanceOf(Response);
    const res = out as Response;
    expect(res.status).toBe(413);
  });

  test("accepts body under max", async () => {
    const req = new Request("http://localhost/hook", {
      method: "POST",
      body: '{"x":1}',
    });
    const out = await readBodyLimited(req, 64);
    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(out as ArrayBuffer)).toBe('{"x":1}');
  });

  test("rejects when actual body exceeds max (no Content-Length)", async () => {
    const req = new Request("http://localhost/hook", {
      method: "POST",
      body: "0123456789",
    });
    const out = await readBodyLimited(req, 5);
    expect(out).toBeInstanceOf(Response);
    expect((out as Response).status).toBe(413);
  });
});
