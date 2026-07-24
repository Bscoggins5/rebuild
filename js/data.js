/* REBUILD — program data (no-build vanilla port of program-data.ts) */
window.RB = window.RB || {};

RB.days = [
  { key: "mon", short: "Mon", label: "Monday" },
  { key: "tue", short: "Tue", label: "Tuesday" },
  { key: "wed", short: "Wed", label: "Wednesday" },
  { key: "thu", short: "Thu", label: "Thursday" },
  { key: "fri", short: "Fri", label: "Friday" },
  { key: "sat", short: "Sat", label: "Saturday" },
  { key: "sun", short: "Sun", label: "Sunday" },
];

RB.targets = {
  calories: 2500,
  calorieRange: "2,425–2,575",
  protein: "175–185 g",
  fat: "60–80 g",
  carbs: "remainder, usually 290–320 g",
  fiber: "35–50 g",
};

// Strength is periodized like Marcus Filly's Persist "Build": three 3-week
// blocks, each capped by a deload. Movements CHANGE between blocks (variety),
// and load/reps CLIMB within each block (progression). Every lift carries a
// tempo, rest, and a per-week intensity/load target.
//
//   wk[0..2]  -> the three weeks of that block (null = movement not run that week)
//   deload    -> the block's deload week (null = skipped on the deload)
// Resolver + week->block mapping live in app.js (strengthSessionFor).
RB.strengthBlocks = (function () {
  function rx(sets, reps, target) { return { sets: sets, reps: reps, target: target }; }

  return [
    // ============ BLOCK 1 · FOUNDATION (weeks 1–3, deload 4) ============
    {
      id: "foundation",
      name: "Foundation",
      weeks: [1, 2, 3],
      deloadWeek: 4,
      weekNotes: [
        "Week 1 · groove every pattern at a submaximal load and lock in the tempo. Leave 3–4 reps in reserve on all lifts.",
        "Week 2 · same movements, add a small load (or a rep) to last week's top sets. Progress, don't jump.",
        "Week 3 · block peak, your heaviest week. Top sets reach RPE 8 — hard but clean, never grinding or losing tempo.",
      ],
      deloadNote: "Deload · about two-thirds of the volume at ~15% lighter. Move crisply and recover; you're priming the next block, not testing this one.",
      days: {
        mon: {
          title: "Strength A", subtitle: "Squat + horizontal push/pull", duration: "55–60 min",
          exercises: [
            { id: "back-squat", name: "Back squat", group: "A", tempo: "30X1", rest: "2–2.5 min", cue: "Brace, controlled descent, drive evenly.",
              wk: [rx(3, "6", "RPE 6–7 · leave 3–4 reps"), rx(4, "6", "RPE 7 · +5–10 lb vs wk1"), rx(4, "5", "RPE 8 · +5–10 lb, top set hard")], deload: rx(2, "5", "RPE 5 · ~15% lighter, crisp") },
            { id: "db-bench", name: "DB bench press", group: "B1", tempo: "3011", rest: "75–90 sec", cue: "Pause at the chest; press smoothly. Superset with B2.",
              wk: [rx(3, "8–10", "RPE 7 · 2 in reserve"), rx(3, "8–10", "+1 rep or +5 lb"), rx(4, "8", "+load, hold tempo")], deload: rx(2, "10", "easy, full range") },
            { id: "cs-row", name: "Chest-supported row", group: "B2", tempo: "20X1", rest: "75–90 sec", cue: "Squeeze the mid-back, control the return.",
              wk: [rx(3, "10–12", "2 in reserve"), rx(3, "10–12", "+1–2 reps"), rx(4, "10", "+load")], deload: rx(2, "12", "light") },
            { id: "reverse-lunge", name: "Reverse lunge", group: "C1", tempo: "2011", rest: "60–75 sec", cue: "Tall torso, balanced steps.",
              wk: [rx(2, "10 / leg", "2 in reserve"), rx(3, "8 / leg", "+load vs wk1"), rx(3, "8 / leg", "+load")], deload: rx(2, "8 / leg", "light") },
            { id: "seated-leg-curl", name: "Seated leg curl", group: "C2", tempo: "2011", rest: "60 sec", cue: "1–2 reps in reserve, full squeeze.",
              wk: [rx(2, "12–15", "leave 2 reps"), rx(3, "12–15", "match + 1 rep"), rx(3, "10–12", "+load")], deload: rx(2, "12", "light") },
            { id: "suitcase-carry", name: "Suitcase carry", group: "D", tempo: "—", rest: "60 sec", cue: "Walk tall, resist the lean.",
              wk: [rx(2, "30–40 m / side", "heavy, no lean"), rx(3, "30–40 m / side", "+distance or load"), rx(3, "40 m / side", "heavier")], deload: rx(2, "30 m / side", "moderate") },
            { id: "z2-finish", name: "Zone-2 bike or row", group: "E", tempo: "—", rest: "—", cue: "Easy nasal-breathing pace to finish. Adds in week 3.",
              wk: [null, null, rx(1, "8 min", "RPE 5–6, conversational")], deload: null },
          ],
        },
        thu: {
          title: "Strength B", subtitle: "Hinge + vertical push/pull", duration: "55–60 min",
          exercises: [
            { id: "trap-deadlift", name: "Trap-bar deadlift", group: "A", tempo: "20X1", rest: "2.5 min", cue: "Flat back, push the floor away, crisp reps.",
              wk: [rx(3, "5", "RPE 6–7"), rx(4, "5", "RPE 7 · +10 lb"), rx(4, "4", "RPE 8 · +load")], deload: rx(2, "5", "light, perfect") },
            { id: "ohp", name: "Standing overhead press", group: "B1", tempo: "3011", rest: "90 sec", cue: "Ribs down, squeeze glutes; barbell or DBs.",
              wk: [rx(3, "6–8", "RPE 7"), rx(3, "6–8", "+1 rep or +5 lb"), rx(4, "6", "+load")], deload: rx(2, "8", "light") },
            { id: "pullups", name: "Strict pull-ups", group: "B2", tempo: "20X1", rest: "90 sec", cue: "Full hang to chin; add a band or use the pulldown if needed.",
              wk: [rx(3, "submax (~6–8)", "stop 2 shy of failure"), rx(3, "submax", "+1 rep / set"), rx(4, "submax", "hold quality")], deload: rx(2, "6", "easy") },
            { id: "rfess", name: "Rear-foot-elevated split squat", group: "C1", tempo: "3011", rest: "75 sec", cue: "Vertical shin, steady pelvis.",
              wk: [rx(2, "8 / leg", "2 in reserve"), rx(3, "8 / leg", "+load"), rx(3, "8 / leg", "+load")], deload: rx(2, "8 / leg", "light") },
            { id: "hip-thrust", name: "Hip thrust", group: "C2", tempo: "2012", rest: "75 sec", cue: "Full lockout, ribs down, 1-sec squeeze at the top.",
              wk: [rx(2, "10–12", "2 in reserve"), rx(3, "10–12", "+1–2 reps"), rx(3, "8–10", "+load")], deload: rx(2, "12", "light") },
            { id: "side-plank", name: "Side plank", group: "D", tempo: "—", rest: "45 sec", cue: "Straight line head-to-heel; add weight if easy.",
              wk: [rx(2, "30–40 sec / side", "solid brace"), rx(3, "30–45 sec / side", "+time"), rx(3, "40–50 sec / side", "+time or weight")], deload: rx(2, "30 sec / side", "easy") },
          ],
        },
        fri: {
          title: "Functional bodybuilding", subtitle: "Upper + engine", duration: "55–60 min",
          exercises: [
            { id: "med-ball-slam", name: "Medicine-ball slam", group: "A", tempo: "fast", rest: "60 sec", cue: "Explosive, low-fatigue reps. Adds in week 3.",
              wk: [null, null, rx(3, "3", "fast + violent, full recovery")], deload: null },
            { id: "incline-db", name: "Incline DB press", group: "B1", tempo: "3011", rest: "75 sec", cue: "Low incline; stretch and control. Superset with B2.",
              wk: [rx(3, "8–12", "2 in reserve"), rx(3, "8–12", "+1–2 reps"), rx(4, "8–10", "+load")], deload: rx(2, "12", "light") },
            { id: "one-arm-row", name: "One-arm DB row", group: "B2", tempo: "20X1", rest: "75 sec", cue: "Long pull, no torso english.",
              wk: [rx(3, "10–12 / side", "2 in reserve"), rx(3, "10–12 / side", "+reps"), rx(4, "10 / side", "+load")], deload: rx(2, "12 / side", "light") },
            { id: "landmine-press", name: "Half-kneeling landmine press", group: "C1", tempo: "3011", rest: "60 sec", cue: "Ribs stacked, press to the ceiling.",
              wk: [rx(2, "8–12 / side", "controlled"), rx(3, "8–12 / side", "+reps"), rx(3, "8–10 / side", "+load")], deload: rx(2, "10 / side", "light") },
            { id: "pulldown", name: "Lat pulldown", group: "C2", tempo: "20X1", rest: "60 sec", cue: "Neutral or wide; drive elbows to hips.",
              wk: [rx(2, "10–12", "full range"), rx(3, "10–12", "+reps"), rx(3, "8–10", "+load")], deload: rx(2, "12", "light") },
            { id: "arm-giant", name: "Lateral raise → curl → triceps pressdown", group: "D", tempo: "controlled", rest: "60 sec", cue: "Giant set — minimal rest between the three.",
              wk: [rx(2, "12–15 each", "clean reps"), rx(3, "12–15 each", "+reps"), rx(3, "12–15 each", "+load")], deload: rx(2, "12 each", "light") },
            { id: "farmer-carry", name: "Farmer carry", group: "E", tempo: "—", rest: "60 sec", cue: "Heavy, tall, controlled.",
              wk: [rx(3, "30–40 m", "heavy"), rx(3, "40 m", "+load"), rx(4, "40 m", "heavier")], deload: rx(2, "30 m", "moderate") },
            { id: "engine-finish", name: "Low-impact engine intervals", group: "F", tempo: "—", rest: "—", cue: "Row / Ski / Bike. Adds in week 3.",
              wk: [null, null, rx(1, "8–10 min", "30s hard / 30s easy, RPE 7–8")], deload: null },
          ],
        },
      },
    },

    // ============ BLOCK 2 · BUILD (weeks 5–7, deload 8) ============
    {
      id: "build",
      name: "Build",
      weeks: [5, 6, 7],
      deloadWeek: 8,
      weekNotes: [
        "Week 1 · new variations, a notch more intensity than Foundation. Find your working loads and leave 2–3 reps in reserve.",
        "Week 2 · add load or reps to the primaries; push the accessories one notch harder.",
        "Week 3 · block peak — the heaviest, most demanding week. Primaries hit RPE 8–8.5 with clean bar speed.",
      ],
      deloadNote: "Deload · trim to two-thirds volume, ~15% lighter, sharpen technique. Bank the recovery before the Peak block.",
      days: {
        mon: {
          title: "Strength A", subtitle: "Front squat + bench press", duration: "55–60 min",
          exercises: [
            { id: "front-squat", name: "Front squat", group: "A", tempo: "31X1", rest: "2.5 min", cue: "Elbows high, upright torso, controlled descent.",
              wk: [rx(4, "5", "RPE 7"), rx(5, "4", "+load"), rx(5, "3", "RPE 8 · heavy, sharp")], deload: rx(2, "4", "light") },
            { id: "bb-bench", name: "Barbell bench press", group: "B1", tempo: "30X1", rest: "2 min", cue: "Now the primary press; tuck elbows, leave 2 reps.",
              wk: [rx(4, "6", "RPE 7"), rx(4, "5", "+load"), rx(5, "5", "RPE 8")], deload: rx(2, "6", "light") },
            { id: "seal-row", name: "Seal row", group: "B2", tempo: "20X1", rest: "90 sec", cue: "Chest on the bench, pull with no swing. Chest-supported row also works.",
              wk: [rx(3, "8–10", "2 in reserve"), rx(4, "8–10", "+reps"), rx(4, "8", "+load")], deload: rx(2, "10", "light") },
            { id: "walking-lunge", name: "Walking DB lunge", group: "C1", tempo: "2010", rest: "75 sec", cue: "Long strides, upright torso; add load as able.",
              wk: [rx(3, "10 / leg", "2 in reserve"), rx(3, "12 / leg", "+reps"), rx(3, "10 / leg", "+load")], deload: rx(2, "10 / leg", "light") },
            { id: "lying-leg-curl", name: "Lying leg curl", group: "C2", tempo: "2011", rest: "60 sec", cue: "Squeeze the hamstrings, control the eccentric.",
              wk: [rx(3, "10–12", "2 in reserve"), rx(3, "12", "+reps"), rx(3, "10", "+load")], deload: rx(2, "12", "light") },
            { id: "front-carry", name: "Front-rack carry", group: "D", tempo: "—", rest: "60 sec", cue: "Ribs down, brace hard, tall steps.",
              wk: [rx(3, "30–40 m", "heavy"), rx(3, "40 m", "+load"), rx(3, "40 m", "heavier")], deload: rx(2, "30 m", "moderate") },
            { id: "z2-mon", name: "Zone-2 bike or row", group: "E", tempo: "—", rest: "—", cue: "Easy aerobic finish.",
              wk: [rx(1, "10 min", "RPE 5–6"), rx(1, "10 min", "RPE 5–6"), rx(1, "8 min", "RPE 5–6")], deload: null },
          ],
        },
        thu: {
          title: "Strength B", subtitle: "RDL + vertical press/pull", duration: "55–60 min",
          exercises: [
            { id: "rdl", name: "Barbell Romanian deadlift", group: "A", tempo: "3011", rest: "2–2.5 min", cue: "Hinge, soft knees, feel the hamstrings; flat back.",
              wk: [rx(4, "6", "RPE 7"), rx(4, "5", "+load"), rx(5, "5", "RPE 8")], deload: rx(2, "6", "light") },
            { id: "push-press", name: "Push press", group: "B1", tempo: "20X1", rest: "90 sec", cue: "Dip-drive with the legs, punch overhead, tight finish.",
              wk: [rx(4, "5", "RPE 7"), rx(4, "4", "+load"), rx(5, "3", "RPE 8")], deload: rx(2, "5", "light") },
            { id: "weighted-pullup", name: "Weighted / tempo pull-ups", group: "B2", tempo: "21X1", rest: "90 sec", cue: "Add load if you have 8+ strict; otherwise strict submax.",
              wk: [rx(4, "5–6", "2 in reserve"), rx(4, "5–6", "+1 rep or +load"), rx(4, "4–5", "+load")], deload: rx(2, "6", "bodyweight") },
            { id: "bulgarian", name: "Bulgarian split squat", group: "C1", tempo: "3011", rest: "75 sec", cue: "Front-foot pressure, controlled depth.",
              wk: [rx(3, "8 / leg", "2 in reserve"), rx(3, "10 / leg", "+reps"), rx(3, "8 / leg", "+load")], deload: rx(2, "8 / leg", "light") },
            { id: "back-ext", name: "45° back extension", group: "C2", tempo: "2012", rest: "60 sec", cue: "Controlled; hold a plate to the chest as it gets easy.",
              wk: [rx(3, "12–15", "bodyweight or plate"), rx(3, "12–15", "+load"), rx(3, "12", "+load")], deload: rx(2, "12", "bodyweight") },
            { id: "pallof", name: "Tall-kneeling Pallof press", group: "D", tempo: "2-sec hold", rest: "45 sec", cue: "Resist rotation, ribs down.",
              wk: [rx(2, "10 / side", "controlled"), rx(3, "10 / side", "+band or reps"), rx(3, "10 / side", "+tension")], deload: rx(2, "10 / side", "light") },
          ],
        },
        fri: {
          title: "Functional bodybuilding", subtitle: "Upper + engine", duration: "55–60 min",
          exercises: [
            { id: "rot-med-ball", name: "Rotational med-ball throw", group: "A", tempo: "fast", rest: "60 sec", cue: "Explosive hip rotation, reset each rep.",
              wk: [rx(3, "4 / side", "explosive"), rx(3, "4 / side", "explosive"), rx(3, "3 / side", "explosive")], deload: null },
            { id: "low-incline-db", name: "Low-incline DB press", group: "B1", tempo: "3110", rest: "75 sec", cue: "Slow stretch, 1-sec pause at the bottom.",
              wk: [rx(4, "8–10", "2 in reserve"), rx(4, "8–10", "+reps"), rx(4, "8", "+load")], deload: rx(2, "10", "light") },
            { id: "tbar-row", name: "Chest-supported T-bar row", group: "B2", tempo: "20X1", rest: "75 sec", cue: "Full stretch and squeeze, no heave.",
              wk: [rx(4, "10–12", "2 in reserve"), rx(4, "10–12", "+reps"), rx(4, "10", "+load")], deload: rx(2, "12", "light") },
            { id: "arnold-press", name: "Seated DB Arnold press", group: "C1", tempo: "3011", rest: "60 sec", cue: "Full rotation, controlled path.",
              wk: [rx(3, "10–12", "2 in reserve"), rx(3, "10–12", "+reps"), rx(3, "8–10", "+load")], deload: rx(2, "12", "light") },
            { id: "face-pull", name: "Cable face pull", group: "C2", tempo: "2-sec squeeze", rest: "45 sec", cue: "Externally rotate, elbows high.",
              wk: [rx(3, "15", "controlled"), rx(3, "15", "+reps"), rx(3, "12–15", "+load")], deload: rx(2, "15", "light") },
            { id: "arm-superset", name: "Incline curl + overhead triceps", group: "D", tempo: "3011", rest: "60 sec", cue: "Superset; full stretch on both.",
              wk: [rx(3, "12 each", "2 in reserve"), rx(3, "12–15 each", "+reps"), rx(3, "12 each", "+load")], deload: rx(2, "12 each", "light") },
            { id: "sandbag-carry", name: "Sandbag or KB front carry", group: "E", tempo: "—", rest: "60 sec", cue: "Bear-hug, brace, walk tall.",
              wk: [rx(3, "40 m", "heavy"), rx(3, "40 m", "+load"), rx(4, "40 m", "heavier")], deload: rx(2, "30 m", "moderate") },
            { id: "engine-fri", name: "Mixed-modal engine", group: "F", tempo: "—", rest: "—", cue: "Row / Bike / Ski intervals.",
              wk: [rx(1, "8 min", "40s hard / 20s easy, RPE 7"), rx(1, "9 min", "+1 min"), rx(1, "10 min", "RPE 7–8")], deload: null },
          ],
        },
      },
    },

    // ============ BLOCK 3 · PEAK (weeks 9–11, deload/test 12) ============
    {
      id: "peak",
      name: "Peak",
      weeks: [9, 10, 11],
      deloadWeek: 12,
      weekNotes: [
        "Week 1 · intensity ramps — primaries drop to triples at RPE 8. Bar speed stays crisp; stop a rep short of any grind.",
        "Week 2 · add load to the top triples/doubles; accessories stay honest but volume trims slightly.",
        "Week 3 · peak week. Heaviest top sets of the whole cycle (optional back-off single), then you deload into the week-12 test.",
      ],
      deloadNote: "Test-week taper · minimal lifting, ~70% loads, low volume. Save it for the Saturday 5K and finish the block fresh.",
      days: {
        mon: {
          title: "Strength A", subtitle: "Back squat (heavy) + bench", duration: "55–60 min",
          exercises: [
            { id: "back-squat-heavy", name: "Back squat", group: "A", tempo: "20X1", rest: "3 min", cue: "Heavy but sharp; brace hard, no grind.",
              wk: [rx(5, "3", "RPE 8"), rx(4, "3", "+load, RPE 8.5"), rx(3, "2", "peak; optional top single")], deload: rx(2, "3", "~70%, easy") },
            { id: "bb-bench-heavy", name: "Barbell bench press", group: "B1", tempo: "20X1", rest: "2–3 min", cue: "Heavier triples; controlled, leave 1–2.",
              wk: [rx(5, "4", "RPE 8"), rx(4, "3", "+load"), rx(3, "3", "RPE 8.5")], deload: rx(2, "4", "~70%") },
            { id: "pendlay-row", name: "Pendlay row", group: "B2", tempo: "10X1", rest: "90 sec", cue: "Explosive pull from the floor, flat back.",
              wk: [rx(4, "6", "2 in reserve"), rx(4, "6", "+load"), rx(3, "5", "+load")], deload: rx(2, "8", "light") },
            { id: "heavy-reverse-lunge", name: "DB reverse lunge (heavy)", group: "C1", tempo: "2010", rest: "75 sec", cue: "Loaded and controlled, tall torso.",
              wk: [rx(3, "6 / leg", "2 in reserve"), rx(3, "6 / leg", "+load"), rx(3, "6 / leg", "+load")], deload: rx(2, "8 / leg", "light") },
            { id: "slow-leg-curl", name: "Slow-eccentric leg curl", group: "C2", tempo: "40X0", rest: "60 sec", cue: "4-sec lower, hard squeeze at the top.",
              wk: [rx(3, "8–10", "controlled"), rx(3, "8–10", "+load"), rx(3, "8", "+load")], deload: rx(2, "10", "light") },
            { id: "suitcase-heavy", name: "Heavy suitcase carry", group: "D", tempo: "—", rest: "75 sec", cue: "As heavy as you can stay tall.",
              wk: [rx(3, "30 m / side", "heavy"), rx(3, "30 m / side", "+load"), rx(3, "30 m / side", "+load")], deload: rx(2, "30 m / side", "moderate") },
          ],
        },
        thu: {
          title: "Strength B", subtitle: "Deadlift (heavy) + press/pull", duration: "55–60 min",
          exercises: [
            { id: "deadlift-heavy", name: "Deadlift (conventional or trap)", group: "A", tempo: "10X1", rest: "3 min", cue: "Set the back, push the floor; crisp reps, no grind.",
              wk: [rx(5, "3", "RPE 8"), rx(4, "3", "+load"), rx(3, "2", "peak; optional top single")], deload: rx(2, "3", "~70%") },
            { id: "ohp-heavy", name: "Standing barbell press", group: "B1", tempo: "20X1", rest: "2 min", cue: "Strict and tight; heavier for lower reps.",
              wk: [rx(4, "5", "RPE 8"), rx(4, "4", "+load"), rx(3, "3", "RPE 8.5")], deload: rx(2, "5", "light") },
            { id: "weighted-pullup-heavy", name: "Weighted pull-ups", group: "B2", tempo: "20X1", rest: "2 min", cue: "Add load; full range, no kip.",
              wk: [rx(4, "4–5", "+load"), rx(4, "3–4", "+load"), rx(3, "3", "heaviest")], deload: rx(2, "6", "bodyweight") },
            { id: "step-up", name: "Loaded DB step-up", group: "C1", tempo: "2010", rest: "75 sec", cue: "Drive through the whole foot, control down.",
              wk: [rx(3, "8 / leg", "2 in reserve"), rx(3, "8 / leg", "+load"), rx(3, "6 / leg", "+load")], deload: rx(2, "8 / leg", "light") },
            { id: "hip-thrust-heavy", name: "Barbell hip thrust", group: "C2", tempo: "2012", rest: "75 sec", cue: "Heavy, full lockout, 1-sec pause.",
              wk: [rx(3, "8", "+load"), rx(3, "6–8", "+load"), rx(3, "6", "+load")], deload: rx(2, "10", "light") },
            { id: "farmer-heavy", name: "Heavy farmer carry", group: "D", tempo: "—", rest: "75 sec", cue: "Grip and posture are the priority.",
              wk: [rx(3, "30 m", "heavy"), rx(3, "30 m", "+load"), rx(3, "30 m", "+load")], deload: rx(2, "30 m", "moderate") },
          ],
        },
        fri: {
          title: "Functional bodybuilding", subtitle: "Upper + engine (sharpen)", duration: "50–55 min",
          exercises: [
            { id: "med-ball-slam-peak", name: "Medicine-ball slam", group: "A", tempo: "fast", rest: "60 sec", cue: "Peak power; fast and violent, full recovery.",
              wk: [rx(4, "3", "explosive"), rx(4, "3", "explosive"), rx(3, "3", "explosive")], deload: null },
            { id: "incline-db-heavy", name: "Incline DB press", group: "B1", tempo: "20X1", rest: "90 sec", cue: "Heavier for 6–8; controlled.",
              wk: [rx(4, "6–8", "2 in reserve"), rx(4, "6–8", "+load"), rx(3, "6", "+load")], deload: rx(2, "10", "light") },
            { id: "cs-row-heavy", name: "Chest-supported row (heavy)", group: "B2", tempo: "20X1", rest: "90 sec", cue: "Heavy, strict, full squeeze.",
              wk: [rx(4, "8", "2 in reserve"), rx(4, "8", "+load"), rx(3, "6–8", "+load")], deload: rx(2, "10", "light") },
            { id: "weighted-dip", name: "Weighted dip (or DB press)", group: "C1", tempo: "3011", rest: "75 sec", cue: "Full range; add load once you pass ~10 bodyweight reps.",
              wk: [rx(3, "8–10", "2 in reserve"), rx(3, "8–10", "+load"), rx(3, "6–8", "+load")], deload: rx(2, "10", "bodyweight") },
            { id: "chinup", name: "Chin-up (supinated)", group: "C2", tempo: "20X1", rest: "75 sec", cue: "Full hang to chin; add load or reps.",
              wk: [rx(3, "6–8", "2 shy of failure"), rx(3, "6–8", "+1 rep or load"), rx(3, "5–6", "+load")], deload: rx(2, "6", "easy") },
            { id: "arm-giant-peak", name: "Lateral raise → hammer curl → triceps", group: "D", tempo: "controlled", rest: "60 sec", cue: "Giant set, pump finish.",
              wk: [rx(3, "12–15 each", "clean reps"), rx(3, "12–15 each", "+load"), rx(3, "12 each", "+load")], deload: rx(2, "12 each", "light") },
            { id: "engine-peak", name: "Engine intervals", group: "E", tempo: "—", rest: "—", cue: "Hard mixed-modal intervals to finish.",
              wk: [rx(1, "10 min", "RPE 8, 1:1 work:rest"), rx(1, "10 min", "RPE 8"), rx(1, "8 min", "RPE 8, sharpen")], deload: null },
          ],
        },
      },
    },
  ];
})();

