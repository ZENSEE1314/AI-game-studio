import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { seed } from "./data";
import type { Monster, Task, Studio } from "./data";
import { beginEncounter, resolveTurn, awardCompanion } from "./encounter";

const KEY = "ai-game-studio-v1";
function load(): Studio {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      s &&
      typeof s.title === "string" &&
      typeof s.bible === "string" &&
      typeof s.story === "string" &&
      typeof s.campaign === "string" &&
      Array.isArray(s.monsters) &&
      s.monsters.length &&
      s.monsters.every(
        (m: Monster) =>
          typeof m.id === "string" &&
          typeof m.name === "string" &&
          typeof m.element === "string" &&
          ["Nature", "Fire", "Water"].includes(m.element) &&
          typeof m.lore === "string" &&
          typeof m.status === "string" &&
          ["Draft", "Review", "Approved"].includes(m.status) &&
          Number.isInteger(m.hp) &&
          m.hp >= 10 &&
          m.hp <= 200 &&
          Number.isInteger(m.attack) &&
          m.attack >= 1 &&
          m.attack <= 50,
      ) &&
      Array.isArray(s.tasks) &&
      s.tasks.every(
        (t: Task) =>
          typeof t.id === "string" &&
          typeof t.title === "string" &&
          typeof t.owner === "string" &&
          typeof t.lane === "string",
      ) &&
      Array.isArray(s.collection) &&
      s.collection.every((id: unknown) => typeof id === "string")
    )
      return s;
  } catch {
    /* recover corrupt storage */
  }
  return structuredClone(seed);
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: name.endsWith(".json") ? "application/json" : "text/markdown",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Creature({ element }: { element: string }) {
  const c =
    element === "Fire"
      ? "#efa076"
      : element === "Water"
        ? "#88b5c5"
        : "#bacb7d";
  return (
    <svg
      className="creature"
      viewBox="0 0 240 210"
      role="img"
      aria-label={element + " creature illustration"}
    >
      <ellipse cx="120" cy="183" rx="64" ry="11" opacity=".1" />
      <path
        d="M75 115 Q30 80 65 43 Q94 47 103 83 M147 85 Q162 34 190 47 Q211 87 169 120"
        fill={c}
      />
      <path
        d="M72 156 Q50 111 79 84 Q117 56 157 82 Q197 111 175 155 Q163 181 121 181 Q85 182 72 156"
        fill={c}
      />
      <ellipse cx="96" cy="121" rx="6" ry="9" fill="#2c392d" />
      <ellipse cx="147" cy="121" rx="6" ry="9" fill="#2c392d" />
      <circle cx="98" cy="118" r="2" fill="white" />
      <circle cx="149" cy="118" r="2" fill="white" />
      <path
        d="M113 136 Q122 145 130 136"
        stroke="#354331"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="80" cy="137" rx="10" ry="5" fill="#e7a98f" opacity=".7" />
      <ellipse cx="163" cy="137" rx="10" ry="5" fill="#e7a98f" opacity=".7" />
      <path d="M92 173 L85 186 L110 186 M144 173 L153 186 L131 186" fill={c} />
      <path
        d="M118 80 Q88 49 116 29 Q139 50 118 80 M120 79 Q123 46 151 50 Q150 77 120 79"
        fill={
          element === "Nature"
            ? "#809954"
            : element === "Fire"
              ? "#ffdb96"
              : "#cce5e6"
        }
      />
    </svg>
  );
}
const pages = [
    "Overview",
    "Monster lab",
    "Story room",
    "Production",
    "Animation",
    "Launch room",
    "Game Bible",
    "Playtest",
  ],
  icons = ["◈", "♧", "▤", "▦", "▷", "↗", "▥", "⌘"],
  lanes = ["Backlog", "In progress", "Review", "Done"];
