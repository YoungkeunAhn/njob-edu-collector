import { afterEach, expect, test, vi } from "vitest";
import { fetchText } from "../../src/sources/util";

const reply = (status: number, body: string, headers: Record<string, string> = {}) =>
  (async () => new Response(body, { status, headers })) as unknown as typeof fetch;

test("004 T2·T3 HTTP 오류: 앞부분은 그대로, 서버·본문 앞부분을 붙인다(#2)", async () => {
  const html = `<!DOCTYPE HTML><html><head><title>403 Forbidden</title></head><body><h1>Forbidden</h1>${"x".repeat(500)}</body></html>`;
  const err = await fetchText(reply(403, html, { server: "Apache" }), "https://www.x.kr/a").catch((e: Error) => e.message);
  expect(err).toMatch(/^HTTP 403 www\.x\.kr /);
  expect(err).toContain("[server=Apache]");
  expect(err).toContain("403 Forbidden Forbidden");
  expect(err.length).toBeLessThan(200);
});

test("004 T2 본문을 못 읽어도 원래 오류는 남는다", async () => {
  const broken = (async () => ({ ok: false, status: 520, headers: new Headers(), text: () => Promise.reject(new Error("x")) })) as unknown as typeof fetch;
  await expect(fetchText(broken, "https://apply.x.net/b")).rejects.toThrow("HTTP 520 apply.x.net [server=-]");
});

test("성공이면 본문", async () => {
  expect(await fetchText(reply(200, "ok"), "https://www.x.kr/")).toBe("ok");
});

afterEach(() => vi.useRealTimers());

test("530/1016 일시 장애는 2초 뒤 재시도해 복구한다", async () => {
  vi.useFakeTimers();
  const f = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("error code: 1016", { status: 530 }))
    .mockResolvedValueOnce(new Response("ok"));
  const result = fetchText(f, "https://sesac.seoul.kr/", {}, 30_000, 2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(f).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe("ok");
  expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls[0]![1]!.signal).not.toBe(f.mock.calls[1]![1]!.signal);
});

test("지속되는 530은 2회까지만 재시도하고 마지막 진단을 남긴다", async () => {
  vi.useFakeTimers();
  const f = vi.fn(reply(530, "error code: 1016", { server: "cloudflare" }));
  const check = expect(fetchText(f, "https://sesac.seoul.kr/", {}, 30_000, 2))
    .rejects.toThrow("HTTP 530 sesac.seoul.kr [server=cloudflare] error code: 1016");
  await vi.advanceTimersByTimeAsync(5999);
  expect(f).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await check;
  expect(f).toHaveBeenCalledTimes(3);
});

test.each([new TypeError("fetch failed"), new DOMException("timed out", "TimeoutError")])("네트워크·시간 초과 재시도: %s", async (error) => {
  vi.useFakeTimers();
  const f = vi.fn<typeof fetch>().mockRejectedValueOnce(error).mockResolvedValueOnce(new Response("ok"));
  const result = fetchText(f, "https://sesac.seoul.kr/", {}, 30_000, 2);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBe("ok");
  expect(f).toHaveBeenCalledTimes(2);
});

test("본문 수신 중 네트워크 오류도 재시도한다", async () => {
  vi.useFakeTimers();
  const broken = new Response("partial");
  vi.spyOn(broken, "text").mockRejectedValue(new TypeError("connection lost"));
  const f = vi.fn<typeof fetch>().mockResolvedValueOnce(broken).mockResolvedValueOnce(new Response("complete"));
  const result = fetchText(f, "https://sesac.seoul.kr/", {}, 30_000, 2);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBe("complete");
});

test.each([401, 403, 404, 429])("HTTP %i는 재시도하지 않는다", async (status) => {
  const f = vi.fn(reply(status, "denied"));
  await expect(fetchText(f, "https://www.x.kr/", {}, 30_000, 2)).rejects.toThrow(`HTTP ${status}`);
  expect(f).toHaveBeenCalledTimes(1);
});

test("POST와 기존 호출은 재시도하지 않는다", async () => {
  const f = vi.fn(reply(503, "unavailable"));
  await expect(fetchText(f, "https://www.x.kr/", { method: "POST" }, 30_000, 2)).rejects.toThrow("HTTP 503");
  expect(f).toHaveBeenCalledTimes(1);
  f.mockClear();
  await expect(fetchText(f, "https://www.x.kr/")).rejects.toThrow("HTTP 503");
  expect(f).toHaveBeenCalledTimes(1);
});