// ---- Program catalogue (home screen) ----
// `status: "ready"` means the full week-by-week content exists. Anything marked
// "soon" is described honestly but not startable yet.
RB.programs = [
  {
    id: "hybrid", name: "Hybrid Training", status: "ready",
    tagline: "Strength + running, 12 weeks",
    summary: "Rebuild strength and run fitness at the same time, without either one wrecking the other.",
    details: [
      "3 lifting days — periodized Foundation → Build → Peak blocks with automatic load targets",
      "3 runs — easy, quality/intervals and a long run that build across 12 weeks",
      "Deloads on weeks 4 and 8, 5K benchmark on week 12",
      "Sunday fully off",
    ],
    daysPerWeek: 6, weeks: 12, activityFactor: 1.55,
  },
  {
    id: "triathlon", name: "Triathlon Prep", status: "soon",
    tagline: "Swim / bike / run, sprint to olympic",
    summary: "Three-sport base building with brick sessions and a race-week taper.",
    details: [
      "Swim technique and endurance progressions",
      "Bike intervals plus a weekly long ride",
      "Run off the bike (bricks) and open runs",
      "Two short strength sessions to stay durable",
    ],
    daysPerWeek: 6, weeks: 12, activityFactor: 1.7,
  },
  {
    id: "run", name: "Run-Only Race Prep", status: "soon",
    tagline: "5K / 10K / half marathon",
    summary: "A pure running block built on easy mileage with one quality session a week.",
    details: [
      "Mostly easy aerobic mileage with a weekly long run",
      "One threshold or interval session per week",
      "Strides and light mobility to keep turnover sharp",
      "Optional 2 short lifting days for injury resilience",
    ],
    daysPerWeek: 5, weeks: 12, activityFactor: 1.6,
  },
  {
    id: "strength", name: "Strength & Hypertrophy", status: "soon",
    tagline: "Pure lifting, no running required",
    summary: "An upper/lower split focused on getting stronger and adding muscle.",
    details: [
      "4 lifting days on an upper/lower split",
      "Heavy compound work plus higher-rep accessories",
      "Automatic load progression on every main lift",
      "Optional low-impact conditioning for recovery",
    ],
    daysPerWeek: 4, weeks: 12, activityFactor: 1.45,
  },
  {
    id: "bodyweight", name: "Bodyweight / Travel", status: "soon",
    tagline: "Minimal or no equipment",
    summary: "Stay in shape anywhere — hotel rooms, deployments, or no gym access.",
    details: [
      "Full-body bodyweight circuits that scale to your level",
      "Push, pull, squat and hinge progressions using only your bodyweight",
      "Short conditioning finishers needing zero equipment",
      "Optional band or backpack loading",
    ],
    daysPerWeek: 5, weeks: 8, activityFactor: 1.4,
  },
];

