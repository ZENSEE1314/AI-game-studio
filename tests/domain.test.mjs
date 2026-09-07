import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { seed } from "../src/data.ts";
import {
  beginEncounter,
  resolveTurn,
  awardCompanion,
} from "../src/encounter.ts";

test("all shipped creature data matches the public schema", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../schemas/monster.schema.json", import.meta.url),
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );
  const validate = new Ajv2020().compile(schema);
  for (const monster of seed.monsters)
    assert.ok(validate(monster), JSON.stringify(validate.errors));
  assert.equal(
    new Set(seed.monsters.map((m) => m.id)).size,
    seed.monsters.length,
  );
});
test("starter encounters finish at the specified balance points", () => {
  for (const [id, turns, energy] of [
    ["mossling", 5, 28],
    ["emberfox", 4, 28],
    ["ripplefin", 5, 40],
  ]) {
    const monster = seed.monsters.find((m) => m.id === id);
    let state = beginEncounter(monster);
    for (let i = 0; i < 10 && state.running; i++)
      state = resolveTurn(state, monster);
    assert.equal(state.hp, 0);
    assert.equal(state.turn, turns);
    assert.equal(state.energy, energy);
    assert.equal(state.running, false);
    assert.deepEqual(
      resolveTurn(state, monster),
      state,
      "finished encounters ignore repeated input",
    );
  }
});
test("defeat grants no implicit victory and restart resets encounter", () => {
  const monster = { ...seed.monsters[0], hp: 200, attack: 50 };
  let state = resolveTurn(
    resolveTurn(beginEncounter(monster), monster),
    monster,
  );
  assert.equal(state.energy, 0);
  assert.equal(state.hp, 156);
  assert.equal(state.running, false);
  assert.match(state.message, /ran out/);
  state = beginEncounter(monster);
  assert.equal(state.energy, 100);
  assert.equal(state.hp, 200);
  assert.equal(state.turn, 0);
});
test("final hit suppresses counterattack even at low player energy", () => {
  const monster = seed.monsters[0];
  const state = resolveTurn(
    { ...beginEncounter(monster), hp: 1, energy: 1 },
    monster,
  );
  assert.equal(state.hp, 0);
  assert.equal(state.energy, 1);
});
test("repeated wins cannot duplicate collection entries", () => {
  assert.deepEqual(awardCompanion(awardCompanion([], "mossling"), "mossling"), [
    "mossling",
  ]);
});
