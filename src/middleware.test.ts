import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("middleware", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
  });

  it("returns 401 JSON for unauthenticated API requests", async () => {
    const req = new NextRequest("http://localhost/api/numbers/participants");
    const res = await middleware(req);

    assert.equal(res.status, 401);
    assert.equal(res.headers.get("location"), null);
    assert.match(await res.text(), /Unauthorized/);
  });
});