// ---- Baseline assessment ----
// Recognized field tests. Each scores 0–3 against common fitness standards;
// `bands` are the thresholds for 1, 2 and 3 points. `reverse` = lower is better.
RB.baselineTests = [
  { id: "pushups", label: "Max push-ups", unit: "reps", placeholder: "20",
    hint: "One set, chest to fist height, no rest. Stop when form breaks.", bands: [10, 20, 35] },
  { id: "pullups", label: "Max strict pull-ups", unit: "reps", placeholder: "5",
    hint: "Dead hang to chin over the bar, no kipping. Zero is a valid answer.", bands: [1, 5, 10] },
  { id: "squats", label: "Bodyweight squats in 60 sec", unit: "reps", placeholder: "35",
    hint: "Thighs to at least parallel, moving continuously for one minute.", bands: [20, 35, 50] },
  { id: "plank", label: "Front plank hold", unit: "seconds", placeholder: "60",
    hint: "Elbows under shoulders, straight line head to heel. Stop when the hips sag.", bands: [30, 60, 120] },
  { id: "runTest", label: "1.5-mile run", unit: "mm:ss", placeholder: "13:30", time: true,
    hint: "The standard aerobic field test — run it hard but even. Leave blank if you haven't done one.",
    bands: [960, 780, 630], reverse: true },
];