export default function App() {
  const [data, setData] = useState(load),
    [page, setPage] = useState("Overview"),
    [saved, setSaved] = useState(true),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [edit, setEdit] = useState<Monster | null>(null),
    [modal, setModal] = useState(false),
    [task, setTask] = useState(""),
    [selected, setSelected] = useState("mossling"),
    [battle, setBattle] = useState<{
      hp: number;
      energy: number;
      turn: number;
      running: boolean;
      message: string;
    }>({
      hp: 90,
      energy: 100,
      turn: 0,
      running: false,
      message: "Choose a creature and begin an encounter.",
    });
  // Storage failure must be visible to the user; this effect synchronizes an external system.
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      // oxlint-disable-next-line react/set-state-in-effect
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [data]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  const update = (v: Partial<Studio>) => setData((d) => ({ ...d, ...v })),
    active = data.monsters.find((m) => m.id === selected) || data.monsters[0];
  function saveMonster(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      m = {
        id: edit?.id || crypto.randomUUID(),
        name: String(f.get("name")).trim(),
        element: String(f.get("element")),
        hp: Number(f.get("hp")),
        attack: Number(f.get("attack")),
        lore: String(f.get("lore")).trim(),
        status: String(f.get("status")),
      };
    if (!m.name || !m.lore) return;
    update({
      monsters: edit
        ? data.monsters.map((x) => (x.id === m.id ? m : x))
        : [...data.monsters, m],
    });
    setModal(false);
  }
  function hit() {
    if (!battle.running) return;
    const next = resolveTurn(battle, active);
    setBattle(next);
    if (next.hp === 0)
      update({ collection: awardCompanion(data.collection, active.id) });
  }
  function card(m: Monster) {
    return (
      <button
        disabled={battle.running}
        className="monster-card"
        key={m.id}
        onClick={() => {
          setEdit(m);
          setModal(true);
        }}
      >
        <div className={"monster-art " + m.element.toLowerCase()}>
          <span className="element-chip">♧ {m.element}</span>
          <span className="card-arrow">↗</span>
          <Creature element={m.element} />
          <span className="rarity">CONCEPT CREATURE</span>
        </div>
        <div className="monster-info">
          <div>
            <h3>{m.name}</h3>
            <span className={"status " + m.status.toLowerCase()}>
              {m.status}
            </span>
          </div>
          <p>{m.lore}</p>
          <div className="monster-meta">
            <span>♡ {m.hp} HP</span>
            <span>ϟ {m.attack} ATK</span>
            <span>View profile →</span>
          </div>
        </div>
      </button>
    );
  }
  return (
    <div className="app">
      <aside className="sidebar" inert={modal}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          <span className="brand-mark">✳</span>
          <span>
            FORM & FABLE<small>AI GAME STUDIO</small>
          </span>
        </a>
        <div className="workspace">
          <span className="project-icon">E</span>
          <div>
            {data.title}
            <small>Studio workspace</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {pages.map((p, i) => (
            <button
              aria-label={p}
              className={page === p ? "nav active" : "nav"}
              key={p}
              onClick={() => setPage(p)}
            >
              <span>{icons[i]}</span>
              {p}
              {p === "Monster lab" && <em>{data.monsters.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-indicator">● LOCAL WORKSPACE</div>
          <p>Your ideas, saved in this browser.</p>
          <button
            className="text-button"
            onClick={() =>
              download("studio-backup.json", JSON.stringify(data, null, 2))
            }
          >
            Export workspace ↗
          </button>
          <div className="profile">
            <div>ZS</div>
            <span>
              Studio creator<small>Personal workspace</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main" inert={modal}>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{page}</strong>
          </div>
          <div className="header-right">
            <span className="save-status">
              {saved ? "◉ Saved locally" : "⚠ Storage full — export backup"}
            </span>
            <button
              className="avatar"
              aria-label="Export workspace backup"
              onClick={() =>
                download("studio-backup.json", JSON.stringify(data, null, 2))
              }
            >
              ZS
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Overview"
                  ? "YOUR NEXT WORLD STARTS HERE"
                  : data.title.toUpperCase() + " / STUDIO"}
              </div>
              <h1>
                {page === "Overview"
                  ? "A little imagination. A whole new world."
                  : page}
              </h1>
              <p>
                {page === "Overview"
                  ? "Your creative home for creatures, stories, and everything in between."
                  : page === "Playtest"
                    ? "Browser combat prototype. No GPS, walking rewards, or server connection yet."
                    : "Shape your world. Save your progress. Keep creating."}
              </p>
            </div>
            <button
              disabled={battle.running}
              className="primary"
              onClick={() => {
                setEdit(null);
                setModal(true);
              }}
            >
              ＋ New creature
            </button>
          </div>
          {page === "Overview" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="hero-tag">
                    ● ORIGINAL WORLD · WORKING CONCEPT
                  </div>
                  <h2>
                    Small creatures.
                    <br />
                    Extraordinary stories.
                  </h2>
                  <p>
                    Welcome to {data.title}. Shape a living world,
                    <br />
                    one curious little companion at a time.
                  </p>
                  <button onClick={() => setPage("Game Bible")}>
                    Explore the Game Bible <span>↗</span>
                  </button>
                  <div className="hero-footer">
                    CHAPTER 01 — THE QUIET GROVE
                  </div>
                </div>
                <div className="hero-art">
                  <div className="moon" />
                  <div className="hill h1" />
                  <div className="hill h2" />
                  <div className="hill h3" />
                  <div className="floating leaf-one">✦</div>
                  <div className="floating leaf-two">✧</div>
                  <div className="hero-creature">
                    <Creature element="Nature" />
                  </div>
                  <div className="art-caption">MEET MOSSLING · № 001</div>
                </div>
              </section>
              <div className="stats">
                <div>
                  <span>CREATURES IN YOUR WORLD</span>
                  <strong>
                    {String(data.monsters.length).padStart(2, "0")}
                  </strong>
                  <small>
                    {
                      data.monsters.filter((m) => m.status === "Approved")
                        .length
                    }{" "}
                    approved for production
                  </small>
                </div>
                <div>
                  <span>PRODUCTION TASKS</span>
                  <strong>
                    {String(
                      data.tasks.filter((t) => t.lane !== "Done").length,
                    ).padStart(2, "0")}
                  </strong>
                  <small>Ideas moving toward something real</small>
                </div>
                <div>
                  <span>PLAYTEST COLLECTION</span>
                  <strong>
                    {String(data.collection.length).padStart(2, "0")}
                  </strong>
                  <small>Companions discovered in playtest</small>
                </div>
              </div>
              <div className="section-title">
                <h2>Meet your world</h2>
                <button
                  className="text-button"
                  onClick={() => setPage("Monster lab")}
                >
                  Open monster lab ↗
                </button>
              </div>
              <div className="monster-grid">
                {data.monsters.slice(0, 3).map(card)}
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="section-title">
                    <h2>On the studio table</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("Production")}
                    >
                      View board ↗
                    </button>
                  </div>
                  {data.tasks
                    .filter((t) => t.lane !== "Done")
                    .slice(0, 3)
                    .map((t) => (
                      <div className="task-row" key={t.id}>
                        <span className="task-circle" />
                        <div>
                          {t.title}
                          <small>{t.owner}</small>
                        </div>
                        <span className="badge">{t.lane}</span>
                      </div>
                    ))}
                </section>
                <section className="note-panel">
                  <div className="eyebrow">A NOTE FOR YOUR NEXT SESSION</div>
                  <h2>
                    Make something
                    <br />
                    worth discovering.
                  </h2>
                  <p>
                    Start with a personality. Give it a home.
                    <br />
                    Then ask what makes it extraordinary.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setPage("Story room")}
                  >
                    Find the next story ↗
                  </button>
                </section>
              </div>
            </>
          )}
          {page === "Monster lab" && (
            <>
              <div className="toolbar">
                <input
                  aria-label="Search creatures"
                  placeholder="Search creatures…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Filter by element"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {["All", "Nature", "Fire", "Water"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      "monsters.json",
                      JSON.stringify(data.monsters, null, 2),
                    )
                  }
                >
                  Export JSON ↓
                </button>
              </div>
              <div className="monster-grid">
                {data.monsters
                  .filter(
                    (m) =>
                      m.name.toLowerCase().includes(query.toLowerCase()) &&
                      (filter === "All" || m.element === filter),
                  )
                  .map(card)}
              </div>
              {!data.monsters.some(
                (m) =>
                  m.name.toLowerCase().includes(query.toLowerCase()) &&
                  (filter === "All" || m.element === filter),
              ) && (
                <p className="empty">No creatures found. Try another search.</p>
              )}
            </>
          )}
          {["Game Bible", "Story room", "Launch room"].includes(page) && (
            <section className="editor-panel">
              <div className="editor-top">
                <label>
                  {page === "Game Bible"
                    ? "GAME_BIBLE.md"
                    : page === "Story room"
                      ? "STORY_BIBLE.md"
                      : "MARKETING.md"}
                </label>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      page === "Game Bible"
                        ? "GAME_BIBLE.md"
                        : page === "Story room"
                          ? "STORY_BIBLE.md"
                          : "MARKETING.md",
                      page === "Game Bible"
                        ? data.bible
                        : page === "Story room"
                          ? data.story
                          : data.campaign,
                    )
                  }
                >
                  Download Markdown ↓
                </button>
              </div>
              {page === "Game Bible" && (
                <label className="title-field">
                  World name
                  <input
                    maxLength={50}
                    value={data.title}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
              )}
              <textarea
                aria-label={page + " editor"}
                className="doc-editor"
                value={
                  page === "Game Bible"
                    ? data.bible
                    : page === "Story room"
                      ? data.story
                      : data.campaign
                }
                onChange={(e) =>
                  update(
                    page === "Game Bible"
                      ? { bible: e.target.value }
                      : page === "Story room"
                        ? { story: e.target.value }
                        : { campaign: e.target.value },
                  )
                }
              />
              <div className="editor-footer">
                Edits save in this browser. AI generation is not connected.
              </div>
            </section>
          )}
          {page === "Production" && (
            <>
              <form
                className="toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!task.trim()) return;
                  update({
                    tasks: [
                      ...data.tasks,
                      {
                        id: crypto.randomUUID(),
                        title: task.trim(),
                        owner: "Unassigned",
                        lane: "Backlog",
                      },
                    ],
                  });
                  setTask("");
                }}
              >
                <input
                  required
                  maxLength={150}
                  aria-label="New task title"
                  placeholder="What needs to happen next?"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                />
                <button className="primary">＋ Add task</button>
              </form>
              <div className="kanban">
                {lanes.map((lane) => (
                  <section className="lane" key={lane}>
                    <h3>
                      {lane}
                      <em>
                        {data.tasks.filter((t) => t.lane === lane).length}
                      </em>
                    </h3>
                    {data.tasks
                      .filter((t) => t.lane === lane)
                      .map((t) => (
                        <article className="task-card" key={t.id}>
                          <h4>{t.title}</h4>
                          <label>
                            Owner
                            <input
                              aria-label={"Owner for " + t.title}
                              value={t.owner}
                              onChange={(e) =>
                                update({
                                  tasks: data.tasks.map((x) =>
                                    x.id === t.id
                                      ? { ...x, owner: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </label>
                          <select
                            aria-label={"Status for " + t.title}
                            value={t.lane}
                            onChange={(e) =>
                              update({
                                tasks: data.tasks.map((x) =>
                                  x.id === t.id
                                    ? { ...x, lane: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          >
                            {lanes.map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </article>
                      ))}
                    {!data.tasks.some((t) => t.lane === lane) && (
                      <p className="lane-empty">Room for the next idea.</p>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {page === "Animation" && (
            <div className="animation-grid">
              {data.monsters.map((m) => (
                <section className="panel" key={m.id}>
                  <div className={"animation-stage " + m.element.toLowerCase()}>
                    <Creature element={m.element} />
                  </div>
                  <h2>{m.name}</h2>
                  <p className="muted">
                    CSS idle preview · concept, not a rigged asset
                  </p>
                  <div className="clip-list">
                    {[
                      "Idle · 2-second loop",
                      "Discover · curious glance",
                      "Attack · anticipation",
                      "Befriend · joyful reaction",
                    ].map((x) => (
                      <div key={x}>
                        ▷ <span>{x}</span>
                        <span className="badge">Planned</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        m.name + "-motion.md",
                        `# ${m.name} — Motion brief\n\n${m.lore}\n\nElement: ${m.element}\n\n## Clips\nIdle: 2-second seamless loop.\nDiscover: 1-second glance.\nAttack: 1.5 seconds, anticipation/impact/recovery.\nBefriend: 2-second joyful reaction.\n\n## Delivery\nSource rig and GLB preview. Named clips, no root motion.\n\n## Review\nSilhouette, loop seam, foot sliding, scale, clipping, reduced motion fallback.\n\nStatus: brief only, production animation not generated.`,
                      )
                    }
                  >
                    Export motion brief ↓
                  </button>
                </section>
              ))}
            </div>
          )}
          {page === "Playtest" && (
            <div className="play-layout">
              <section className="arena">
                <div className="arena-top">
                  <span>THE QUIET GROVE</span>
                  <span>TURN {battle.turn}</span>
                </div>
                <Creature element={active.element} />
                <h2>{active.name}</h2>
                <div className="hp">
                  <div
                    style={{
                      width: `${Math.min(100, (battle.hp / active.hp) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  Echo energy {battle.hp} / {active.hp}
                </small>
                <div className="player-energy">
                  Your energy <strong>{battle.energy} / 100</strong>
                </div>
                <p role="status">{battle.message}</p>
                <div className="arena-actions">
                  <button
                    disabled={battle.running}
                    className="primary"
                    onClick={() => setBattle(beginEncounter(active))}
                  >
                    {battle.turn ? "Restart encounter" : "Begin encounter"}
                  </button>
                  <button
                    disabled={!battle.running}
                    className="secondary"
                    onClick={hit}
                  >
                    Resonate · 22 damage
                  </button>
                </div>
              </section>
              <section className="panel">
                <h2>Encounter setup</h2>
                <label className="form-label">
                  Choose a creature
                  <select
                    disabled={battle.running}
                    value={active.id}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setBattle({
                        hp: data.monsters.find((m) => m.id === e.target.value)!
                          .hp,
                        energy: 100,
                        turn: 0,
                        running: false,
                        message: "Ready for a new encounter.",
                      });
                    }}
                  >
                    {data.monsters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  You deal 22 damage per turn. If the Echo still has energy, it
                  responds with its attack stat. Complete an encounter to add it
                  to your collection.
                </p>
                <h3>Your collection</h3>
                {data.collection.length ? (
                  data.collection.map((id) => {
                    const m = data.monsters.find((x) => x.id === id);
                    return m ? (
                      <div className="collection-item" key={id}>
                        <Creature element={m.element} />
                        <span>
                          {m.name}
                          <small>{m.element} companion</small>
                        </span>
                        <span>✓</span>
                      </div>
                    ) : null;
                  })
                ) : (
                  <p className="muted">Your first companion is waiting.</p>
                )}
              </section>
            </div>
          )}
          <footer>
            FORM & FABLE <span>Made for worlds that don’t exist. Yet.</span>
            <span>Prototype v0.1</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") setModal(false);
              if (e.key === "Tab") {
                const controls = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input, select, textarea",
                );
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="section-title">
              <h2 id="modal-title">
                {edit ? "Meet " + edit.name : "A new little wonder"}
              </h2>
              <button
                className="close"
                aria-label="Close creature editor"
                onClick={() => setModal(false)}
              >
                ×
              </button>
            </div>
            <p className="muted">
              Give your creature a personality and a place in the world.
            </p>
            <form onSubmit={saveMonster}>
              <label>
                Name
                <input
                  autoFocus
                  required
                  name="name"
                  maxLength={50}
                  defaultValue={edit?.name}
                  placeholder="What will you call them?"
                />
              </label>
              <div className="form-grid">
                <label>
                  Element
                  <select
                    name="element"
                    defaultValue={edit?.element || "Nature"}
                  >
                    {["Nature", "Fire", "Water"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={edit?.status || "Draft"}>
                    {["Draft", "Review", "Approved"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Health
                  <input
                    required
                    type="number"
                    name="hp"
                    min={10}
                    max={200}
                    step={1}
                    defaultValue={edit?.hp || 90}
                  />
                </label>
                <label>
                  Attack
                  <input
                    required
                    type="number"
                    name="attack"
                    min={1}
                    max={50}
                    step={1}
                    defaultValue={edit?.attack || 18}
                  />
                </label>
              </div>
              <label>
                Personality & lore
                <textarea
                  required
                  name="lore"
                  maxLength={1000}
                  defaultValue={edit?.lore}
                  placeholder="A tiny habit. A hidden power. A story to tell."
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(false)}
                >
                  Cancel
                </button>
                <button className="primary">
                  {edit ? "Save creature" : "Create creature"} ↗
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
