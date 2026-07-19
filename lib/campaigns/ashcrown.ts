import type { CampaignDefinition } from "./types";

export const ashcrownRegency: CampaignDefinition = {
  id: "ashcrown",
  title: "Ashcrown Regency",
  tagline: "A capital where crowns crack and saints keep secrets.",
  tone: "Political intrigue laced with holy horror. Dry wit welcome; never undercut dread when a relic awakens.",
  themes: ["succession", "holy bureaucracy", "faction heat", "relic horror"],
  coverArt:
    "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
  tableArt:
    "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=2000&q=80",
  mapArt:
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80",
  gmScreenArt:
    "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=1200&q=80",
  voiceBible:
    "Speak like a capital chronicler: precise titles, ash-stained ceremony, miracles filed in triplicate. NPCs bargain in implications. When horror lands, drop the wit and describe the relic as if it notices the table.",
  openingNarrative:
    "Rain sifts ash onto the plaza. A sealed carriage has overturned beside the Cathedral steps—inside, a dead courier still clutching a wax seal stamped with three crowns. Distant bells argue over which saint gets the hour. The crowd parts for you because nobody else wants the blame.",
  sessionOneSetPiece:
    "Identify the courier without alerting the Cathedral, decide the fate of the triple-crown seal, and survive the first inquisitorial interview while faction heat shifts.",
  npcs: [
    {
      id: "sister_vale",
      name: "Sister Vale",
      role: "Relic auditor",
      desire: "Control the interpretation of the vacant throne as a divine trial.",
      secret: "She already knows whose blood opened the courier's seal.",
      voice: "Polite steel; short sentences that feel like citations.",
    },
    {
      id: "lord_bren",
      name: "Lord Bren Ash-Keel",
      role: "Regent claimant",
      desire: "Be crowned before the city burns into a republic.",
      secret: "His claim depends on a forged baptismal ledger.",
      voice: "Charming exhaustion; compliments that double as leverage.",
    },
    {
      id: "masker_nine",
      name: "Masker Nine",
      role: "Ashvein broker",
      desire: "Sell the succession to the highest bidder.",
      secret: "Sells the same secret to three factions at once.",
      voice: "Friendly threat; jokes with invoices attached.",
    },
  ],
  locations: [
    {
      id: "cathedral_steps",
      name: "Cathedral Steps",
      sensory: "Black marble under ash-rain; pilgrims and pickpockets share umbrellas.",
      threat: "Inquisitors watching who touches the carriage.",
      opportunity: "The seal and courier identity are still unclaimed.",
    },
    {
      id: "embercourt_gallery",
      name: "Embercourt Gallery",
      sensory: "Portrait hall where dead kings watch living negotiations.",
      threat: "Regents who smile while arranging disappearances.",
      opportunity: "Marriage contracts and bribes change heat fast.",
    },
    {
      id: "cinder_crypts",
      name: "Cinder Crypts",
      sensory: "Under-cathedral vaults where failed saints are filed by scent.",
      threat: "Relics that awaken when mishandled.",
      opportunity: "Proof that can crown—or damn—a claimant.",
    },
    {
      id: "stacks_market",
      name: "Stacks Night Market",
      sensory: "Cliffside stalls selling heat, rumor, and illegal incense.",
      threat: "Syndicate levies and forged seals.",
      opportunity: "Buy silence, or sell the wrong truth.",
    },
  ],
  factions: [
    {
      id: "embercourt",
      name: "The Embercourt Regents",
      goal: "Crown a controllable successor before the city burns itself into republic.",
      method: "Bribes, marriage contracts, quiet disappearances.",
      startingHeat: 1,
    },
    {
      id: "cathedral",
      name: "Cathedral of Ember-Law",
      goal: "Prove the vacant throne is a divine trial—and own the interpretation.",
      method: "Public rites, relic audits, inquisitorial visits.",
      startingHeat: 2,
    },
    {
      id: "ashvein",
      name: "Ashvein Syndicate",
      goal: "Sell the succession while the lights stay on.",
      method: "Smuggling, forged seals, street levies.",
      startingHeat: 1,
    },
    {
      id: "mirrorlake",
      name: "Mirrorlake Embassy Circle",
      goal: "Keep foreign interests solvent if Ashcrown collapses.",
      method: "Spies with perfect manners, gift-knives, trade leverage.",
      startingHeat: 0,
    },
  ],
  clocks: [
    {
      id: "succession_vote",
      name: "Regency succession vote",
      segments: 8,
      filled: 1,
      doom: "A claimant is crowned—or the city riots.",
    },
    {
      id: "relic_audit",
      name: "Cathedral relic audit",
      segments: 6,
      filled: 0,
      doom: "The party is formally named in a miracle investigation.",
    },
  ],
  lootHooks: [
    "Triple-crown wax seal still warm with someone else's blood.",
    "Baptismal ledger page that shouldn't exist.",
    "Illegal incense that makes saints answer questions.",
  ],
  gmDirectives: [
    "Track faction heat: helpful acts cool one faction and often heat another.",
    "Miracles should feel bureaucratic—forms, witnesses, consequences.",
    "When a relic is mishandled, escalate holy horror before combat.",
    "Politics first: violence is always available and always expensive.",
  ],
};
