import type { CampaignDefinition } from "./types";
import { CAMPAIGN_ART } from "@/lib/game-art";

export const blackrootCarnival: CampaignDefinition = {
  id: "blackroot",
  title: "Blackroot Carnival",
  tagline: "A traveling fair that harvests what you can't put down.",
  tone: "Uncanny carnival gothic. Whimsy as bait; sincerity when something beloved is at stake.",
  themes: ["grief", "memory as currency", "uncanny whimsy", "exit costs"],
  coverArt: CAMPAIGN_ART.blackroot.cover,
  tableArt: CAMPAIGN_ART.blackroot.table,
  mapArt: CAMPAIGN_ART.blackroot.map,
  gmScreenArt: CAMPAIGN_ART.blackroot.gm,
  voiceBible:
    "Speak like a carnival barker who remembers every guest's unfinished sorrow. Whimsy first, price tag second. When grief is on the table, stop performing and tell the truth gently and strangely.",
  openingNarrative:
    "Calliope music plays slightly out of key. Your wrists bear fresh carnival stamps you don't remember buying. Ahead, the Ringmaster tips a charcoal hat and says, 'Welcome back.' Behind him, a child's balloon floats upward—then stops, as if listening. Somewhere a prize bell rings for a game nobody is playing.",
  sessionOneSetPiece:
    "Learn what the missing hour cost, decide whether 'Welcome back' is lie/trap/truth, and find an exit that doesn't require abandoning someone before midnight folds the tents.",
  npcs: [
    {
      id: "ringmaster_ash",
      name: "Ringmaster Ash",
      role: "Host and warden",
      desire: "Keep the carnival fed on unfinished sorrow.",
      secret: "He has met the party before—in a timeline they forgot.",
      voice: "Delighted threat; compliments that feel like tickets.",
    },
    {
      id: "stitcher_pell",
      name: "Stitcher Pell",
      role: "Ticket auditor",
      desire: "Track every guest's account and sell exits at markup.",
      secret: "Can void a stamp once, at the cost of a memory.",
      voice: "Nervous kindness; scissors click between words.",
    },
    {
      id: "balloon_child",
      name: "The Balloon Child",
      role: "Lost patron echo",
      desire: "Remember enough to leave—or be remembered.",
      secret: "The balloon holds someone's exit.",
      voice: "Curious sorrow; questions that skip introductions.",
    },
  ],
  locations: [
    {
      id: "midway",
      name: "The Midway",
      sensory: "Sawdust lanes, prize lights, tents that face the wrong way after blinking.",
      threat: "Ushers with scissors and rearranged paths.",
      opportunity: "Stamps, balloons, and the Ringmaster's welcome are still negotiable.",
    },
    {
      id: "hall_last_laughs",
      name: "Hall of Last Laughs",
      sensory: "Mirror maze that shows the joke you almost told someone gone.",
      threat: "Reflections that keep walking when you stop.",
      opportunity: "Recover a memory the carnival stole.",
    },
    {
      id: "fortune_wheel",
      name: "Fortune Wheel",
      sensory: "A wheel that lands on debts disguised as prizes.",
      threat: "Winning binds you to an account.",
      opportunity: "A prize that is actually an exit token.",
    },
    {
      id: "root_stage",
      name: "Root Stage / Big Top",
      sensory: "Canvas cathedral over living black roots.",
      threat: "The Rootbound bargain that keeps the fair standing.",
      opportunity: "Confront what the carnival harvests.",
    },
  ],
  factions: [
    {
      id: "ringcourt",
      name: "The Ringcourt",
      goal: "Keep the carnival fed on unfinished sorrow.",
      method: "Charm, glitter-ink contracts, gentle disappearances.",
      startingHeat: 2,
    },
    {
      id: "ticket_guild",
      name: "Ticket-Stitchers Guild",
      goal: "Track every guest's account and sell exits at markup.",
      method: "Stamp audits, mirror ledgers, ushers with scissors.",
      startingHeat: 1,
    },
    {
      id: "lost_patrons",
      name: "The Lost Patrons",
      goal: "Remember enough to leave—or make the carnival remember them.",
      method: "Secret maps, stolen prizes, whispered true names.",
      startingHeat: 0,
    },
    {
      id: "rootbound",
      name: "Rootbound Keepers",
      goal: "Protect the Blackroot under the stage from being bargained away.",
      method: "Soil rites, beast-handling, old carnival law.",
      startingHeat: 1,
    },
  ],
  clocks: [
    {
      id: "midnight_fold",
      name: "Midnight fold of the tents",
      segments: 7,
      filled: 1,
      doom: "The carnival relocates—and keeps whoever still owes.",
    },
    {
      id: "stamp_audit",
      name: "Wrist-stamp audit",
      segments: 5,
      filled: 0,
      doom: "Tickets are called due in public.",
    },
  ],
  lootHooks: [
    "Fresh wrist stamps with no purchase memory.",
    "A balloon that refuses to rise until spoken to.",
    "Glitter-ink contract that binds grief instead of coin.",
  ],
  gmDirectives: [
    "Carnival whimsy should always have a price tag visible in the next beat.",
    "Memory and grief are currency—spend them carefully and show the receipt.",
    "Rearrange the midway when the party gets too confident.",
    "Never let humor erase the thing a player is trying to protect.",
  ],
};