// ---- Starting-weight estimates ----
// Asked at the end of the assessment and used to seed the first session's
// target load for every lift that maps to one of them.
RB.liftSeeds = [
  { id: "squat", label: "Back squat", hint: "Barbell on your back" },
  { id: "bench", label: "Bench press", hint: "Barbell, flat bench" },
  { id: "deadlift", label: "Deadlift", hint: "Trap-bar or conventional" },
  { id: "press", label: "Overhead press", hint: "Standing barbell press" },
];

// exercise id -> which estimate it derives from, and the ratio to apply.
// Dumbbell movements are per-hand, hence the small factors.
RB.seedMap = {
  "back-squat": { s: "squat", f: 1 }, "back-squat-heavy": { s: "squat", f: 1 }, "front-squat": { s: "squat", f: 0.8 },
  "bb-bench": { s: "bench", f: 1 }, "bb-bench-heavy": { s: "bench", f: 1 },
  "db-bench": { s: "bench", f: 0.38 }, "incline-db": { s: "bench", f: 0.33 },
  "low-incline-db": { s: "bench", f: 0.33 }, "incline-db-heavy": { s: "bench", f: 0.35 },
  "trap-deadlift": { s: "deadlift", f: 1.05 }, "deadlift-heavy": { s: "deadlift", f: 1 }, "rdl": { s: "deadlift", f: 0.6 },
  "ohp": { s: "press", f: 1 }, "ohp-heavy": { s: "press", f: 1 }, "push-press": { s: "press", f: 1.15 },
  "cs-row": { s: "bench", f: 0.7 }, "seal-row": { s: "bench", f: 0.65 }, "tbar-row": { s: "bench", f: 0.7 },
  "pendlay-row": { s: "bench", f: 0.75 }, "cs-row-heavy": { s: "bench", f: 0.75 }, "one-arm-row": { s: "bench", f: 0.35 },
  "hip-thrust": { s: "squat", f: 0.9 }, "hip-thrust-heavy": { s: "squat", f: 1 },
};

// ---- Goals (drive the calorie/protein calculation) ----
RB.goals = [
  { id: "lose", label: "Lose fat", desc: "Drop body fat while holding onto strength.", calAdj: -0.15, proteinPerKg: 2.0 },
  { id: "recomp", label: "Recomp", desc: "Lean out slowly while gaining a little muscle.", calAdj: -0.07, proteinPerKg: 2.1 },
  { id: "lean", label: "Build lean muscle", desc: "Add muscle with minimal fat gain.", calAdj: 0.10, proteinPerKg: 2.0 },
  { id: "perform", label: "Perform / maintain", desc: "Fuel training and hold current weight.", calAdj: 0, proteinPerKg: 1.8 },
];

// ---- Dietary preference ----
RB.diets = [
  { id: "omnivore", label: "No restrictions", desc: "Everything's on the table." },
  { id: "pescatarian", label: "Pescatarian", desc: "Fish and seafood, no other meat." },
  { id: "vegetarian", label: "Vegetarian", desc: "No meat or fish; dairy and eggs are fine." },
  { id: "vegan", label: "Vegan", desc: "No animal products at all." },
];

// Protein swaps applied to meal ingredients when the diet excludes an item.
// `p` is grams of protein per 100 g of the food, used to size the replacement
// portion so it matches the protein it's standing in for.
RB.proteinFoods = {
  "chicken breast": { p: 31, kinds: ["omnivore"] },
  "ground turkey": { p: 27, kinds: ["omnivore"] },
  "ground beef": { p: 26, kinds: ["omnivore"] },
  "beef patty": { p: 26, kinds: ["omnivore"] },
  "deli turkey": { p: 17, kinds: ["omnivore"] },
  "shrimp": { p: 24, kinds: ["omnivore", "pescatarian"] },
  "tuna": { p: 25, kinds: ["omnivore", "pescatarian"] },
  "eggs": { p: 13, kinds: ["omnivore", "pescatarian", "vegetarian"] },
  "egg whites": { p: 11, kinds: ["omnivore", "pescatarian", "vegetarian"] },
  "greek yogurt": { p: 10, kinds: ["omnivore", "pescatarian", "vegetarian"] },
  "cottage cheese": { p: 11, kinds: ["omnivore", "pescatarian", "vegetarian"] },
  "whey protein": { p: 80, kinds: ["omnivore", "pescatarian", "vegetarian"] },
  "milk": { p: 3.4, kinds: ["omnivore", "pescatarian", "vegetarian"] },
  "cheese": { p: 25, kinds: ["omnivore", "pescatarian", "vegetarian"] },
};

