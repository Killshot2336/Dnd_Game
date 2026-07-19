import type { CampaignDefinition } from "./types";

export const saltwakeBargain: CampaignDefinition = {
  id: "saltwake",
  title: "Saltwake Bargain",
  tagline: "A port that collects debts in tide and bone.",
  tone: "Coastal noir with folk-horror undertow. Humor like a dockside joke that stops too soon.",
  themes: ["debt", "tide clocks", "folk horror", "harbor noir"],
  coverArt:
    "https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=1600&q=80",
  tableArt:
    "https://images.unsplash.com/photo-1439405326854-014607f694d7?auto=format&fit=crop&w=2000&q=80",
  mapArt:
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
  gmScreenArt:
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=80",
  voiceBible:
    "Speak like a harbor notary who has seen drownings filed as paperwork. Fog, rope, and unpaid favors. When the deep bargains surface, drop noir cool and describe the tide as if it is collecting personally.",
  openingNarrative:
    "Fog hangs low enough to taste. A Harbor Bailiff nails a parchment to the mast of your berth: DEBT CALLED — PARTY NAMED. Behind him, the tide is already climbing the pier stairs in neat, unnatural steps. A ferryman grins without teeth and offers a cheaper crossing—if you'll take a passenger who isn't breathing yet.",
  sessionOneSetPiece:
    "Learn whose hand wrote your names in the Tide-Ledger, choose pay/fight/rewrite, and decide what to do with the not-yet-breathing passenger before the equinox flood advances.",
  npcs: [
    {
      id: "bailiff_korra",
      name: "Bailiff Korra",
      role: "Debt collector",
      desire: "Collect every Tide-Ledger debt before the equinox flood.",
      secret: "She forged the party's names to force a larger settlement.",
      voice: "Professional mercy; receipts spoken aloud.",
    },
    {
      id: "cantor_moth",
      name: "Cantor Moth",
      role: "Brinechapel singer",
      desire: "Feed the deep bargains so the harbor keeps existing.",
      secret: "Knows which passenger on the pier isn't dead yet.",
      voice: "Soft-spoken hunger; hymns between sentences.",
    },
    {
      id: "captain_reel",
      name: "Captain Reel",
      role: "Smuggler skipper",
      desire: "Move cargo the Ledger shouldn't see—and free his ship.",
      secret: "His ship is collateral on the same debt.",
      voice: "Laughing panic; jokes that check exits.",
    },
  ],
  locations: [
    {
      id: "quays",
      name: "The Quays",
      sensory: "Wet planks, lantern crabs, debts posted like wanted posters.",
      threat: "Public naming and ship seizures.",
      opportunity: "The passenger offer and forged names are still negotiable.",
    },
    {
      id: "ledger_hall",
      name: "Ledger Hall",
      sensory: "A courthouse that smells of ink and low tide.",
      threat: "Brine-sealed summons that bind in public.",
      opportunity: "Rewrite a bargain if you bring the right witness.",
    },
    {
      id: "brinechapel",
      name: "Brinechapel",
      sensory: "Salt-stained pews facing a drowned altar window.",
      threat: "Voluntary drownings dressed as devotion.",
      opportunity: "Choir knowledge of who wrote the ledger line.",
    },
    {
      id: "drowned_shelf",
      name: "The Drowned Shelf",
      sensory: "Tidal caves where bargains echo longer than voices.",
      threat: "The deep collecting what paperwork promised.",
      opportunity: "Evidence the Ledger was rewritten by human hands.",
    },
  ],
  factions: [
    {
      id: "harbor_bailiffs",
      name: "Harbor Bailiffs",
      goal: "Collect every Tide-Ledger debt before the equinox flood.",
      method: "Public naming, ship seizures, brine-branded summons.",
      startingHeat: 2,
    },
    {
      id: "brinechapel",
      name: "Brinechapel Choir",
      goal: "Feed the deep bargains so the harbor keeps existing.",
      method: "Midnight hymns, salt rites, voluntary drownings.",
      startingHeat: 1,
    },
    {
      id: "quay_smugglers",
      name: "Quay Smugglers' Compact",
      goal: "Move cargo that the Ledger shouldn't see.",
      method: "False manifests, fog signals, paid silence.",
      startingHeat: 1,
    },
    {
      id: "tide_widows",
      name: "Tide Widows",
      goal: "Recover what the sea took—or make someone else pay.",
      method: "Mourning contracts, blackmail with love letters, rope justice.",
      startingHeat: 0,
    },
  ],
  clocks: [
    {
      id: "equinox_flood",
      name: "Equinox flood",
      segments: 8,
      filled: 2,
      doom: "The harbor drowns unpaid debts—and debtors.",
    },
    {
      id: "ledger_hearing",
      name: "Formal Ledger hearing",
      segments: 5,
      filled: 1,
      doom: "The party is bound by a public brine-seal.",
    },
  ],
  lootHooks: [
    "Tide-Ledger page with the party's names in a stranger's hand.",
    "Toothless ferryman's crossing token.",
    "Brine-branded summons that can be redirected once.",
  ],
  gmDirectives: [
    "The tide is a clock and a character—advance it when bargains stall.",
    "Debts should mutate: paying one often births another with teeth.",
    "Keep noir pressure: fog, witnesses, and favors that smell like traps.",
    "Folk horror surfaces when the Ledger is treated like mere paperwork.",
  ],
};
