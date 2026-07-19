/**
 * Bot simulation — pure-logic paths for dice, protocol, buddy, vault, memory.
 * Run: npx tsx scripts/sim-table-bots.ts
 */
import assert from 'node:assert/strict';
import {
  extractGmProtocol,
  mergeProtocolIntoVault,
} from '../lib/gm-protocol';
import {
  gradeRollOutcome,
  isRollCommand,
  parseRollExpression,
  resolveRoll,
  rollBindsPendingCheck,
  naturalD20Face,
} from '../lib/table-fun';
import { parseBuddyCommand } from '../lib/buddy-gm';
import {
  emptyVaultRoomState,
  readVaultRoom,
  writeVaultRoom,
} from '../lib/vault';
import {
  emptyArbiterMemory,
  mergeMemoryPatch,
  readArbiterMemory,
  writeArbiterMemory,
} from '../lib/arbiter-memory';
import { parseCampaignState } from '../lib/campaigns/types';
import { sheetFromSnapshot } from '../lib/character-sheet';

function sim(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

sim('annotated roll parses DC/label', () => {
  const parsed = parseRollExpression('/roll 1d20+5 (DEX · Stealth · DC 14)');
  assert.ok(parsed);
  assert.equal(parsed!.dc, 14);
  assert.ok(parsed!.ability);
  assert.ok(isRollCommand('/roll 1d20+5 (DEX · Stealth · DC 14)'));
});

sim('bare damage does not bind pending check', () => {
  const parsed = parseRollExpression('/roll 2d6');
  assert.ok(parsed);
  const result = { ...resolveRoll(parsed!), note: undefined, dc: undefined, label: undefined };
  assert.equal(rollBindsPendingCheck(result), false);
});

sim('annotated check binds pending', () => {
  const parsed = parseRollExpression('/roll 1d20+3 (WIS · Insight · DC 12)');
  assert.ok(parsed);
  const result = resolveRoll(parsed!);
  assert.equal(rollBindsPendingCheck(result), true);
});

sim('1d8 natural 1 is not a crit fail', () => {
  // Force by constructing a RollResult
  const fake = {
    expression: '1d8',
    rolls: [1],
    modifier: 0,
    total: 1,
    detail: '1d8[1]',
  };
  assert.equal(naturalD20Face(fake), undefined);
  assert.equal(gradeRollOutcome(fake).outcome, 'plain');
});

sim('1d20 natural 20 is crit success', () => {
  const fake = {
    expression: '1d20+5',
    rolls: [20],
    modifier: 5,
    total: 25,
    detail: '1d20[20] +5',
    dc: 14,
  };
  assert.equal(naturalD20Face(fake), 20);
  assert.equal(gradeRollOutcome(fake, 14).outcome, 'crit_success');
});

sim('grade vs DC success/fail', () => {
  const ok = gradeRollOutcome(
    { expression: '1d20', rolls: [12], modifier: 0, total: 12, detail: '1d20[12]' },
    12
  );
  assert.equal(ok.outcome, 'success');
  const fail = gradeRollOutcome(
    { expression: '1d20', rolls: [5], modifier: 0, total: 5, detail: '1d20[5]' },
    12
  );
  assert.equal(fail.outcome, 'fail');
});

sim('buddy short serious ask is ask not banter', () => {
  const b = parseBuddyCommand('/gm what is heat?');
  assert.ok(b);
  assert.equal(b!.kind, 'ask');
});

sim('buddy help keywords', () => {
  const b = parseBuddyCommand('/gm what is my stealth modifier');
  assert.ok(b);
  assert.equal(b!.kind, 'help');
});

sim('protocol strips MEMORY and STATE', () => {
  const raw = `The door groans.
<<<STATE
{"flags":{"door_open":true},"lastConsequence":"Door opens."}
STATE>>>
<<<MEMORY
{"highlight":{"title":"Door Kick","detail":"Edward kicked it","who":"Edward"},"spine":["Door open"]}
MEMORY>>>
<<<CHECKS
[{"id":"c1","ability":"dexterity","dc":13,"label":"Slip past"}]
CHECKS>>>`;
  const p = extractGmProtocol(raw);
  assert.ok(p.cleanReply.includes('door'));
  assert.ok(!p.cleanReply.includes('<<<'));
  assert.ok(p.statePatch?.flags);
  assert.ok(p.memory?.highlight);
  assert.equal(p.checks?.[0]?.dc, 13);
});

sim('buddy vault merge still works for play mode', () => {
  const room = emptyVaultRoomState();
  const next = mergeProtocolIntoVault(room, {
    cleanReply: 'x',
    statePatch: null,
    beats: [{ id: 'b1', label: 'Charge' }],
    checks: null,
    harm: null,
    loot: null,
    titleCard: null,
    clashStart: null,
    clashEnd: false,
    memory: null,
  });
  assert.equal(next.pendingBeats.length, 1);
});

sim('vault pendingChecks default ability', () => {
  const data = writeVaultRoom({}, {
    pendingChecks: [{ id: 'x', ability: '', dc: 10, label: 'Test' } as never],
  });
  // write then read through raw malformation
  const raw = {
    vault: {
      pendingBeats: [],
      pendingChecks: [{ id: 'x', label: 'Test' }],
      chapters: [],
      clash: { active: false, combatants: [] },
      titleCard: null,
      hostSkipArbiter: false,
    },
  };
  const room = readVaultRoom(raw);
  assert.equal(room.pendingChecks[0].ability, 'dexterity');
  assert.ok(room.pendingChecks[0].ability.slice(0, 3));
  void data;
});

sim('malformed clocks do not crash parse', () => {
  const state = parseCampaignState({
    campaignId: 'ashcrown',
    clocks: { bad: 'nope', good: { name: 'Doom', filled: 1, segments: 4 } },
  });
  assert.ok(state);
  assert.equal(state!.clocks.bad, undefined);
  assert.equal(state!.clocks.good.filled, 1);
});

sim('sheetFromSnapshot restores seat', () => {
  const sheet = sheetFromSnapshot({
    seed: 'VL-TEST-1234',
    name: 'Aden',
    templateId: 't1',
    race: 'Human',
    className: 'Fighter',
    level: 2,
    stats: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 11, CHA: 8 },
    skills: ['Athletics'],
    features: ['Second Wind'],
    equipment: ['Sword'],
    maxHp: 20,
    armorClass: 16,
    speed: 30,
  });
  assert.ok(sheet);
  assert.equal(sheet!.name, 'Aden');
  assert.equal(sheet!.maxHp, 20);
});

sim('memory highlight gets id', () => {
  const mem = mergeMemoryPatch(emptyArbiterMemory(), {
    highlight: { title: 'Epic', detail: 'Wow', who: 'Jamie' },
  });
  const written = writeArbiterMemory({}, mem);
  const read = readArbiterMemory(written);
  assert.ok(read.highlights[0].id);
});

console.log('\nAll bot simulations passed.');