// What each excluded food becomes, per diet.
RB.dietSwaps = {
  pescatarian: {
    "chicken breast": { name: "Salmon or white fish", p: 25 },
    "ground turkey": { name: "Canned salmon or white fish", p: 24 },
    "ground beef": { name: "Canned salmon or white fish", p: 24 },
    "beef patty": { name: "Salmon patty", p: 22 },
    "deli turkey": { name: "Smoked salmon or tuna", p: 22 },
  },
  vegetarian: {
    "chicken breast": { name: "Extra-firm tofu or seitan", p: 19 },
    "ground turkey": { name: "Plant mince (soy/pea)", p: 18 },
    "ground beef": { name: "Plant mince (soy/pea)", p: 18 },
    "beef patty": { name: "Black-bean or plant patty", p: 15 },
    "deli turkey": { name: "Marinated tempeh", p: 19 },
    "shrimp": { name: "Edamame + tempeh", p: 18 },
    "tuna": { name: "Chickpea + tahini mash", p: 9 },
  },
  vegan: {
    "chicken breast": { name: "Extra-firm tofu or seitan", p: 19 },
    "ground turkey": { name: "Plant mince (soy/pea)", p: 18 },
    "ground beef": { name: "Plant mince (soy/pea)", p: 18 },
    "beef patty": { name: "Black-bean or plant patty", p: 15 },
    "deli turkey": { name: "Marinated tempeh", p: 19 },
    "shrimp": { name: "Edamame + tempeh", p: 18 },
    "tuna": { name: "Chickpea + tahini mash", p: 9 },
    "eggs": { name: "Tofu scramble", p: 13, amount: "150 g" },
    "egg whites": { name: "Extra tofu (firm)", p: 17 },
    "greek yogurt": { name: "Soy yogurt (high-protein)", p: 6 },
    "cottage cheese": { name: "Silken tofu, blended", p: 8 },
    "whey protein": { name: "Pea/soy protein isolate", p: 80 },
    "milk": { name: "Soy milk", p: 3.3 },
    // Cheese is here for flavour and fat, not as a protein source — swap it
    // gram-for-gram instead of scaling the portion up to match protein.
    "cheese": { name: "Plant-based cheese", p: 5, keepAmount: true },
    "honey": { name: "Maple syrup", keepAmount: true },
  },
};

// Meal titles rewritten so the name matches what's actually on the plate.
RB.mealNames = {
  pescatarian: {
    "chicken-rice-120": "Salmon rice bowl", "chicken-rice-90": "Salmon rice bowl",
    "taco-bowl": "Fish taco bowls", "turkey-sandwich-lunch": "Tuna sandwich plate",
    "turkey-sandwich-light": "Tuna sandwich plate", "sheet-pan-chicken": "Sheet-pan salmon & potatoes",
    "spaghetti-dinner": "Spaghetti & tomato ragù", "burger-dinner": "Salmon burger, oven fries & salad",
    "fajita-dinner": "Shrimp fajitas", "chili-dinner": "Bean chili & cornbread",
  },
  vegetarian: {
    "chicken-rice-120": "Tofu rice bowl", "chicken-rice-90": "Tofu rice bowl",
    "taco-bowl": "Plant-mince taco bowls", "turkey-sandwich-lunch": "Tempeh sandwich plate",
    "turkey-sandwich-light": "Tempeh sandwich plate", "sheet-pan-chicken": "Sheet-pan tofu & potatoes",
    "spaghetti-dinner": "Spaghetti & plant-mince sauce", "tuna-rice-lunch": "Chickpea, rice & bean bowl",
    "shrimp-stir-fry": "Tempeh & edamame stir-fry", "burger-dinner": "Veggie burger, oven fries & salad",
    "fajita-dinner": "Tofu fajitas", "chili-dinner": "Plant chili & cornbread",
  },
  vegan: {
    "egg-oat-breakfast": "Tofu scramble, oats & berries", "chicken-rice-120": "Tofu rice bowl",
    "chicken-rice-90": "Tofu rice bowl", "yogurt-whey-banana": "Soy yogurt, protein & banana",
    "whey-banana": "Protein shake & banana", "yogurt-granola-snack": "Soy yogurt power bowl",
    "taco-bowl": "Plant-mince taco bowls", "yogurt-oat-breakfast": "Soy yogurt oat bowl",
    "turkey-sandwich-lunch": "Tempeh sandwich plate", "turkey-sandwich-light": "Tempeh sandwich plate",
    "sheet-pan-chicken": "Sheet-pan tofu & potatoes", "spaghetti-dinner": "Spaghetti & plant-mince sauce",
    "egg-sandwich-breakfast": "Tofu & cheese breakfast sandwich", "tuna-rice-lunch": "Chickpea, rice & bean bowl",
    "shrimp-stir-fry": "Tempeh & edamame stir-fry", "burger-dinner": "Plant burger, oven fries & salad",
    "fajita-dinner": "Tofu fajitas", "cottage-snack": "Silken tofu, apple & granola",
    "chili-dinner": "Plant chili & cornbread",
  },
};

// ---- Automatic load progression ----
// How much weight to add when last week's work was completed at RPE ≤ 8.
// Bigger jumps on big lower-body/hinge patterns, small jumps on isolation.
RB.loadStep = {
  "back-squat": 10, "front-squat": 10, "back-squat-heavy": 10,
  "trap-deadlift": 15, "rdl": 10, "deadlift-heavy": 15,
  "db-bench": 5, "bb-bench": 5, "bb-bench-heavy": 5,
  "ohp": 5, "ohp-heavy": 5, "push-press": 5,
  "cs-row": 5, "cs-row-heavy": 5, "seal-row": 5, "tbar-row": 5, "pendlay-row": 5, "one-arm-row": 5,
  "incline-db": 5, "low-incline-db": 5, "incline-db-heavy": 5,
  "reverse-lunge": 5, "walking-lunge": 5, "heavy-reverse-lunge": 5,
  "rfess": 5, "bulgarian": 5, "step-up": 5,
  "hip-thrust": 10, "hip-thrust-heavy": 10,
  "seated-leg-curl": 5, "lying-leg-curl": 5, "slow-leg-curl": 5,
  "pulldown": 5, "landmine-press": 5, "arnold-press": 5, "back-ext": 5,
  "face-pull": 2.5, "arm-giant": 2.5, "arm-superset": 2.5, "arm-giant-peak": 2.5,
  "weighted-pullup": 2.5, "weighted-pullup-heavy": 2.5, "weighted-dip": 2.5, "chinup": 2.5,
  "suitcase-carry": 10, "suitcase-heavy": 10, "front-carry": 10,
  "farmer-carry": 10, "farmer-heavy": 10, "sandbag-carry": 10,
};
RB.loadStepDefault = 5;

// Movements that continue an earlier block's lift, so the suggested load can
// carry across a block change instead of resetting (key → the earlier lift).
RB.loadLineage = {
  "back-squat-heavy": "back-squat",
  "bb-bench-heavy": "bb-bench",
  "ohp-heavy": "ohp",
  "deadlift-heavy": "trap-deadlift",
  "incline-db-heavy": "incline-db",
  "cs-row-heavy": "cs-row",
  "hip-thrust-heavy": "hip-thrust",
  "weighted-pullup-heavy": "weighted-pullup",
  "suitcase-heavy": "suitcase-carry",
  "farmer-heavy": "farmer-carry",
  "lying-leg-curl": "seated-leg-curl",
  "slow-leg-curl": "lying-leg-curl",
};

// Bodyweight, time-based or power movements — no barbell load to auto-progress.
RB.noLoadProgress = [
  "med-ball-slam", "med-ball-slam-peak", "rot-med-ball", "pullups",
  "side-plank", "pallof", "z2-finish", "z2-mon", "engine-finish", "engine-fri", "engine-peak",
];

