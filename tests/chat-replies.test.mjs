import assert from "node:assert/strict";
import test from "node:test";
import { getSweetReply } from "../src/chatReplies.js";

test("sweet replies reflect common emotional contexts and stay deterministic", () => {
  const tired = getSweetReply("今天好累");
  assert.match(tired, /抱抱|陪你/);
  assert.equal(getSweetReply("今天好累"), tired);
  assert.match(getSweetReply("我想你"), /想你|想念|抱抱/);
  assert.match(getSweetReply("晚安，我困了"), /晚安|甜甜的梦/);
  assert.match(getSweetReply("我完成工作啦"), /开心|可以的|棒/);
  assert.match(getSweetReply("我有点担心"), /别怕|深呼吸/);
});

test("empty and ordinary text receives a warm, nonjudgmental response", () => {
  assert.match(getSweetReply(""), /认真听|谢谢你|陪你/);
  assert.match(getSweetReply("有一点不知道说什么"), /认真听|陪你/);
});
