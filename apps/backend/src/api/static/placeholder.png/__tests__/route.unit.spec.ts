import { describe, expect, it, vi } from "vitest";
import { GET } from "../route";

describe("GET /static/placeholder.png", () => {
  it("serves the deployed placeholder image with its actual PNG content type", async () => {
    const headers: Record<string, string | number> = {};
    const response = {
      setHeader: vi.fn((name: string, value: string | number) => {
        headers[name] = value;
      }),
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };

    await GET({} as never, response as never);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith(expect.any(Buffer));
    expect((response.send.mock.calls[0][0] as Buffer).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(headers["Content-Type"]).toBe("image/png");
    expect(headers["Content-Length"]).toBe(
      (response.send.mock.calls[0][0] as Buffer).byteLength,
    );
  });
});