RB.runningWeeks = {
  1: {
    tue: { title: "Easy run", duration: "30 min", prescription: "30 min easy", target: "RPE 3–4 · full-sentence pace" },
    wed: { title: "Fartlek", duration: "about 33 min", prescription: "10 min easy + 6 × 1 min brisk / 2 min easy + 5 min easy", target: "RPE 6 on brisk work" },
    sat: { title: "Long easy run", duration: "40 min", prescription: "40 min easy; walk breaks allowed", target: "RPE 3–4" },
  },
  2: {
    tue: { title: "Easy run", duration: "35 min", prescription: "35 min easy", target: "RPE 3–4" },
    wed: { title: "Fartlek", duration: "about 35 min", prescription: "10 min easy + 8 × 1 min brisk / 90 sec easy + 5 min easy", target: "RPE 6 on brisk work" },
    sat: { title: "Long easy run", duration: "45 min", prescription: "45 min easy", target: "RPE 3–4" },
  },
  3: {
    tue: { title: "Easy run", duration: "35 min", prescription: "35 min easy", target: "RPE 3–4" },
    wed: { title: "Fartlek", duration: "35 min", prescription: "10 min easy + 5 × 2 min brisk / 2 min easy + 5 min easy", target: "RPE 6–7" },
    sat: { title: "Long easy run", duration: "50 min", prescription: "50 min easy", target: "RPE 3–4" },
  },
  4: {
    tue: { title: "Easy run", duration: "30 min", prescription: "30 min easy", target: "Deload · RPE 3" },
    wed: { title: "Easy + strides", duration: "25 min", prescription: "25 min easy + 4 × 20 sec relaxed strides", target: "Relaxed, not sprinting" },
    sat: { title: "Long easy run", duration: "40 min", prescription: "40 min easy", target: "Deload · RPE 3" },
  },
  5: {
    tue: { title: "Easy + strides", duration: "40 min", prescription: "40 min easy + 4 × 20 sec relaxed strides", target: "RPE 3–4" },
    wed: { title: "Threshold intervals", duration: "about 37 min", prescription: "10 min easy + 3 × 5 min threshold / 2 min easy + 8 min easy", target: "RPE 7 · short phrases" },
    sat: { title: "Long easy run", duration: "50 min", prescription: "50 min easy", target: "RPE 3–4" },
  },
  6: {
    tue: { title: "Easy + strides", duration: "40 min", prescription: "40 min easy + 5 × 20 sec relaxed strides", target: "RPE 3–4" },
    wed: { title: "Threshold intervals", duration: "about 41 min", prescription: "10 min easy + 4 × 5 min threshold / 2 min easy + 5 min easy", target: "RPE 7" },
    sat: { title: "Long easy run", duration: "55 min", prescription: "55 min easy", target: "RPE 3–4" },
  },
  7: {
    tue: { title: "Easy + strides", duration: "45 min", prescription: "45 min easy + 6 × 20 sec relaxed strides", target: "RPE 3–4" },
    wed: { title: "Threshold intervals", duration: "about 46 min", prescription: "10 min easy + 3 × 8 min threshold / 3 min easy + 6 min easy", target: "RPE 7" },
    sat: { title: "Long easy run", duration: "60 min", prescription: "60 min easy", target: "RPE 3–4" },
  },
  8: {
    tue: { title: "Easy run", duration: "35 min", prescription: "35 min easy", target: "Deload · RPE 3" },
    wed: { title: "Easy + strides", duration: "25 min", prescription: "25 min easy + 4 × 20 sec relaxed strides", target: "Relaxed, not sprinting" },
    sat: { title: "Long easy run", duration: "45 min", prescription: "45 min easy", target: "Deload · RPE 3" },
  },
  9: {
    tue: { title: "Easy + strides", duration: "45 min", prescription: "45 min easy + 6 × 20 sec relaxed strides", target: "RPE 3–4" },
    wed: { title: "Fast intervals", duration: "about 45 min", prescription: "10 min easy + 6 × 3 min fast / 2 min easy + 7 min easy", target: "RPE 8 · strong, not sprinting" },
    sat: { title: "Long easy run", duration: "60 min", prescription: "60 min easy", target: "RPE 3–4" },
  },
  10: {
    tue: { title: "Easy + strides", duration: "45 min", prescription: "45 min easy + 6 × 20 sec relaxed strides", target: "RPE 3–4" },
    wed: { title: "Fast intervals", duration: "about 45 min", prescription: "10 min easy + 5 × 4 min fast / 2 min easy + 7 min easy", target: "RPE 8" },
    sat: { title: "Long easy run", duration: "65 min", prescription: "65 min easy", target: "RPE 3–4" },
  },
  11: {
    tue: { title: "Easy + strides", duration: "45 min", prescription: "45 min easy + 6 × 20 sec relaxed strides", target: "RPE 3–4" },
    wed: { title: "Fast intervals", duration: "about 47 min", prescription: "10 min easy + 4 × 5 min fast / 3 min easy + 8 min easy", target: "RPE 8" },
    sat: { title: "Long easy run", duration: "70 min", prescription: "70 min easy", target: "RPE 3–4" },
  },
  12: {
    tue: { title: "Easy + strides", duration: "35 min", prescription: "35 min easy + 4 × 20 sec relaxed strides", target: "Fresh, not fatigued" },
    wed: { title: "Easy run", duration: "25 min", prescription: "25 min easy", target: "RPE 3" },
    sat: { title: "5K benchmark", duration: "Test day", prescription: "15 min easy warm-up + 5K controlled test + 10 min easy cooldown", target: "Even effort; do not sprint the first mile" },
  },
};

var eggBreakfast = {
  id: "egg-oat-breakfast",
  name: "Eggs, oats & berries",
  timing: "Breakfast",
  macros: { calories: 535, protein: 38, carbs: 64, fat: 14, fiber: 10 },
  ingredients: [
    "Old-fashioned oats — 60 g dry (2.1 oz)",
    "Whole eggs — 2 large (about 100 g without shell)",
    "Liquid egg whites — 150 g (5.3 oz)",
    "Blueberries or mixed berries — 150 g (5.3 oz)",
  ],
  note: "Cook oats with water. Salt, cinnamon, zero-calorie sweetener, ketchup, or hot sauce are fine.",
};

var chickenLunch120 = {
  id: "chicken-rice-120",
  name: "Chicken rice bowl",
  timing: "Lunch",
  macros: { calories: 674, protein: 49, carbs: 85, fat: 14, fiber: 11 },
  ingredients: [
    "Chicken breast — 120 g cooked (4.2 oz)",
    "Brown rice — 220 g cooked (7.8 oz)",
    "Mixed vegetables — 200 g (7.1 oz)",
    "Olive oil — 7 g (1½ tsp)",
    "Teriyaki sauce — 30 g (about 2 tbsp; use your label)",
  ],
};

var yogurtSnack = {
  id: "yogurt-whey-banana",
  name: "Greek yogurt, whey & banana",
  timing: "Snack",
  macros: { calories: 311, protein: 33, carbs: 36, fat: 5, fiber: 3 },
  ingredients: [
    "Plain 2% Greek yogurt — 200 g (7.1 oz)",
    "Whey protein — 15 g (½ typical scoop; use your label)",
    "Banana — 118 g edible portion (1 medium)",
  ],
};

var wheyBananaSnack = {
  id: "whey-banana",
  name: "Whey shake & banana",
  timing: "Snack / pre-training",
  macros: { calories: 225, protein: 25, carbs: 30, fat: 2, fiber: 3 },
  ingredients: [
    "Whey protein — 30 g (1 typical scoop; use your label)",
    "Banana — 118 g edible portion (1 medium)",
    "Water and ice — as desired",
  ],
};

