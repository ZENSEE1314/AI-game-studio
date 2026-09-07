export type Monster = {
  id: string;
  name: string;
  element: string;
  hp: number;
  attack: number;
  lore: string;
  status: string;
};
export type Task = { id: string; title: string; lane: string; owner: string };
export const seed = {
  title: "Echobound",
  monsters: [
    {
      id: "mossling",
      name: "Mossling",
      element: "Nature",
      hp: 90,
      attack: 18,
      lore: "A shy keeper of forgotten gardens. A new leaf grows whenever it makes a friend.",
      status: "Approved",
    },
    {
      id: "emberfox",
      name: "Emberfox",
      element: "Fire",
      hp: 75,
      attack: 24,
      lore: "Carries the warmth of a tiny sunrise in its tail. It guides travelers through the rain.",
      status: "Review",
    },
    {
      id: "ripplefin",
      name: "Ripplefin",
      element: "Water",
      hp: 110,
      attack: 15,
      lore: "Collects the songs that fall into still water and hums them beneath the moon.",
      status: "Draft",
    },
  ] as Monster[],
  tasks: [
    {
      id: "1",
      title: "Define the first grove encounter",
      lane: "In progress",
      owner: "Game designer",
    },
    {
      id: "2",
      title: "Review Emberfox silhouette",
      lane: "Review",
      owner: "Art director",
    },
    {
      id: "3",
      title: "Write chapter one dialogue",
      lane: "Backlog",
      owner: "Narrative designer",
    },
    {
      id: "4",
      title: "Prototype creature idle cycle",
      lane: "Backlog",
      owner: "Animator",
    },
  ] as Task[],
  bible:
    "# Echobound — Game Bible\n\nA world of little wonders, waiting just outside.\n\n## Vision\nAn original creature-collecting adventure about reconnecting people with the natural world. This is an editable sample concept.\n\n## Core loop\nExplore → discover → encounter → befriend → build a team → unlock a story.\n\n## Design pillars\nCuriosity over competition. Short sessions. Creatures with personality. Accessible exploration with a stationary alternative.\n\n## First playable\nThree creatures, one arena, deterministic turn-based combat and a local collection.\n\n## Economy\nEarn friendship through play. No paid random rewards.\n\n## Release gates\nPlayable loop, accessibility, device testing, backend authority, privacy review, store submission.",
  story:
    "# Story Bible\n\n## Premise\nThe world has grown quiet. Small spirits called Echoes hold its forgotten songs. You are a Listener, able to hear them again.\n\n## Chapter 01 — The Quiet Grove\nMeet Mossling beneath an old lantern tree. Recover its lost seed and discover that the forest is remembering.\n\n## Chapter 02 — A Spark in the Rain\nFollow Emberfox through a storm to restore a village beacon.\n\n## Chapter 03 — Beneath Still Water\nRipplefin reveals a submerged path and a song that belongs to no living Echo.\n\n## Voice\nWarm, curious, lightly mysterious. Show emotion through actions.\n\n## Quest contract\nEntry condition, objective, completion condition, reward, continuity check.",
  campaign:
    "# Launch campaign\n\n## Audience\nPlayers who enjoy creature collecting, cozy discovery, and short adventure sessions.\n\n## Positioning\nA world of little wonders, waiting just outside.\n\n## Content pillars\nMeet an Echo · Behind the scenes · Discover the world · Community questions\n\n## First week\nMonday: Mossling reveal\nWednesday: 15-second encounter clip\nFriday: Chapter one concept diary\nSunday: Ask which habitat to explore next\n\n## Measurement\nQualified signups, demo completion, return visits and feedback themes. Never invent engagement metrics.",
  collection: [] as string[],
};
export type Studio = typeof seed;