RB.nutritionPlans = {
  mon: {
    focus: "Squat-strength day",
    fuel: "A normal meal 2–3 hours before lifting is enough. The rice bowl works well as the pre-training meal.",
    macros: { calories: 2505, protein: 179, carbs: 299, fat: 67, fiber: 43 },
    meals: [
      eggBreakfast,
      chickenLunch120,
      {
        id: "yogurt-granola-snack",
        name: "Greek yogurt power bowl",
        timing: "Snack",
        macros: { calories: 499, protein: 37, carbs: 62, fat: 13, fiber: 6 },
        ingredients: [
          "Plain 2% Greek yogurt — 200 g (7.1 oz)",
          "Whey protein — 15 g (½ typical scoop; use your label)",
          "Banana — 118 g edible portion (1 medium)",
          "Granola — 40 g (1.4 oz; use your label)",
        ],
      },
      {
        id: "taco-bowl",
        name: "Turkey taco bowls",
        timing: "Family dinner",
        macros: { calories: 796, protein: 55, carbs: 87, fat: 25, fiber: 17 },
        ingredients: [
          "93% lean ground turkey — 120 g cooked (4.2 oz)",
          "Brown rice — 180 g cooked (6.3 oz)",
          "Black beans — 80 g drained (2.8 oz)",
          "Peppers, onions, and corn — 150 g (5.3 oz)",
          "Salsa — 60 g (¼ cup)",
          "Shredded cheese — 21 g (¾ oz)",
          "Avocado — 40 g (1.4 oz)",
        ],
        familyRecipe: {
          yield: "4 generous portions; younger children may eat ½–⅔ portion, leaving lunch leftovers",
          ingredients: [
            "93% lean ground turkey — 620 g raw (about 1.4 lb)",
            "Brown rice — 240 g dry (about 1⅓ cups)",
            "Black beans — 320 g drained (about 1½ cans)",
            "Frozen pepper/onion/corn blend — 600 g",
            "Salsa — 240 g", "Shredded cheese — 84 g", "Avocado — 160 g edible",
          ],
          steps: ["Cook rice.", "Brown turkey with taco seasoning, then add vegetables.", "Build bowls and weigh your cooked portion using the amounts above."],
        },
      },
    ],
  },
  tue: {
    focus: "Easy-run day",
    fuel: "No special fuel is needed if breakfast or lunch was within the prior 2–3 hours. Keep the run conversational.",
    macros: { calories: 2498, protein: 184, carbs: 306, fat: 68, fiber: 45 },
    meals: [
      {
        id: "yogurt-oat-breakfast",
        name: "Greek yogurt oat bowl",
        timing: "Breakfast",
        macros: { calories: 644, protein: 45, carbs: 92, fat: 13, fiber: 9 },
        ingredients: [
          "Plain 2% Greek yogurt — 250 g (8.8 oz)", "Old-fashioned oats — 40 g dry (1.4 oz)",
          "Berries — 150 g (5.3 oz)", "Granola — 20 g (0.7 oz; use your label)",
          "Whey protein — 15 g (½ typical scoop)", "Honey — 23 g (about 1 tbsp)",
        ],
      },
      {
        id: "turkey-sandwich-lunch",
        name: "Turkey sandwich plate",
        timing: "Lunch",
        macros: { calories: 756, protein: 57, carbs: 89, fat: 22, fiber: 16 },
        ingredients: [
          "Whole-grain bread — 2 slices (about 86 g total; use your label)", "Deli turkey — 140 g (4.9 oz)",
          "Cheddar cheese — 21 g (¾ oz)", "Avocado — 30 g (1.1 oz)",
          "Raw vegetables or side salad — 100 g (3.5 oz)", "Apple — 180 g edible (1 medium)",
          "Plain 2% Greek yogurt — 150 g (5.3 oz)",
        ],
      },
      wheyBananaSnack,
      {
        id: "sheet-pan-chicken",
        name: "Sheet-pan chicken & potatoes",
        timing: "Family dinner",
        macros: { calories: 874, protein: 56, carbs: 96, fat: 31, fiber: 16 },
        ingredients: [
          "Chicken breast — 140 g cooked (4.9 oz)", "Roasted potatoes — 230 g cooked (8.1 oz)",
          "Broccoli — 200 g (7.1 oz)", "Olive oil — 21 g (1½ tbsp total on your portion)",
          "Tzatziki — 45 g (3 tbsp)", "Apple — 180 g edible (1 medium)",
        ],
        familyRecipe: {
          yield: "4 generous portions",
          ingredients: ["Chicken breast — 730 g raw (about 1.6 lb)", "Baby potatoes — 920 g (about 2 lb)", "Broccoli — 800 g", "Olive oil — 84 g", "Tzatziki — 180 g", "Apples — 4 medium"],
          steps: ["Roast potatoes and broccoli at 425°F until nearly tender.", "Add seasoned chicken and cook to 165°F.", "Weigh your food after cooking and add tzatziki."],
        },
      },
    ],
  },
  wed: {
    focus: "Quality-run day",
    fuel: "Eat the banana 30–90 minutes before running and have the whey/yogurt after if dinner is not soon.",
    macros: { calories: 2503, protein: 179, carbs: 305, fat: 66, fiber: 43 },
    meals: [
      eggBreakfast,
      chickenLunch120,
      yogurtSnack,
      {
        id: "spaghetti-dinner",
        name: "Spaghetti & meat sauce",
        timing: "Family dinner",
        macros: { calories: 983, protein: 58, carbs: 119, fat: 32, fiber: 20 },
        ingredients: [
          "93% lean ground beef — 120 g cooked (4.2 oz)", "Whole-wheat pasta — 200 g cooked (7.1 oz)",
          "Marinara — 150 g (5.3 oz; use your label)", "Parmesan — 15 g (0.5 oz)",
          "Side salad — 150 g (5.3 oz)", "Olive oil dressing — 7 g (1½ tsp)",
          "Whole-grain bread — 1 slice (about 43 g)", "Honey — 10 g on the toast",
        ],
        familyRecipe: {
          yield: "4 generous portions",
          ingredients: ["93% lean ground beef — 620 g raw (about 1.4 lb)", "Whole-wheat pasta — 360 g dry", "Marinara — 600 g", "Side salad — 600 g", "Parmesan — 60 g", "Olive oil — 28 g", "Whole-grain bread — 4 slices", "Honey — 40 g"],
          steps: ["Brown beef and stir in marinara.", "Boil pasta; reserve some pasta water before draining.", "Weigh your cooked pasta and beef sauce separately for the portion above."],
        },
      },
    ],
  },
  thu: {
    focus: "Hinge-strength day",
    fuel: "Use the sandwich breakfast or rice bowl as your pre-training meal. No additional RDLs today.",
    macros: { calories: 2480, protein: 180, carbs: 312, fat: 61, fiber: 48 },
    meals: [
      {
        id: "egg-sandwich-breakfast",
        name: "Egg-and-cheese breakfast sandwich",
        timing: "Breakfast",
        macros: { calories: 632, protein: 43, carbs: 69, fat: 20, fiber: 9 },
        ingredients: ["Whole eggs — 2 large", "Liquid egg whites — 150 g (5.3 oz)", "Whole-grain bread — 2 slices (about 86 g)", "Cheddar cheese — 21 g (¾ oz)", "Banana — 118 g edible (1 medium)"],
      },
      {
        id: "tuna-rice-lunch",
        name: "Tuna, rice & bean bowl",
        timing: "Lunch",
        macros: { calories: 646, protein: 49, carbs: 89, fat: 11, fiber: 16 },
        ingredients: ["Tuna in water — 120 g drained (4.2 oz)", "Brown rice — 180 g cooked (6.3 oz)", "Black beans — 80 g drained (2.8 oz)", "Mixed vegetables — 200 g (7.1 oz)", "Olive oil — 7 g (1½ tsp)", "Salsa — 60 g (¼ cup)"],
      },
      wheyBananaSnack,
      {
        id: "shrimp-stir-fry",
        name: "Shrimp & edamame stir-fry",
        timing: "Family dinner",
        macros: { calories: 977, protein: 63, carbs: 125, fat: 27, fiber: 20 },
        ingredients: ["Shrimp — 140 g cooked (4.9 oz)", "Brown rice — 200 g cooked (7.1 oz)", "Stir-fry vegetables — 250 g (8.8 oz)", "Shelled edamame — 100 g (3.5 oz)", "Teriyaki sauce — 45 g (3 tbsp)", "Olive or avocado oil — 17 g (about 1¼ tbsp)", "Whole-grain toast — 1 slice with 7 g honey"],
        familyRecipe: {
          yield: "4 generous portions",
          ingredients: ["Peeled shrimp — 620 g raw (about 1.4 lb)", "Brown rice — 270 g dry", "Frozen stir-fry vegetables — 1,000 g", "Shelled edamame — 400 g", "Teriyaki sauce — 180 g", "Oil — 68 g", "Whole-grain bread — 4 slices", "Honey — 28 g"],
          steps: ["Cook rice.", "Stir-fry vegetables and edamame, then add shrimp until just cooked.", "Add measured sauce and oil; plate your exact cooked weights."],
        },
      },
    ],
  },
  fri: {
    focus: "Functional-bodybuilding day",
    fuel: "Keep the finisher controlled. Today is not a license to empty the tank before Saturday's long run.",
    macros: { calories: 2572, protein: 180, carbs: 320, fat: 70, fiber: 39 },
    meals: [
      {
        id: "yogurt-oat-breakfast",
        name: "Greek yogurt oat bowl",
        timing: "Breakfast",
        macros: { calories: 644, protein: 45, carbs: 92, fat: 13, fiber: 9 },
        ingredients: ["Plain 2% Greek yogurt — 250 g", "Old-fashioned oats — 40 g dry", "Berries — 150 g", "Granola — 20 g", "Whey protein — 15 g", "Honey — 23 g"],
      },
      {
        id: "turkey-sandwich-light",
        name: "Turkey sandwich plate",
        timing: "Lunch",
        macros: { calories: 628, protein: 45, carbs: 87, fat: 14, fiber: 16 },
        ingredients: ["Whole-grain bread — 2 slices (about 86 g)", "Deli turkey — 100 g (3.5 oz)", "Avocado — 30 g (1.1 oz)", "Raw vegetables — 100 g", "Apple — 180 g edible", "Plain 2% Greek yogurt — 150 g"],
      },
      yogurtSnack,
      {
        id: "burger-dinner",
        name: "Burger, oven fries & salad",
        timing: "Family dinner",
        macros: { calories: 990, protein: 57, carbs: 105, fat: 38, fiber: 11 },
        ingredients: ["93% lean beef patty — 140 g cooked (4.9 oz)", "Whole-grain bun — 1 bun (use your label)", "Cheddar cheese — 21 g (¾ oz)", "Frozen oven fries — 200 g (7.1 oz; use your label)", "Side salad — 100 g", "Olive oil dressing — 5 g (1 tsp)", "Ketchup or salsa — 30 g"],
        familyRecipe: {
          yield: "4 generous portions",
          ingredients: ["93% lean ground beef — 730 g raw (about 1.6 lb)", "Whole-grain buns — 4", "Cheddar cheese — 84 g", "Frozen oven fries — 800 g", "Salad — 400 g", "Olive oil — 20 g", "Ketchup or salsa — 120 g"],
          steps: ["Form and cook four patties to a safe internal temperature.", "Bake or air-fry the measured fries.", "Weigh your cooked patty and fries before serving."],
        },
      },
    ],
  },
  sat: {
    focus: "Long-run day",
    fuel: "Have the banana and part of the shake 30–90 minutes before running if tolerated; finish the rest afterward.",
    macros: { calories: 2474, protein: 181, carbs: 299, fat: 69, fiber: 46 },
    meals: [
      {
        id: "long-run-shake",
        name: "Long-run smoothie",
        timing: "Split before and after training",
        macros: { calories: 753, protein: 49, carbs: 89, fat: 27, fiber: 11 },
        ingredients: ["Whey protein — 30 g", "2% milk — 300 ml (10.1 fl oz)", "Old-fashioned oats — 35 g dry", "Banana — 118 g edible", "Berries — 100 g", "Peanut butter — 32 g (2 tbsp)"],
        note: "If this feels heavy before running, have the banana first and blend the remaining ingredients afterward.",
      },
      {
        id: "chicken-rice-90",
        name: "Chicken rice bowl",
        timing: "Lunch",
        macros: { calories: 624, protein: 40, carbs: 85, fat: 13, fiber: 11 },
        ingredients: ["Chicken breast — 90 g cooked (3.2 oz)", "Brown rice — 220 g cooked (7.8 oz)", "Mixed vegetables — 200 g", "Olive oil — 7 g", "Teriyaki sauce — 30 g"],
      },
      wheyBananaSnack,
      {
        id: "fajita-dinner",
        name: "Chicken fajitas",
        timing: "Family dinner",
        macros: { calories: 872, protein: 67, carbs: 95, fat: 27, fiber: 22 },
        ingredients: ["Chicken breast — 120 g cooked (4.2 oz)", "Medium tortillas — 2 (use your label)", "Peppers and onions — 200 g", "Black beans — 80 g drained", "Shredded cheese — 21 g", "Avocado — 40 g", "Salsa — 60 g", "Plain Greek yogurt — 30 g"],
        familyRecipe: {
          yield: "4 generous portions",
          ingredients: ["Chicken breast — 640 g raw (about 1.4 lb)", "Medium tortillas — 8", "Peppers and onions — 800 g", "Black beans — 320 g drained", "Shredded cheese — 84 g", "Avocado — 160 g edible", "Salsa — 240 g", "Plain Greek yogurt — 120 g"],
          steps: ["Cook seasoned chicken and sliced vegetables.", "Warm tortillas.", "Build your two fajitas using the exact cooked portions above."],
        },
      },
    ],
  },
  sun: {
    focus: "Rest and shopping day",
    fuel: "Hydrate, shop, and keep the meal pattern steady. Do not slash calories because it is a rest day.",
    macros: { calories: 2504, protein: 177, carbs: 308, fat: 68, fiber: 53 },
    meals: [
      eggBreakfast,
      {
        id: "tuna-rice-lunch",
        name: "Tuna, rice & bean bowl",
        timing: "Lunch",
        macros: { calories: 646, protein: 49, carbs: 89, fat: 11, fiber: 16 },
        ingredients: ["Tuna in water — 120 g drained", "Brown rice — 180 g cooked", "Black beans — 80 g drained", "Mixed vegetables — 200 g", "Olive oil — 7 g", "Salsa — 60 g"],
      },
      {
        id: "cottage-snack",
        name: "Cottage cheese, apple & granola",
        timing: "Snack",
        macros: { calories: 358, protein: 27, carbs: 46, fat: 9, fiber: 6 },
        ingredients: ["2% cottage cheese — 200 g (7.1 oz)", "Apple — 180 g edible (1 medium)", "Granola — 20 g (0.7 oz)"],
      },
      {
        id: "chili-dinner",
        name: "Turkey chili & cornbread",
        timing: "Family dinner",
        macros: { calories: 966, protein: 64, carbs: 109, fat: 34, fiber: 21 },
        ingredients: ["93% lean ground turkey — 100 g cooked (3.5 oz)", "Black or kidney beans — 150 g drained", "Crushed tomatoes — 200 g", "Corn — 80 g", "Shredded cheese — 21 g", "Plain Greek yogurt — 75 g", "Cornbread — 60 g", "Avocado — 60 g", "Honey — 5 g on cornbread"],
        note: "This is the highest-fiber day. If your stomach is not accustomed to it, halve the beans and replace them with an equal cooked weight of rice for the first two weeks.",
        familyRecipe: {
          yield: "4 generous portions plus likely leftovers",
          ingredients: ["93% lean ground turkey — 520 g raw (about 1.1 lb)", "Black or kidney beans — 600 g drained", "Crushed tomatoes — 800 g", "Corn — 320 g", "Shredded cheese — 84 g", "Plain Greek yogurt — 300 g", "Prepared cornbread — 240 g", "Avocado — 240 g edible", "Honey — 20 g"],
          steps: ["Brown turkey with chili seasoning.", "Add beans, tomatoes, and corn; simmer 20–30 minutes.", "Weigh your bowl components and toppings using the portions above."],
        },
      },
    ],
  },
};

RB.shoppingList = [
  {
    category: "Protein & dairy",
    items: [
      ["Chicken breast", "Buy about 4 lb / 1.8 kg raw"], ["93% lean ground turkey", "Buy about 2.5 lb / 1.15 kg raw"],
      ["93% lean ground beef", "Buy about 3 lb / 1.35 kg raw"], ["Peeled shrimp", "Buy about 1.5 lb / 680 g raw"],
      ["Deli turkey", "240 g / 8.5 oz"], ["Tuna in water", "2 standard cans; need 240 g drained"],
      ["Whole eggs", "1 dozen"], ["Liquid egg whites", "1 carton; need 600 g / 21 oz"],
      ["Plain 2% Greek yogurt", "Two 32-oz tubs; need about 1.82 kg total"], ["2% cottage cheese", "1 small tub; need 200 g"],
      ["Whey protein", "195 g for the week; confirm scoop weight on label"], ["Cheddar cheese", "Buy 14 oz / 400 g"],
      ["Parmesan", "60 g / 2.1 oz"], ["Shelled edamame", "400 g / 14 oz frozen"],
    ],
  },
  {
    category: "Carbohydrates",
    items: [
      ["Old-fashioned oats", "295 g needed; one 18-oz container is plenty"], ["Brown rice", "About 850 g dry / 1.9 lb"],
      ["Whole-wheat pasta", "360 g dry; buy one 1-lb box"], ["Whole-grain bread", "At least 14 slices; buy one loaf"],
      ["Whole-grain buns", "4"], ["Medium tortillas", "8"], ["Baby potatoes", "920 g / about 2 lb"],
      ["Frozen oven fries", "800 g / about 28 oz"], ["Granola", "100 g; use the same product all week"],
      ["Prepared cornbread or mix", "240 g prepared"], ["Black/kidney beans", "6 standard cans; need about 1.4 kg drained"],
    ],
  },
  {
    category: "Produce",
    items: [
      ["Berries", "850 g / about 2 lb; frozen is fine"], ["Bananas", "8 medium"], ["Apples", "7 medium"],
      ["Avocados", "About 620 g edible; usually 4–5 large"], ["Frozen mixed vegetables", "About 2.2 kg / 5 lb"],
      ["Broccoli", "800 g / 28 oz"], ["Peppers and onions", "About 1.4 kg / 3 lb"],
      ["Bagged salad", "About 1 kg / 2.2 lb"], ["Corn", "320 g plus any corn included in taco vegetable mix"],
      ["Crushed tomatoes", "One 28-oz / 800 g can"],
    ],
  },
  {
    category: "Sauces & pantry",
    items: [
      ["Olive or avocado oil", "About 235 g / 260 ml"], ["Teriyaki sauce", "270 g; use label values"],
      ["Salsa", "About 720 g / 25 oz"], ["Marinara", "600 g / about 21 oz"],
      ["Tzatziki", "180 g / 6.3 oz"], ["Honey", "About 135 g"], ["Peanut butter", "32 g / 2 tbsp"],
      ["Taco and chili seasoning", "Check sodium and use to taste"],
    ],
  },
];

RB.measurementRules = [
  "Chicken, beef, turkey, shrimp, rice, pasta, and potatoes are listed as cooked weights on your plate.",
  "Oats and dry rice/pasta in family recipes are dry weights.",
  "Fruit weights mean edible portions without peel, core, or pits.",
  "Use the package label for whey, bread, tortillas, granola, sauces, fries, buns, and cornbread; brands can differ substantially.",
  "The daily target is an average, not a precision contest. Staying within about 75 calories while reaching at least 175 g protein is on plan.",
];
