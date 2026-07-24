/* REBUILD — standalone PWA app logic (vanilla, no build) */
(function () {
  "use strict";

  var STORAGE_KEY = "rebuild-hybrid-v1";

  var initialState = {
    currentWeek: 1,
    workoutLogs: {},      // `${week}:${day}:${exId}:${setNo}` -> {weight,reps,rpe,done}
    runLogs: {},          // `${week}:${day}` -> {distance,pace,rpe}
    completedWorkouts: {},
    completedMeals: {},
    shoppingChecks: {},
    checkIns: [],
    benchmarks: { fiveK: "", pullups: "10", easyPace: "10:00" },
    benchmarkLog: {},
    exerciseSwaps: {},
    readiness: { date: "", sleep: "7", soreness: "low" },
    profile: {
      onboarded: false,
      program: "hybrid",
      startDate: "",
      age: "", sex: "male", heightIn: "", weight: "", goalWeight: "",
      activity: "light",
      pushups: "", pullups: "", squats: "", plank: "", runTest: "",
      lifts: {},
      goal: "lose",
      diet: "omnivore",
    },
  };

  var tabLabels = { home: "Home", today: "Today", workouts: "Workouts", nutrition: "Nutrition", progress: "Progress" };
  var tabIcons = { home: "⌂", today: "●", workouts: "▰", nutrition: "◆", progress: "↗" };

  // ---- persisted + ephemeral state ----
  var store = clone(initialState);
  var ui = {
    tab: "today",
    selectedDay: "mon",
    nutritionDay: "mon",
    nutritionMode: "plan",
    sleep: "7",
    soreness: "low",
    checkWeight: "200",
    checkWaist: "",
    checkSleep: "6.8",
    bodyMetric: "weight",
    trainMetric: "volume",
    onboardStep: 0,
    draft: null,
    quickPick: null,
    swapOpen: null,
  };
  // One rest timer runs at a time; it lives in whichever exercise card you just
  // completed a set in. restState.exId identifies that card's display element.
  var restInterval = null;
  var restState = { exId: null, remaining: 0 };
  var toastTimeout = null;

  // ---- utilities ----
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (e) { /* storage full or unavailable */ }
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) store = Object.assign(clone(initialState), JSON.parse(raw));
    } catch (e) {
      toast("Your saved data could not be read. New entries will still work.");
      store = clone(initialState);
    }
    // Repair partial/legacy/hand-edited saves so a missing or wrong-typed
    // field can never render "undefined" or throw later.
    store.benchmarks = Object.assign(clone(initialState.benchmarks), store.benchmarks || {});
    store.readiness = Object.assign(clone(initialState.readiness), store.readiness || {});
    store.profile = Object.assign(clone(initialState.profile), store.profile || {});
    if (!Array.isArray(store.checkIns)) store.checkIns = [];
    ["workoutLogs", "runLogs", "completedWorkouts", "completedMeals", "shoppingChecks", "benchmarkLog", "exerciseSwaps"].forEach(function (k) {
      if (!store[k] || typeof store[k] !== "object") store[k] = {};
    });
    // Migrate the old free-text benchmarks into the dated benchmark log once.
    if (!Object.keys(store.benchmarkLog).length && store.benchmarks) {
      var today0 = todayISO();
      var f5 = parseTime(store.benchmarks.fiveK);
      if (f5) store.benchmarkLog.run5k = [{ date: today0, value: f5 }];
      var pu = toNum(store.benchmarks.pullups);
      if (pu) store.benchmarkLog.pullups = [{ date: today0, value: pu }];
    }
    var w = Number(store.currentWeek);
    store.currentWeek = w >= 1 && w <= 12 ? Math.floor(w) : 1;
  }

  // ================= personalization engine =================
  function programById(id) {
    for (var i = 0; i < RB.programs.length; i++) if (RB.programs[i].id === id) return RB.programs[i];
    return RB.programs[0];
  }
  function goalById(id) {
    for (var i = 0; i < RB.goals.length; i++) if (RB.goals[i].id === id) return RB.goals[i];
    return RB.goals[0];
  }
  function dietById(id) {
    for (var i = 0; i < RB.diets.length; i++) if (RB.diets[i].id === id) return RB.diets[i];
    return RB.diets[0];
  }

  // "12:30" -> 750 seconds; a bare number is read as minutes.
  function parseTime(str) {
    if (!str) return 0;
    var m = String(str).trim().match(/^(\d+):(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    var n = parseFloat(str);
    return isFinite(n) ? n * 60 : 0;
  }
  // Score one field test 0–3 against its bands. null = not answered.
  function testScore(t, raw) {
    var v = t.time ? parseTime(raw) : toNum(raw);
    if (t.id === "pullups" && String(raw).trim() === "0") v = 0.0001; // 0 is a real answer
    if (!v || v < 0) return null;
    var s = 0;
    for (var i = 0; i < t.bands.length; i++) {
      if (t.reverse ? v <= t.bands[i] : v >= t.bands[i]) s = i + 1;
    }
    return s;
  }
  // Only the tests actually answered count, so skipping one doesn't tank the
  // result. Score is expressed as a percentage of what was attempted.
  function fitnessScore(p) {
    var got = 0, max = 0, answered = 0;
    RB.baselineTests.forEach(function (t) {
      var s = testScore(t, p[t.id]);
      if (s === null) return;
      answered++; got += s; max += 3;
    });
    return { got: got, max: max, answered: answered, pct: max ? got / max : 0 };
  }
  function fitnessTier(p) {
    var sc = fitnessScore(p);
    function T(n, name, setScale, runPct, note) {
      return { n: n, name: name, setScale: setScale, runPct: runPct, note: note,
        score: sc.got, maxScore: sc.max, answered: sc.answered };
    }
    if (!sc.answered) return T(2, "Rebuild", 0.8, 85,
      "No assessment results yet, so you're starting at a moderate default. Fill in the baseline tests and the program will size itself to you.");
    if (sc.pct < 0.30) return T(1, "Restart", 0.6, 70,
      "Your assessment says start light. Sets are trimmed, power work is removed, and runs are run/walk — aim for about 70% of the listed time. Build the habit first; the loads climb on their own.");
    if (sc.pct < 0.55) return T(2, "Rebuild", 0.8, 85,
      "You have a base but it needs re-lighting. Volume is slightly reduced and runs target about 85% of the listed time for the first block.");
    if (sc.pct < 0.85) return T(3, "Standard", 1, 100,
      "You're fit enough for the program as written. Run the sets, reps and times exactly as prescribed.");
    return T(4, "Advanced", 1.15, 110,
      "Strong starting point. An extra set is added to the main lifts and you can run the top of every range.");
  }

  // % of 1RM you can hold for N maximal reps, interpolated from RB.repPct.
  function pctForReps(n) {
    var t = RB.repPct;
    if (n <= t[0][0]) return t[0][1];
    for (var i = 1; i < t.length; i++) {
      if (n <= t[i][0]) {
        var a = t[i - 1], b = t[i];
        return a[1] + ((n - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      }
    }
    return t[t.length - 1][1];
  }
  // How many reps the prescription leaves in the tank, read from its target
  // text ("RPE 6–7" -> 3.5 RIR, "2 in reserve" -> 2).
  function targetRIR(target) {
    var s = String(target || "");
    var m = s.match(/RPE\s*(\d+(?:\.\d+)?)(?:\s*[–—-]\s*(\d+(?:\.\d+)?))?/i);
    if (m) {
      var lo = parseFloat(m[1]);
      var hi = m[2] ? parseFloat(m[2]) : lo;
      return Math.max(0, 10 - (lo + hi) / 2);
    }
    var r = s.match(/(\d+)\s*(?:in reserve|shy)/i);
    if (r) return parseFloat(r[1]);
    return 3;
  }
  // Reps a prescription asks for. Ranges use the TOP number so the derived
  // load stays conservative (you can always add weight, not un-hurt yourself).
  function repsForLoad(reps) {
    var nums = String(reps || "").match(/\d+/g);
    if (!nums) return 8;
    var vals = nums.map(Number).filter(function (n) { return n > 0 && n <= 30; });
    return vals.length ? Math.max.apply(null, vals) : 8;
  }

  // Working weight for a lift, derived from the entered 1-rep max:
  //   1RM × %(prescribed reps + reps in reserve) × movement ratio
  function seedLoadFor(exId, reps, rir) {
    var map = RB.seedMap[exId];
    if (!map) return 0;
    var lifts = (store.profile && store.profile.lifts) || {};
    var oneRM = toNum(lifts[map.s]);
    if (!oneRM) return 0;
    var eff = repsForLoad(reps) + (rir === undefined ? 3 : rir);
    var out = roundLoad(oneRM * pctForReps(eff) * map.f);
    // Hard safety cap: never prescribe more than 90% of a stated max.
    if (map.f >= 1 && out > oneRM * 0.9) out = roundLoad(oneRM * 0.9);
    return out;
  }
  function seedLabelFor(seedId) {
    for (var i = 0; i < RB.liftSeeds.length; i++) if (RB.liftSeeds[i].id === seedId) return RB.liftSeeds[i].label;
    return seedId;
  }
  // Week-1 prescription for a movement, used for the onboarding preview.
  function week1Rx(exId) {
    var b = RB.strengthBlocks[0], found = null;
    ["mon", "thu", "fri"].forEach(function (dk) {
      var day = b.days[dk];
      if (!day) return;
      day.exercises.forEach(function (x) { if (x.id === exId && x.wk[0]) found = x.wk[0]; });
    });
    return found;
  }
  function scaleSets(sets, tier) {
    if (sets <= 1) return sets;
    return Math.max(2, Math.min(6, Math.round(sets * tier.setScale)));
  }

  // Mifflin–St Jeor -> TDEE -> goal-adjusted calories and macros.
  function nutritionTargets(p) {
    var lb = toNum(p.weight), inch = toNum(p.heightIn), age = toNum(p.age) || 30;
    if (!lb || !inch) return null;
    var kg = lb * 0.45359, cm = inch * 2.54;
    var bmr = p.sex === "female" ? (10 * kg + 6.25 * cm - 5 * age - 161) : (10 * kg + 6.25 * cm - 5 * age + 5);
    var prog = programById(p.program);
    var actAdj = { sedentary: -0.10, light: 0, active: 0.10, veryactive: 0.18 }[p.activity] || 0;
    var tdee = bmr * (prog.activityFactor * (1 + actAdj));
    var goal = goalById(p.goal);
    var cal = tdee * (1 + goal.calAdj);
    var protein = kg * goal.proteinPerKg;
    var fat = kg * 0.9;
    var carbs = Math.max(80, (cal - protein * 4 - fat * 9) / 4);
    return {
      bmr: Math.round(bmr), tdee: Math.round(tdee),
      calories: Math.round(cal / 10) * 10,
      protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs),
      fiber: Math.max(25, Math.round(cal / 1000 * 14)),
    };
  }

  // Where the user is in their program, from the chosen start date.
  function programProgress(p) {
    if (!p.startDate) return null;
    var start = new Date(p.startDate + "T00:00:00");
    if (isNaN(start.getTime())) return null;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var days = Math.floor((now - start) / 86400000);
    var total = programById(p.program).weeks;
    if (days < 0) return { status: "upcoming", daysUntil: -days, week: 1, total: total };
    var wk = Math.floor(days / 7) + 1;
    if (wk > total) return { status: "complete", week: total, total: total, days: days };
    return { status: "active", week: wk, total: total, days: days, dayOfWeek: (days % 7) + 1 };
  }

  // Keep the active week in step with the calendar so opening the app in
  // week 3 lands on week 3. Browsing other weeks still works; it re-syncs
  // on the next load.
  function syncWeekFromStart() {
    var pr = programProgress(store.profile);
    if (!pr) return;
    if (pr.status === "active") store.currentWeek = pr.week;
    else if (pr.status === "upcoming") store.currentWeek = 1;
  }

  // ---- meal adaptation: portion scaling + dietary swaps ----
  function scaleAmounts(text, f) {
    if (!f || Math.abs(f - 1) < 0.02) return text;
    return String(text)
      .replace(/(\d+(?:\.\d+)?)\s*(g|ml)\b/g, function (m, n, u) { return Math.round(parseFloat(n) * f) + " " + u; })
      .replace(/\((\d+(?:\.\d+)?)\s*(fl oz|oz)\)/g, function (m, n, u) { return "(" + (Math.round(parseFloat(n) * f * 10) / 10) + " " + u + ")"; });
  }
  // Longest keys first so "cottage cheese" wins over "cheese".
  function swapKeys(diet) {
    var swaps = RB.dietSwaps[diet];
    if (!swaps) return [];
    return Object.keys(swaps).sort(function (a, b) { return b.length - a.length; });
  }
  function applyDietToIngredient(line, diet) {
    if (!diet || diet === "omnivore") return line;
    var swaps = RB.dietSwaps[diet];
    if (!swaps) return line;
    var lower = String(line).toLowerCase();
    var keys = swapKeys(diet);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (lower.indexOf(key) === -1) continue;
      var base = RB.proteinFoods[key], sw = swaps[key];
      // If the food is only a minor component mentioned mid-line (e.g. "toast
      // with honey"), swap just that word and keep the rest of the line intact.
      if (lower.split("—")[0].indexOf(key) === -1) {
        return String(line).replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), sw.name);
      }
      // Flavour/fat items swap 1:1; real protein sources get portion-matched
      // so the meal keeps roughly the same protein.
      var ratio = sw.keepAmount ? 1 : ((base && sw.p) ? (base.p / sw.p) : 1);
      var m = String(line).match(/(\d+(?:\.\d+)?)\s*g\b/);
      if (m) return sw.name + " — " + Math.round(parseFloat(m[1]) * ratio) + " g";
      // No weight in the original line (e.g. "2 large") — use the swap's own
      // sensible portion rather than leaving it with no quantity at all.
      if (sw.amount) return sw.name + " — " + sw.amount;
      var parts = String(line).split("—");
      return sw.name + (parts.length > 1 ? " —" + parts.slice(1).join("—") : "");
    }
    return line;
  }
  function mealIsAdapted(meal, diet) {
    if (!diet || diet === "omnivore") return false;
    var keys = swapKeys(diet);
    var hay = (meal.ingredients || []).join(" | ").toLowerCase();
    for (var i = 0; i < keys.length; i++) if (hay.indexOf(keys[i]) !== -1) return true;
    return false;
  }
  function scaleMacros(m, f) {
    return {
      calories: Math.round(m.calories * f), protein: Math.round(m.protein * f),
      carbs: Math.round(m.carbs * f), fat: Math.round(m.fat * f), fiber: Math.round(m.fiber * f),
    };
  }
  // The nutrition plan for a day, resized to the user's calorie target and
  // rewritten for their dietary preference.
  function adaptedPlan(dayKey) {
    var base = RB.nutritionPlans[dayKey];
    var p = store.profile;
    var t = p.onboarded ? nutritionTargets(p) : null;
    var f = (t && base.macros.calories) ? t.calories / base.macros.calories : 1;
    var diet = p.diet || "omnivore";
    return {
      focus: base.focus, fuel: base.fuel,
      factor: f, targets: t, diet: diet,
      macros: Math.abs(f - 1) < 0.02 ? base.macros : scaleMacros(base.macros, f),
      meals: base.meals.map(function (meal) {
        var renamed = (RB.mealNames[diet] && RB.mealNames[diet][meal.id]) || meal.name;
        return {
          id: meal.id, name: renamed, timing: meal.timing, note: meal.note,
          adapted: mealIsAdapted(meal, diet),
          macros: Math.abs(f - 1) < 0.02 ? meal.macros : scaleMacros(meal.macros, f),
          ingredients: meal.ingredients.map(function (ing) {
            return applyDietToIngredient(scaleAmounts(ing, f), diet);
          }),
          familyRecipe: meal.familyRecipe ? {
            yield: meal.familyRecipe.yield,
            steps: meal.familyRecipe.steps,
            ingredients: meal.familyRecipe.ingredients.map(function (ing) {
              return applyDietToIngredient(ing, diet);
            }),
          } : null,
        };
      }),
    };
  }

  function todayKey() {
    var map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return map[new Date().getDay()];
  }

  function dayLabel(key) {
    for (var i = 0; i < RB.days.length; i++) if (RB.days[i].key === key) return RB.days[i].label;
    return key;
  }

  // Map a program week to its strength block. Build weeks live in block.weeks
  // (index 0–2 = week 1/2/3 of the block); deload weeks match block.deloadWeek.
  function blockForWeek(week) {
    for (var i = 0; i < RB.strengthBlocks.length; i++) {
      var b = RB.strengthBlocks[i];
      var idx = b.weeks.indexOf(week);
      if (idx !== -1) return { block: b, idx: idx, deload: false };
      if (b.deloadWeek === week) return { block: b, idx: -1, deload: true };
    }
    return null;
  }

  function phaseForWeek(week) {
    var info = blockForWeek(week);
    if (!info) return "Rebuild";
    if (info.deload) return week === 12 ? "Test" : "Deload";
    return info.block.name;
  }

  // Resolve the concrete strength session for a given day + week from the
  // periodized blocks: picks each movement's prescription for that week and
  // drops movements that aren't run that week (wk[idx]/deload === null).
  function strengthSessionFor(day, week) {
    var info = blockForWeek(week);
    var b = info.block;
    var dayDef = b.days[day];
    var exercises = [];
    // The baseline assessment scales how much work is prescribed.
    var prof = store.profile;
    var tier = prof.onboarded ? fitnessTier(prof) : null;
    var weakPull = prof.onboarded && toNum(prof.pullups) < 3;
    dayDef.exercises.forEach(function (ex) {
      var pres = info.deload ? ex.deload : ex.wk[info.idx];
      if (!pres) return;
      // Tier 1 skips explosive power work until a base exists.
      if (tier && tier.n === 1 && /med-ball/.test(ex.id)) return;
      var name = ex.name, cue = ex.cue;
      // Can't do 3 strict pull-ups yet — swap in a version that builds them.
      if (weakPull && /pullup|chinup/.test(ex.id)) {
        name = "Assisted " + (/chinup/.test(ex.id) ? "chin-up" : "pull-up") + " (band or machine)";
        cue = "Use a band, the assist machine, or lat pulldown. Add slow negatives as you get stronger.";
      }
      exercises.push({
        id: ex.id, name: name, cue: cue, group: ex.group,
        tempo: ex.tempo, rest: ex.rest,
        sets: tier ? scaleSets(pres.sets, tier) : pres.sets,
        reps: pres.reps, target: pres.target,
      });
    });
    return {
      kind: "strength",
      title: dayDef.title,
      subtitle: dayDef.subtitle,
      duration: dayDef.duration,
      exercises: exercises,
      chip: info.deload ? (week === 12 ? "Test week · taper" : b.name + " · Deload") : b.name + " · Wk " + (info.idx + 1) + "/3",
      note: info.deload ? b.deloadNote : b.weekNotes[info.idx],
    };
  }

  // ---- automatic load progression ----
  function loadStepFor(exId) {
    var s = RB.loadStep && RB.loadStep[exId];
    return typeof s === "number" ? s : (RB.loadStepDefault || 5);
  }
  function roundLoad(v) { return Math.round(v / 5) * 5; }

  // Find the most recent week (before `week`) this movement was actually loaded.
  // Follows RB.loadLineage so a lift carries across block changes. Returns the
  // top working weight of that session and the hardest RPE recorded in it.
  function lastSessionFor(exId, week) {
    var chain = [exId], cur = exId, guard = 0;
    while (RB.loadLineage && RB.loadLineage[cur] && guard++ < 5) { cur = RB.loadLineage[cur]; chain.push(cur); }
    for (var c = 0; c < chain.length; c++) {
      var id = chain[c], bestWeek = 0, top = 0, maxRpe = 0;
      Object.keys(store.workoutLogs).forEach(function (k) {
        var p = k.split(":");
        var wk = parseInt(p[0], 10);
        if (p[2] !== id || !(wk >= 1 && wk < week)) return;
        var wt = parseFloat(store.workoutLogs[k].weight);
        if (!isFinite(wt) || wt <= 0) return;
        if (wk > bestWeek) { bestWeek = wk; top = 0; maxRpe = 0; }
        if (wk === bestWeek) {
          if (wt > top) top = wt;
          var r = parseFloat(store.workoutLogs[k].rpe);
          if (isFinite(r) && r > maxRpe) maxRpe = r;
        }
      });
      if (bestWeek > 0) return { week: bestWeek, top: top, rpe: maxRpe, viaId: id };
    }
    return null;
  }

  // Equipment swap for a movement: its pattern's alternative pool, plus the
  // display name (the chosen alternative, or the original recommendation).
  function swapInfo(exId, exName) {
    var pattern = RB.exercisePattern[exId];
    var pool = pattern ? (RB.altPool[pattern] || []) : [];
    var chosen = store.exerciseSwaps[exId];
    var name = exName, swapped = false;
    if (chosen) {
      for (var i = 0; i < pool.length; i++) if (pool[i].id === chosen) { name = pool[i].name; swapped = true; break; }
    }
    return { pool: pool, hasAlts: pool.length > 0, displayName: name, swapped: swapped };
  }

  // Turn that history into a concrete load target for this week:
  //   normal   -> last top + the lift's step
  //   RPE 9+   -> repeat the same weight (it was already maximal)
  //   deload   -> ~85% of last top
  function suggestLoad(ex, week) {
    if (RB.noLoadProgress && RB.noLoadProgress.indexOf(ex.id) !== -1) return null;
    var info = blockForWeek(week);
    var deload = !!(info && info.deload);
    var last = lastSessionFor(ex.id, week);
    // Nothing logged yet — derive the load from the 1RM in the assessment.
    if (!last) {
      var seed = seedLoadFor(ex.id, ex.reps, targetRIR(ex.target));
      if (!seed) return null;
      var map = RB.seedMap[ex.id];
      var oneRM = toNum(((store.profile && store.profile.lifts) || {})[map.s]);
      var basis = map.f >= 1
        ? Math.round(100 * (seed / oneRM)) + "% of your " + oneRM + " lb max"
        : "scaled from your " + seedLabelFor(map.s).toLowerCase() + " max (" + oneRM + " lb)";
      return {
        target: deload ? roundLoad(seed * 0.85) : seed,
        last: 0, lastWeek: 0, seeded: true, carried: false, basis: basis,
      };
    }
    var step = loadStepFor(ex.id);
    var target, basis;
    if (deload) {
      target = roundLoad(last.top * 0.85);
      basis = "~15% under wk " + last.week + "'s " + fmtLb(last.top);
    } else if (last.rpe >= 9) {
      target = last.top;
      basis = "repeat — wk " + last.week + " hit RPE " + last.rpe;
    } else {
      target = last.top + step;
      basis = "wk " + last.week + " top set " + fmtLb(last.top) + " + " + fmtLb(step);
    }
    return { target: target, last: last.top, lastWeek: last.week, basis: basis, carried: last.viaId !== ex.id };
  }
  function fmtLb(v) { return (Math.round(v * 10) / 10) + " lb"; }

  // Strip load advice out of the static target text once we can show a real
  // number ("RPE 7 · +5–10 lb vs wk1" -> "RPE 7").
  function effortPart(target) {
    var parts = String(target || "").split("·").map(function (s) { return s.trim(); }).filter(Boolean);
    var keep = parts.filter(function (p) { return !/^\+|\blb\b|\bload\b|lighter|%/i.test(p); });
    return keep.join(" · ");
  }

  function sessionFor(day, week) {
    if (day === "tue" || day === "wed" || day === "sat") {
      var r = RB.runningWeeks[week][day];
      return { kind: "run", title: r.title, duration: r.duration, prescription: r.prescription, target: r.target };
    }
    if (day === "sun") {
      return {
        kind: "rest", title: "Complete rest", duration: "Off",
        prescription: "Easy walking is optional. Shop, review the week, and do not make up missed sessions.",
        target: "Recover",
      };
    }
    if (day === "fri" && week === 12) {
      return {
        kind: "rest", title: "Pre-test recovery", duration: "20–30 min max",
        prescription: "Rest, or perform very light upper-body movement and mobility. No finisher.",
        target: "Finish fresher than you started",
      };
    }
    return strengthSessionFor(day, week);
  }

  function readinessFor(sleep, soreness) {
    if (Number(sleep) < 6 || soreness === "high") {
      return { tone: "red", title: "Adjust today", text: "Replace speed work with 30 minutes easy. If pain changes your gait, worsens overnight, radiates, or causes numbness or weakness, stop the provoking work and seek evaluation." };
    }
    if (Number(sleep) < 7 || soreness === "moderate") {
      return { tone: "amber", title: "Proceed with a cap", text: "Keep the session but cap working sets and intervals at RPE 7. Remove the final interval or accessory if technique degrades." };
    }
    return { tone: "green", title: "Green light", text: "Perform the session as written. Finish hard work with about two clean reps—or one interval—still available." };
  }

  function macroLine(m) {
    return '<div class="macro-line" aria-label="' + m.calories + ' calories, ' + m.protein + ' grams protein, ' + m.carbs + ' grams carbohydrates, ' + m.fat + ' grams fat, ' + m.fiber + ' grams fiber">' +
      "<span><strong>" + m.calories + "</strong> kcal</span>" +
      "<span><strong>" + m.protein + "</strong> P</span>" +
      "<span><strong>" + m.carbs + "</strong> C</span>" +
      "<span><strong>" + m.fat + "</strong> F</span>" +
      "<span><strong>" + m.fiber + "</strong> fiber</span></div>";
  }

  function dayPicker(value, action) {
    var html = '<div class="day-picker" role="group" aria-label="Choose day">';
    RB.days.forEach(function (d) {
      var sel = value === d.key ? " selected" : "";
      html += '<button type="button" class="day-button' + sel + '" data-action="' + action + '" data-day="' + d.key + '" aria-pressed="' + (value === d.key) + '">' + d.short + "</button>";
    });
    return html + "</div>";
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    if (toastTimeout) window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(function () { el.hidden = true; }, 3500);
  }

  function fmtTimer(sec) {
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }

  // ---- onboarding ----
  function nextMondayISO() {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  }
  function choiceBtn(field, value, label, current, desc) {
    return '<button type="button" class="choice-btn' + (current === value ? " active" : "") + '" data-action="ob-choice" data-field="' + field + '" data-value="' + esc(value) + '">' +
      "<strong>" + esc(label) + "</strong>" + (desc ? "<small>" + esc(desc) + "</small>" : "") + "</button>";
  }
  function obField(label, field, value, type, placeholder, suffix) {
    return "<label>" + esc(label) +
      '<input type="' + (type || "number") + '" inputmode="' + (type === "date" ? "none" : "decimal") + '" value="' + esc(value || "") + '"' +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") +
      ' data-action="ob-field" data-field="' + field + '" />' +
      (suffix ? "<small>" + esc(suffix) + "</small>" : "") + "</label>";
  }

  function renderOnboarding() {
    var d = ui.draft || (ui.draft = clone(store.profile));
    var step = ui.onboardStep;
    var steps = ["Program", "About you", "Ability", "Lifts", "Goals", "Start"];
    var html = '<section class="screen ob-shell">';

    html += '<div class="ob-progress" aria-label="Step ' + (step + 1) + " of " + steps.length + '">';
    steps.forEach(function (s, i) {
      html += '<span class="ob-dot' + (i === step ? " on" : (i < step ? " done" : "")) + '">' + esc(s) + "</span>";
    });
    html += "</div>";

    if (step === 0) {
      html += '<span class="eyebrow">Welcome</span><h1>Let’s build your plan.</h1>' +
        '<p class="lead">Tap a program to get started. Next we’ll take a quick baseline so the workouts and food start at the right level for you — not someone else’s.</p>';
      html += '<div class="program-list">';
      RB.programs.forEach(function (p) {
        var ready = p.status === "ready";
        var sel = d.program === p.id && ready;
        html += '<article class="program-card' + (ready ? "" : " soon") + (sel ? " selected" : "") + '"' +
          (ready ? ' data-action="ob-select-program" data-program="' + p.id + '" role="button" tabindex="0"' : "") + ">" +
          '<div class="pc-head"><h2>' + esc(p.name) + "</h2><span class=\"pc-badge\">" + (ready ? "Ready" : "Coming soon") + "</span></div>" +
          '<p class="pc-tagline">' + esc(p.tagline) + "</p>" +
          "<p>" + esc(p.summary) + "</p><ul>";
        p.details.forEach(function (x) { html += "<li>" + esc(x) + "</li>"; });
        html += "</ul><div class=\"pc-meta\">" + esc(p.meta || (p.weeks + " weeks · " + p.daysPerWeek + " days/week")) + "</div></article>";
      });
      html += "</div>";
    }

    if (step === 1) {
      html += '<span class="eyebrow">About you</span><h1>Your numbers.</h1>' +
        '<p class="lead">Used to calculate your calories and protein. Nothing leaves your phone.</p>';
      html += '<div class="choice-grid two">' + choiceBtn("sex", "male", "Male", d.sex) + choiceBtn("sex", "female", "Female", d.sex) + "</div>";
      html += '<div class="input-grid two">' + obField("Age", "age", d.age, "number", "31") + obField("Weight (lb)", "weight", d.weight, "number", "200") + "</div>";
      html += '<div class="input-grid two">' + obField("Height (inches)", "heightIn", d.heightIn, "number", "69", "5'9\" = 69 in") + obField("Goal weight (lb)", "goalWeight", d.goalWeight, "number", "185", "optional") + "</div>";
      html += '<h3 class="ob-sub">How active is your day outside training?</h3><div class="choice-grid">' +
        choiceBtn("activity", "sedentary", "Sedentary", d.activity, "Desk job, little walking") +
        choiceBtn("activity", "light", "Lightly active", d.activity, "Desk job, some walking") +
        choiceBtn("activity", "active", "Active", d.activity, "On your feet a lot") +
        choiceBtn("activity", "veryactive", "Very active", d.activity, "Physical job") + "</div>";
    }

    if (step === 2) {
      html += '<span class="eyebrow">Baseline assessment</span><h1>Test yourself.</h1>' +
        '<p class="lead">Standard field tests. Do them rested and spread over a day or two — don’t grind all five back to back. Skip any you can’t do; we score what you complete.</p>';
      html += '<div class="test-list">';
      RB.baselineTests.forEach(function (t) {
        var copy = '<div class="test-copy"><strong>' + esc(t.label) + "</strong><small>" + esc(t.hint) + "</small></div>";
        if (t.time) {
          // Two numeric boxes rather than one "mm:ss" field — a phone's numeric
          // keypad has no colon key, so a single field is untypeable on iOS.
          var secs = parseTime(d[t.id]);
          var mm = secs ? String(Math.floor(secs / 60)) : "";
          var ss = secs ? String(secs % 60).padStart(2, "0") : "";
          html += '<div class="test-row">' + copy +
            '<div class="test-input time-input" data-time-for="' + t.id + '">' +
            '<input type="number" inputmode="numeric" min="0" placeholder="13" value="' + esc(mm) +
            '" aria-label="' + esc(t.label) + ' minutes" data-action="ob-time" data-field="' + t.id + '" data-part="min" />' +
            '<span class="time-colon">:</span>' +
            '<input type="number" inputmode="numeric" min="0" max="59" placeholder="30" value="' + esc(ss) +
            '" aria-label="' + esc(t.label) + ' seconds" data-action="ob-time" data-field="' + t.id + '" data-part="sec" />' +
            "</div></div>";
        } else {
          html += '<label class="test-row">' + copy +
            '<div class="test-input"><input type="number" inputmode="decimal" placeholder="' + esc(t.placeholder) +
            '" value="' + esc(d[t.id] || "") + '" data-action="ob-field" data-field="' + t.id + '" />' +
            "<span>" + esc(t.unit) + "</span></div></label>";
        }
      });
      html += "</div>";
      var t2 = fitnessTier(d);
      html += '<div class="tier-preview"><span class="eyebrow">Your starting level</span>' +
        "<h2>Tier " + t2.n + " · " + esc(t2.name) + "</h2><p>" + esc(t2.note) + "</p><small>" +
        (t2.answered ? "Score " + t2.score + " / " + t2.maxScore + " across " + t2.answered + " test" + (t2.answered === 1 ? "" : "s") : "No results entered yet") +
        "</small></div>";
    }

    if (step === 3) {
      d.lifts = d.lifts || {};
      html += '<span class="eyebrow">Starting weights</span><h1>Your 1-rep max.</h1>' +
        '<p class="lead">Enter the most you could lift for a <strong>single rep</strong> on each lift. A best estimate is fine. We work backwards from it — you’ll never be asked to train at your max.</p>' +
        '<p class="lead-sub">Never tested a max? Use a recent heavy set: about <strong>weight × reps ÷ 30 + weight</strong>. So 225 for 5 ≈ a 260 max. Leave blank for anything you’ve never done.</p>';
      html += '<div class="test-list">';
      RB.liftSeeds.forEach(function (L) {
        html += '<label class="test-row"><div class="test-copy"><strong>' + esc(L.label) + "</strong><small>" + esc(L.hint) + "</small></div>" +
          '<div class="test-input"><input type="number" inputmode="decimal" placeholder="135" value="' + esc(d.lifts[L.id] || "") +
          '" data-action="ob-lift" data-lift="' + L.id + '" /><span>lb</span></div></label>';
      });
      html += "</div>";
      var preview = [["back-squat", "Back squat"], ["db-bench", "DB bench press (per hand)"], ["cs-row", "Chest-supported row"],
        ["trap-deadlift", "Trap-bar deadlift"], ["ohp", "Overhead press"]];
      var rows = [];
      preview.forEach(function (pi) {
        var map = RB.seedMap[pi[0]];
        var oneRM = map ? toNum(d.lifts[map.s]) : 0;
        var rx1 = week1Rx(pi[0]);
        if (!oneRM || !rx1) return;
        var eff = repsForLoad(rx1.reps) + targetRIR(rx1.target);
        var w = roundLoad(oneRM * pctForReps(eff) * map.f);
        if (map.f >= 1 && w > oneRM * 0.9) w = roundLoad(oneRM * 0.9);
        rows.push(pi[1] + " — " + w + " lb × " + rx1.reps + (map.f >= 1 ? " (" + Math.round(100 * w / oneRM) + "% of max)" : ""));
      });
      if (rows.length) {
        html += '<div class="tier-preview"><span class="eyebrow">Week 1 will start you at</span><ul class="seed-list">';
        rows.forEach(function (r) { html += "<li>" + esc(r) + "</li>"; });
        html += "</ul><small>Working weights, not maxes — calculated from the reps and effort each set calls for. They climb from your logged sets after week 1.</small></div>";
      }
    }

    if (step === 4) {
      html += '<span class="eyebrow">Goals & food</span><h1>What are you after?</h1>';
      html += '<h3 class="ob-sub">Primary goal</h3><div class="choice-grid">';
      RB.goals.forEach(function (g) { html += choiceBtn("goal", g.id, g.label, d.goal, g.desc); });
      html += "</div>";
      html += '<h3 class="ob-sub">Dietary preference</h3><div class="choice-grid">';
      RB.diets.forEach(function (x) { html += choiceBtn("diet", x.id, x.label, d.diet, x.desc); });
      html += "</div>";
      var tg = nutritionTargets(d);
      if (tg) {
        html += '<div class="tier-preview"><span class="eyebrow">Your daily targets</span>' +
          "<h2>" + tg.calories.toLocaleString() + " kcal · " + tg.protein + " g protein</h2>" +
          "<p>" + tg.carbs + " g carbs · " + tg.fat + " g fat · " + tg.fiber + " g fiber. Maintenance is about " + tg.tdee.toLocaleString() + " kcal.</p></div>";
      } else {
        html += '<div class="tier-preview"><p>Add your weight and height on the previous step and we’ll calculate your calories here.</p></div>';
      }
    }

    if (step === 5) {
      if (!d.startDate) d.startDate = nextMondayISO();
      var prog = programById(d.program);
      var tier2 = fitnessTier(d);
      var tg2 = nutritionTargets(d);
      html += '<span class="eyebrow">Almost there</span><h1>When do you start?</h1>' +
        '<p class="lead">Week 1 begins on this date. The app tracks which week you’re in from here.</p>';
      html += '<div class="input-grid two">' + obField("Start date", "startDate", d.startDate, "date") + "</div>";
      html += '<div class="review-card"><h3>Your plan</h3><dl>' +
        "<div><dt>Program</dt><dd>" + esc(prog.name) + " · " + prog.weeks + " weeks</dd></div>" +
        "<div><dt>Starting level</dt><dd>Tier " + tier2.n + " · " + esc(tier2.name) + "</dd></div>" +
        "<div><dt>Goal</dt><dd>" + esc(goalById(d.goal).label) + "</dd></div>" +
        "<div><dt>Diet</dt><dd>" + esc(dietById(d.diet).label) + "</dd></div>" +
        (tg2 ? "<div><dt>Daily target</dt><dd>" + tg2.calories.toLocaleString() + " kcal · " + tg2.protein + " g protein</dd></div>" : "") +
        "</dl></div>";
    }

    html += '<div class="ob-actions">';
    if (step > 0) html += '<button class="secondary-button" type="button" data-action="ob-back">Back</button>';
    if (step < 5) html += '<button class="primary-button" type="button" data-action="ob-next">Continue</button>';
    else html += '<button class="primary-button" type="button" data-action="ob-finish">Start my program</button>';
    html += "</div></section>";
    return html;
  }

  // ---- home ----
  function renderHome() {
    var p = store.profile;
    var prog = programById(p.program);
    var tier = fitnessTier(p);
    var tg = nutritionTargets(p);
    var prog2 = programProgress(p);

    var html = '<section class="screen" aria-labelledby="home-heading">';
    html += '<span class="eyebrow">Your program</span><h1 id="home-heading">' + esc(prog.name) + "</h1>";
    html += '<p class="lead">' + esc(prog.summary) + "</p>";

    if (prog2) {
      if (prog2.status === "upcoming") {
        html += '<div class="home-status"><strong>Starts in ' + prog2.daysUntil + " day" + (prog2.daysUntil === 1 ? "" : "s") + "</strong><small>Week 1 begins " + esc(p.startDate) + "</small></div>";
      } else if (prog2.status === "complete") {
        html += '<div class="home-status"><strong>Program complete</strong><small>All ' + prog2.total + " weeks done — time to retest and pick the next block.</small></div>";
      } else {
        html += '<div class="home-status"><strong>Week ' + prog2.week + " of " + prog2.total + "</strong><small>Day " + prog2.dayOfWeek + " · started " + esc(p.startDate) + "</small></div>";
      }
    }

    html += '<div class="stat-grid">';
    html += statTile("Level", "Tier " + tier.n, { text: tier.name, tone: "" });
    html += statTile("Goal", esc(goalById(p.goal).label), { text: p.goalWeight ? "target " + p.goalWeight + " lb" : "no target set", tone: "" });
    html += statTile("Daily calories", tg ? tg.calories.toLocaleString() : "—", { text: tg ? "maintenance ~" + tg.tdee.toLocaleString() : "add your metrics", tone: "" });
    html += statTile("Protein", tg ? tg.protein + ' <span class="stat-unit">g</span>' : "—", { text: esc(dietById(p.diet).label), tone: "" });
    html += "</div>";

    html += '<div class="progression-note">' + esc(tier.note) + "</div>";

    html += '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Adjust</span><h2>Your setup</h2></div></div>' +
      '<p class="setup-hint">Changed weight, hit a new max, or want to update your goal? Redo the assessment — your logged workouts and history are kept.</p>' +
      '<button class="primary-button setup-primary" type="button" data-action="redo-assessment">Redo initial assessment</button>' +
      '<div class="home-actions">' +
      '<button class="secondary-button" type="button" data-action="change-program">Change program</button>' +
      "</div></section>";

    html += '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Library</span><h2>Other programs</h2></div></div>';
    html += '<div class="program-list">';
    RB.programs.forEach(function (x) {
      if (x.id === p.program) return;
      var ready = x.status === "ready";
      html += '<article class="program-card' + (ready ? "" : " soon") + '">' +
        '<div class="pc-head"><h2>' + esc(x.name) + '</h2><span class="pc-badge">' + (ready ? "Ready" : "Coming soon") + "</span></div>" +
        '<p class="pc-tagline">' + esc(x.tagline) + "</p><p>" + esc(x.summary) + "</p>" +
        '<div class="pc-meta">' + esc(x.meta || (x.weeks + " weeks · " + x.daysPerWeek + " days/week")) + "</div></article>";
    });
    html += "</div></section>";

    html += "</section>";
    return html;
  }

  // Optional "what do you want to do today?" picker — a set of standalone
  // sessions to choose from. Reused on the countdown screen and rest days.
  function quickPicker(introTop) {
    var html = '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Optional</span><h2>What do you want to do today?</h2></div></div>';
    if (introTop) html += '<p class="quick-intro">' + esc(introTop) + "</p>";
    html += '<div class="quick-list">';
    RB.quickSessions.forEach(function (q) {
      var sel = ui.quickPick === q.id;
      html += '<article class="quick-card' + (sel ? " selected" : "") + '" data-action="pick-quick" data-id="' + esc(q.id) + '" role="button" tabindex="0" aria-expanded="' + (sel ? "true" : "false") + '">' +
        '<div class="qc-head"><div><h3>' + esc(q.name) + "</h3><p>" + esc(q.tagline) + "</p></div><span class=\"qc-dur\">" + esc(q.duration) + "</span></div>";
      if (sel) {
        html += '<ul class="qc-items">';
        q.items.forEach(function (x) { html += "<li>" + esc(x) + "</li>"; });
        html += "</ul>";
      }
      html += "</article>";
    });
    return html + "</div></section>";
  }

  // Countdown screen shown on Today until the program's start date arrives.
  function renderCountdown(prog) {
    var p = store.profile;
    var progName = programById(p.program).name;
    var tg = nutritionTargets(p);
    var days = prog.daysUntil;
    var startStr = new Date(p.startDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    var html = '<section class="screen" aria-labelledby="today-heading">';
    html += '<span class="eyebrow">Countdown to game time</span>';
    html += '<div class="countdown-hero"><div class="cd-num">' + days + "</div>" +
      '<div class="cd-copy"><strong id="today-heading">' + (days === 1 ? "day" : "days") + " to go</strong>" +
      "<span>Your " + esc(progName) + " starts " + esc(startStr) + ".</span></div></div>";
    html += '<p class="lead">' + (days === 1 ? "Tomorrow it begins." : "Not on the clock yet") +
      " — but you don't have to sit still. Pick something to move today, or take a rest." +
      (tg ? " You can start eating on your " + tg.calories.toLocaleString() + " kcal plan whenever you're ready." : "") + "</p>";

    html += quickPicker(null);

    html += '<details class="install-note"><summary>Put REBUILD on your iPhone Home Screen</summary><p>Open this app in Safari, tap Share, choose <strong>Add to Home Screen</strong>, then open it like any other app. It works offline afterward.</p></details>';
    html += "</section>";
    return html;
  }

  // ---- screens ----
  function renderToday() {
    // Before the chosen start date, show a countdown instead of pretending the
    // program is already under way.
    var prog = programProgress(store.profile);
    if (prog && prog.status === "upcoming") return renderCountdown(prog);

    var week = store.currentWeek;
    var today = todayKey();
    var session = sessionFor(today, week);
    var plan = adaptedPlan(today);
    var tg = nutritionTargets(store.profile);
    var dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    var sub = session.kind === "strength" ? session.subtitle : session.prescription;

    var html = '<section class="screen" aria-labelledby="today-heading">';
    html += '<div class="eyebrow">' + esc(dateStr) + "</div>";
    html += '<h1 id="today-heading">Do the work. Recover. Repeat.</h1>';
    html += '<p class="lead">The goal is not to destroy today. It is to be ready to train again tomorrow.</p>';

    html += '<div class="metric-grid">' +
      '<article class="metric-card"><span>Plan</span><strong>Week ' + week + "</strong><small>" + phaseForWeek(week) + " phase</small></article>" +
      '<article class="metric-card"><span>Nutrition</span><strong>' + (tg ? tg.calories.toLocaleString() : plan.macros.calories.toLocaleString()) + "</strong><small>kcal daily target</small></article>" +
      '<article class="metric-card"><span>Protein</span><strong>' + (tg ? tg.protein : plan.macros.protein) + "</strong><small>grams per day</small></article></div>";

    html += '<article class="feature-card workout-hero">' +
      '<div class="card-kicker">Today’s assignment</div>' +
      '<div class="card-title-row"><div><h2>' + esc(session.title) + "</h2><p>" + esc(dayLabel(today)) + " · " + esc(session.duration) + "</p></div>" +
      '<span class="session-badge">' + esc(session.kind) + "</span></div>" +
      '<p class="prescription">' + esc(sub) + "</p>" +
      '<button class="primary-button" type="button" data-action="open-workout" data-day="' + today + '">Open workout</button></article>';

    // readiness
    html += '<section class="section-block" aria-labelledby="readiness-heading">' +
      '<div class="section-heading"><div><span class="eyebrow">Autoregulation</span><h2 id="readiness-heading">Readiness check</h2></div></div>' +
      '<div class="input-grid two">' +
      '<label>Sleep last night<select data-action="set-sleep">' +
        opt("8", "8+ hours", ui.sleep) + opt("7", "7–8 hours", ui.sleep) + opt("6", "6–7 hours", ui.sleep) + opt("5", "Under 6 hours", ui.sleep) +
      "</select></label>" +
      '<label>Lower-body soreness<select data-action="set-soreness">' +
        opt("low", "Low", ui.soreness) + opt("moderate", "Moderate", ui.soreness) + opt("high", "High or focal pain", ui.soreness) +
      "</select></label></div>" +
      '<div id="readiness-box">' + readinessBox() + "</div></section>";

    // today's fuel
    html += '<section class="section-block" aria-labelledby="food-heading">' +
      '<div class="section-heading"><div><span class="eyebrow">Today’s fuel</span><h2 id="food-heading">' + plan.macros.calories + " kcal · " + plan.macros.protein + ' g protein</h2></div><button class="text-button" type="button" data-action="open-nutrition" data-day="' + today + '">View details</button></div>' +
      '<div class="compact-list">';
    plan.meals.forEach(function (meal) {
      html += '<div class="compact-row"><span>' + esc(meal.timing) + "</span><strong>" + esc(meal.name) + "</strong><small>" + meal.macros.calories + " kcal</small></div>";
    });
    html += "</div></section>";

    html += '<details class="install-note"><summary>Put REBUILD on your iPhone Home Screen</summary><p>Open this app in Safari, tap Share, choose <strong>Add to Home Screen</strong>, then open it like any other app. It works offline afterward.</p></details>';

    html += "</section>";
    return html;
  }

  function readinessBox() {
    var r = readinessFor(ui.sleep, ui.soreness);
    return '<div class="readiness ' + r.tone + '"><strong>' + esc(r.title) + "</strong><p>" + esc(r.text) + "</p></div>";
  }

  function opt(value, label, current) {
    return '<option value="' + esc(value) + '"' + (current === value ? " selected" : "") + ">" + esc(label) + "</option>";
  }

  function renderWorkouts() {
    var week = store.currentWeek;
    var day = ui.selectedDay;
    var session = sessionFor(day, week);
    var doneKey = week + ":" + day;
    var finished = Boolean(store.completedWorkouts[doneKey]);

    var html = '<section class="screen" aria-labelledby="workout-heading">';
    html += '<div class="screen-title-row"><div><span class="eyebrow">12-week rebuild</span><h1 id="workout-heading">Workout log</h1></div>' +
      '<label class="week-select">Week<select data-action="set-week">';
    for (var w = 1; w <= 12; w++) html += '<option value="' + w + '"' + (w === week ? " selected" : "") + ">" + w + "</option>";
    html += "</select></label></div>";

    html += dayPicker(day, "select-workout-day");

    var header = session.kind === "strength" ? session.subtitle : session.prescription;
    var chip = session.kind === "strength" ? session.chip : session.target;
    html += '<article class="session-header"><div><span class="eyebrow">' + esc(dayLabel(day)) + " · " + esc(session.duration) + "</span><h2>" + esc(session.title) + "</h2><p>" + esc(header) + "</p></div>" +
      '<div class="effort-chip">' + esc(chip) + "</div></article>";

    if (session.kind === "strength" && session.note) {
      html += '<div class="progression-note">' + esc(session.note) + "</div>";
    }

    if (session.kind === "strength") {
      html += '<div class="exercise-stack">';
      session.exercises.forEach(function (ex) {
        var prescribedSets = ex.sets;
        var restSec = restToSeconds(ex.rest);
        var swap = swapInfo(ex.id, ex.name);
        // A swapped movement may be a different implement (or bodyweight), so
        // the barbell-derived target no longer applies — hide it, keep logging.
        var sug = swap.swapped ? null : suggestLoad(ex, week);
        var effort = sug ? effortPart(ex.target) : ex.target;
        var groupTag = ex.group ? '<span class="group-tag">' + esc(ex.group) + "</span>" : "";
        var nameHtml = groupTag + esc(swap.displayName) + (swap.swapped ? ' <em class="swapped-tag">swap</em>' : "");
        var swapBtn = swap.hasAlts ? '<button class="swap-btn" type="button" data-action="swap-toggle" data-ex="' + esc(ex.id) + '" aria-label="Swap ' + esc(swap.displayName) + ' for different equipment" title="Swap equipment">⇄</button>' : "";
        html += '<article class="exercise-card"><div class="exercise-title"><div><h3>' + nameHtml + "</h3><p>" + esc(ex.cue) + "</p></div>" +
          '<div class="ex-actions"><span class="ex-sr">' + prescribedSets + " × " + esc(ex.reps) + "</span>" + swapBtn + "</div></div>";
        html += '<div class="rx-line">';
        if (ex.tempo && ex.tempo !== "—") html += "<span>Tempo <strong>" + esc(ex.tempo) + "</strong></span>";
        if (ex.rest && ex.rest !== "—") html += "<span>Rest <strong>" + esc(ex.rest) + "</strong></span>";
        if (effort) html += '<span class="rx-target"><strong>' + esc(effort) + "</strong></span>";
        html += "</div>";
        if (ui.swapOpen === ex.id && swap.hasAlts) {
          html += '<div class="swap-list"><div class="swap-hint">Same muscle group, different equipment — your sets, reps and logged progress stay the same.</div>';
          var isDefault = !store.exerciseSwaps[ex.id];
          html += '<button type="button" class="swap-opt' + (isDefault ? " active" : "") + '" data-action="swap-choose" data-ex="' + esc(ex.id) + '" data-alt="default"><strong>' + esc(ex.name) + "</strong><small>Recommended</small></button>";
          swap.pool.forEach(function (alt) {
            var on = store.exerciseSwaps[ex.id] === alt.id;
            html += '<button type="button" class="swap-opt' + (on ? " active" : "") + '" data-action="swap-choose" data-ex="' + esc(ex.id) + '" data-alt="' + esc(alt.id) + '"><strong>' + esc(alt.name) + "</strong><small>" + esc(alt.equip) + "</small></button>";
          });
          html += "</div>";
        }
        if (sug) {
          html += '<div class="load-suggest"><span class="ls-label">Target load</span>' +
            '<strong class="ls-value">' + esc(fmtLb(sug.target)) + "</strong>" +
            '<span class="ls-basis">' + esc(sug.basis) + (sug.carried ? " · carried over" : "") + "</span></div>";
        }
        html += '<div class="set-grid labels"><span>Set</span><span>Weight</span><span>Reps / distance</span><span>RPE</span><span>Done</span></div>';
        for (var i = 0; i < prescribedSets; i++) {
          var setNo = i + 1;
          var key = week + ":" + day + ":" + ex.id + ":" + setNo;
          var log = store.workoutLogs[key] || { weight: "", reps: "", rpe: "", done: false };
          var ekey = esc(key);
          var wPlaceholder = sug ? String(sug.target) : "lb";
          html += '<div class="set-grid' + (log.done ? " completed" : "") + '" data-set-row="' + ekey + '">' +
            "<strong>" + setNo + "</strong>" +
            '<input aria-label="' + esc(ex.name) + " set " + setNo + ' weight" inputmode="decimal" placeholder="' + esc(wPlaceholder) + '" value="' + esc(log.weight) + '" data-action="set-field" data-key="' + ekey + '" data-field="weight" />' +
            '<input aria-label="' + esc(ex.name) + " set " + setNo + ' reps or distance" inputmode="decimal" placeholder="' + esc(ex.reps) + '" value="' + esc(log.reps) + '" data-action="set-field" data-key="' + ekey + '" data-field="reps" />' +
            '<select aria-label="' + esc(ex.name) + " set " + setNo + ' RPE" data-action="set-field" data-key="' + ekey + '" data-field="rpe">' +
              '<option value="">—</option>' + rpeOpt("6", log.rpe) + rpeOpt("7", log.rpe) + rpeOpt("8", log.rpe) + rpeOpt("9", log.rpe) +
            "</select>" +
            '<label class="check-control"><input type="checkbox"' + (log.done ? " checked" : "") + ' data-action="set-done" data-key="' + ekey + '" data-ex="' + esc(ex.id) + '" data-rest="' + restSec + '" /><span>✓</span></label>' +
            "</div>";
        }
        if (restSec > 0) {
          var exId = esc(ex.id);
          html += '<div class="rest-timer" data-rest-for="' + exId + '">' +
            '<span class="rest-cap">Rest timer</span>' +
            '<strong class="rest-clock" data-rest-display="' + exId + '">' + fmtTimer(restSec) + "</strong>" +
            '<button type="button" class="rest-btn" data-action="rest-start" data-ex="' + exId + '" data-sec="' + restSec + '">Start</button>' +
            '<button type="button" class="rest-btn" data-action="rest-reset" data-ex="' + exId + '" data-sec="' + restSec + '">Reset</button>' +
            "</div>";
        }
        html += "</article>";
      });
      html += "</div>";
    } else if (session.kind === "run") {
      var rkey = week + ":" + day;
      var erkey = esc(rkey);
      var rlog = store.runLogs[rkey] || { distance: "", pace: "", rpe: "6" };
      html += '<article class="feature-card run-log">' +
        '<div class="run-prescription"><span>Prescription</span><strong>' + esc(session.prescription) + "</strong><small>" + esc(session.target) + "</small></div>" +
        '<div class="input-grid three">' +
        '<label>Distance<input inputmode="decimal" placeholder="miles" value="' + esc(rlog.distance) + '" data-action="run-field" data-key="' + erkey + '" data-field="distance" /></label>' +
        '<label>Average pace<input placeholder="min / mile" value="' + esc(rlog.pace) + '" data-action="run-field" data-key="' + erkey + '" data-field="pace" /></label>' +
        '<label>Session RPE<select data-action="run-field" data-key="' + erkey + '" data-field="rpe">' +
          rpeOpt("3", rlog.rpe) + rpeOpt("4", rlog.rpe) + rpeOpt("5", rlog.rpe) + rpeOpt("6", rlog.rpe) + rpeOpt("7", rlog.rpe) + rpeOpt("8", rlog.rpe) +
        "</select></label></div></article>";
    } else {
      html += '<article class="feature-card"><h3>' + esc(session.prescription) + "</h3><p>" + esc(session.target) + "</p></article>";
    }

    // Rest days have nothing to "finish". Each strength/run exercise carries its
    // own rest timer inline (it auto-starts when you check a set complete).
    if (session.kind !== "rest") {
      html += '<div class="workout-actions">' +
        '<button class="primary-button" type="button" data-action="finish-workout">' + (finished ? "Completed ✓" : "Finish workout") + "</button></div>";
    }

    // Progression rule is lift-specific.
    if (session.kind === "strength") {
      html += '<div class="rule-card"><strong>How the target load works</strong><p>Each lift’s target is calculated from the heaviest set you logged last time, plus that lift’s step (2.5–15 lb depending on the movement). Log an RPE of 9 or higher and it holds the weight instead of adding. Deload weeks drop to about 85%. Hit the target for all sets and reps, and next week climbs again — so log your weights and it keeps itself honest.</p></div>';
    }

    html += "</section>";
    return html;
  }

  function rpeOpt(v, current) {
    return '<option value="' + v + '"' + (current === v ? " selected" : "") + ">" + v + "</option>";
  }

  function renderNutrition() {
    var html = '<section class="screen" aria-labelledby="nutrition-heading">';
    html += '<div class="screen-title-row"><div><span class="eyebrow">Measured, repeatable, family-friendly</span><h1 id="nutrition-heading">Nutrition</h1></div></div>';
    html += '<div class="segmented">' +
      '<button type="button" class="' + (ui.nutritionMode === "plan" ? "active" : "") + '" data-action="nutrition-mode" data-mode="plan">Daily plan</button>' +
      '<button type="button" class="' + (ui.nutritionMode === "shopping" ? "active" : "") + '" data-action="nutrition-mode" data-mode="shopping">Sunday list</button></div>';

    if (ui.nutritionMode === "plan") {
      var day = ui.nutritionDay;
      var plan = adaptedPlan(day);
      html += dayPicker(day, "select-nutrition-day");
      html += '<article class="nutrition-summary"><div><span class="eyebrow">' + esc(plan.focus) + "</span><h2>" + plan.macros.calories + " kcal · " + plan.macros.protein + " g protein</h2><p>" + esc(plan.fuel) + "</p></div>" + macroLine(plan.macros) + "</article>";
      // Say plainly how this plan was personalized.
      var adaptBits = [];
      if (Math.abs(plan.factor - 1) >= 0.02) adaptBits.push("Portions scaled to " + Math.round(plan.factor * 100) + "% of the base plan to hit your " + (plan.targets ? plan.targets.calories.toLocaleString() + " kcal" : "calorie") + " target.");
      if (plan.diet && plan.diet !== "omnivore") adaptBits.push("Protein sources swapped for your " + dietById(plan.diet).label.toLowerCase() + " preference — portions are matched on protein, so calories and fat shift a little. Check labels.");
      if (adaptBits.length) html += '<div class="progression-note">' + esc(adaptBits.join(" ")) + "</div>";
      // Never show a protein target next to a plan that misses it without saying so.
      if (plan.targets) {
        var gap = plan.targets.protein - plan.macros.protein;
        if (gap >= 10) {
          html += '<div class="gap-note"><strong>' + gap + " g protein short of your target</strong><p>This day's meals come to " +
            plan.macros.protein + " g but you're aiming for " + plan.targets.protein +
            " g. Close it with a protein shake, an extra serving of your main protein at dinner, or a high-protein yogurt.</p></div>";
        } else if (gap <= -15) {
          html += '<div class="gap-note"><strong>' + Math.abs(gap) + " g protein over your target</strong><p>Not a problem — extra protein is the safest macro to be over on. Trim a snack if you'd rather match exactly.</p></div>";
        }
      }

      html += '<details class="measurement-note"><summary>How to weigh your food</summary><ul>';
      RB.measurementRules.forEach(function (rule) { html += "<li>" + esc(rule) + "</li>"; });
      html += "</ul></details>";

      html += '<div class="meal-stack">';
      plan.meals.forEach(function (meal) {
        // Keyed by weekday + meal only — nutrition plans are the same every
        // week and the Nutrition tab has no week context, so a meal check must
        // not depend on which training week is selected elsewhere.
        var key = day + ":" + meal.id;
        var complete = Boolean(store.completedMeals[key]);
        html += '<article class="meal-card' + (complete ? " meal-complete" : "") + '" data-meal="' + esc(key) + '">' +
          '<div class="meal-heading"><div><span>' + esc(meal.timing) + (meal.adapted ? ' <em class="swap-chip">' + esc(dietById(plan.diet).label) + " swap</em>" : "") + "</span><h2>" + esc(meal.name) + "</h2></div>" +
          '<button type="button" data-action="log-meal" data-key="' + esc(key) + '">' + (complete ? "Logged ✓" : "Log meal") + "</button></div>" +
          macroLine(meal.macros);
        html += '<ul class="ingredient-list">';
        meal.ingredients.forEach(function (ing) { html += "<li>" + esc(ing) + "</li>"; });
        html += "</ul>";
        if (meal.note) html += '<p class="meal-note">' + esc(meal.note) + "</p>";
        if (meal.familyRecipe) {
          html += '<details class="family-recipe"><summary>Family recipe · ' + esc(meal.familyRecipe.yield) + "</summary><h3>What to cook</h3><ul>";
          meal.familyRecipe.ingredients.forEach(function (ing) { html += "<li>" + esc(ing) + "</li>"; });
          html += "</ul><h3>Fast method</h3><ol>";
          meal.familyRecipe.steps.forEach(function (step) { html += "<li>" + esc(step) + "</li>"; });
          html += "</ol></details>";
        }
        html += "</article>";
      });
      html += "</div>";

      html += '<div class="target-note"><strong>Calibration target</strong><p>Follow these portions for 14 full days, then review your average morning weight and waist. If weight and waist are both flat for two review periods with at least 80% adherence, reduce 150 calories or add 1,500–2,000 daily steps—not both.</p></div>';
    } else {
      html += '<article class="shopping-intro"><span class="eyebrow">One Sunday trip</span><h2>Exact weekly shopping list</h2><p>Breakfasts, lunches, snacks, and seven four-serving family dinners are included. The dinner quantities are intentionally generous so younger children can eat smaller portions and leave leftovers.</p></article>';
      RB.shoppingList.forEach(function (group) {
        html += '<section class="shopping-group"><div class="section-heading"><h2>' + esc(group.category) + "</h2><span>" + group.items.length + " items</span></div>";
        group.items.forEach(function (pair, index) {
          var key = group.category + ":" + index;
          var checked = Boolean(store.shoppingChecks[key]);
          html += '<label class="shopping-item' + (checked ? " checked" : "") + '" data-shop="' + esc(key) + '"><input type="checkbox"' + (checked ? " checked" : "") + ' data-action="shop-check" data-key="' + esc(key) + '" /><span class="shopping-check">✓</span><span><strong>' + esc(pair[0]) + "</strong><small>" + esc(pair[1]) + "</small></span></label>";
        });
        html += "</section>";
      });
      html += '<button class="secondary-button" type="button" data-action="reset-shopping">Reset shopping checks</button>';
    }

    html += "</section>";
    return html;
  }

  // ---- progress dashboard: derived stats + chart builders ----
  function toNum(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  // Weekly totals derived from the logs, keyed by program week (1–12).
  function weeklyVolume() {
    var out = {};
    Object.keys(store.workoutLogs).forEach(function (k) {
      var log = store.workoutLogs[k];
      var w = toNum(log.weight), r = toNum(log.reps);
      if (w > 0 && r > 0) { var wk = parseInt(k.split(":")[0], 10); if (wk >= 1 && wk <= 12) out[wk] = (out[wk] || 0) + w * r; }
    });
    return out;
  }
  function weeklyMiles() {
    var out = {};
    Object.keys(store.runLogs).forEach(function (k) {
      var d = toNum(store.runLogs[k].distance);
      if (d > 0) { var wk = parseInt(k.split(":")[0], 10); if (wk >= 1 && wk <= 12) out[wk] = (out[wk] || 0) + d; }
    });
    return out;
  }
  function weeklySessions() {
    var out = {};
    Object.keys(store.completedWorkouts).forEach(function (k) {
      if (!store.completedWorkouts[k]) return;
      var wk = parseInt(k.split(":")[0], 10); if (wk >= 1 && wk <= 12) out[wk] = (out[wk] || 0) + 1;
    });
    return out;
  }
  function sumMap(map) { var s = 0; Object.keys(map).forEach(function (k) { s += map[k]; }); return s; }

  // Check-in history for one metric, oldest→newest (store.checkIns is newest-first).
  function checkInSeries(metric) {
    var arr = [];
    store.checkIns.slice().reverse().forEach(function (e) {
      var v = metric === "weight" ? e.weight : metric === "waist" ? e.waist : e.sleep;
      if (v !== undefined && v !== null && isFinite(v)) arr.push({ date: e.date, value: v });
    });
    return arr;
  }
  function seriesDelta(metric) {
    var s = checkInSeries(metric);
    if (s.length < 2) return null;
    return s[s.length - 1].value - s[0].value;
  }
  // Delta caption + tone. goodDown=true means a decrease is favorable.
  function deltaSub(delta, unit, goodDown) {
    if (delta === null) return { text: "Need 2+ check-ins", tone: "" };
    if (delta === 0) return { text: "No change yet", tone: "" };
    var down = delta < 0;
    var arrow = down ? "▼" : "▲";
    var tone = (down === goodDown) ? "good" : "bad";
    return { text: arrow + " " + Math.abs(delta).toFixed(1) + " " + unit + " since start", tone: tone };
  }

  function statTile(label, valueHtml, sub) {
    return '<article class="stat-tile"><span class="stat-label">' + esc(label) + "</span>" +
      '<strong class="stat-value">' + valueHtml + "</strong>" +
      '<small class="stat-sub ' + (sub.tone || "") + '">' + esc(sub.text) + "</small></article>";
  }

  function metricBtn(action, metric, label, current) {
    return '<button type="button" class="' + (current === metric ? "active" : "") + '" data-action="' + action + '" data-metric="' + metric + '">' + esc(label) + "</button>";
  }
  function fmtVol(v) { return v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)); }

  // Bar chart across the 12 program weeks (0-based; empty weeks show a stub).
  function weekBars(map, fmt, unit, aria, empty) {
    var vals = [];
    for (var w = 1; w <= 12; w++) vals.push(map[w] || 0);
    var max = Math.max.apply(null, vals);
    if (!(max > 0)) return '<div class="empty-state">' + esc(empty) + "</div>";
    var html = '<div class="trend-chart" role="img" aria-label="' + esc(aria) + '">';
    for (var i = 0; i < 12; i++) {
      var v = vals[i];
      var h = v > 0 ? Math.max(8, (v / max) * 100) : 3;
      var title = "Week " + (i + 1) + ": " + (v > 0 ? fmt(v) + " " + unit : "no data");
      html += '<div class="trend-column" title="' + esc(title) + '">' +
        '<div class="' + (v > 0 ? "" : "bar-empty") + '" style="height:' + h + '%"></div>' +
        "<span>" + (v > 0 ? esc(fmt(v)) : "·") + "</span><small>" + (i + 1) + "</small></div>";
    }
    return html + "</div>";
  }

  // SVG line chart for a body-metric trend over check-in dates.
  function lineChart(series, fmt, unit, aria, empty) {
    if (!series.length) return '<div class="empty-state">' + esc(empty) + "</div>";
    if (series.length === 1) {
      return '<div class="single-reading"><strong>' + esc(fmt(series[0].value)) + " " + esc(unit) + "</strong><small>One reading logged — save another check-in to draw the trend.</small></div>";
    }
    var W = 320, H = 150, padL = 10, padR = 10, padT = 18, padB = 24;
    var vals = series.map(function (p) { return p.value; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var range = (max - min) || Math.max(1, max * 0.1);
    var lo = min - range * 0.2, hi = max + range * 0.2;
    var n = series.length;
    function X(i) { return padL + (i / (n - 1)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB); }
    var pts = series.map(function (p, i) { return { x: X(i), y: Y(p.value), value: p.value, date: p.date }; });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    var base = H - padB;
    var area = "M" + pts[0].x.toFixed(1) + " " + base + " " + pts.map(function (p) { return "L" + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ") + " L" + pts[n - 1].x.toFixed(1) + " " + base + " Z";
    var svg = '<svg class="line-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(aria) + '">';
    svg += '<line class="lc-base" x1="' + padL + '" y1="' + base + '" x2="' + (W - padR) + '" y2="' + base + '" vector-effect="non-scaling-stroke" />';
    svg += '<path class="lc-area" d="' + area + '" />';
    svg += '<path class="lc-line" d="' + line + '" vector-effect="non-scaling-stroke" />';
    pts.forEach(function (p, i) {
      svg += '<circle class="lc-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.4" vector-effect="non-scaling-stroke"><title>' + esc(p.date + ": " + fmt(p.value) + " " + unit) + "</title></circle>";
      if (i === 0 || i === n - 1) {
        var ty = p.y - 7 < padT ? p.y + 13 : p.y - 7;
        svg += '<text class="lc-label" x="' + p.x.toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="' + (i === 0 ? "start" : "end") + '">' + esc(fmt(p.value)) + "</text>";
        svg += '<text class="lc-x" x="' + p.x.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + (i === 0 ? "start" : "end") + '">' + esc(p.date.slice(5)) + "</text>";
      }
    });
    return svg + "</svg>";
  }

  // ---- benchmark tracker ----
  function benchTestById(id) {
    for (var i = 0; i < RB.benchmarkTests.length; i++) if (RB.benchmarkTests[i].id === id) return RB.benchmarkTests[i];
    return null;
  }
  // "1:30" duration without a padded leading minute (unlike fmtTimer).
  function fmtClock(secs) { return Math.floor(secs / 60) + ":" + String(Math.round(secs % 60)).padStart(2, "0"); }
  // Turn a typed value into a stored number (times -> seconds).
  function benchParse(test, raw) {
    if (!test) return 0;
    return test.type === "time" ? parseTime(raw) : toNum(raw);
  }
  function benchFormat(test, v) {
    switch (test.type) {
      case "weight": return Math.round(v) + " lb";
      case "reps": return Math.round(v) + (Math.round(v) === 1 ? " rep" : " reps");
      case "bpm": return Math.round(v) + " bpm";
      case "seconds": return v >= 60 ? fmtClock(v) : Math.round(v) + "s";
      case "time": return fmtClock(v);
      default: return String(v);
    }
  }
  // Magnitude of a change, formatted like the value but without a leading sign.
  function benchMag(test, v) {
    v = Math.abs(v);
    switch (test.type) {
      case "weight": return Math.round(v) + " lb";
      case "reps": return Math.round(v) + " reps";
      case "bpm": return Math.round(v) + " bpm";
      case "seconds": case "time": return v >= 60 ? fmtClock(v) : Math.round(v) + "s";
      default: return String(v);
    }
  }
  // Change from the first (baseline) result to the latest, with an arrow and a
  // good/bad tone that respects whether higher or lower is the improvement.
  function benchDelta(test, arr) {
    if (!arr || arr.length < 2) return null;
    var baseline = arr[0].value, latest = arr[arr.length - 1].value;
    var diff = latest - baseline;
    if (diff === 0) return { text: "No change since baseline", tone: "" };
    var improved = test.better === "higher" ? diff > 0 : diff < 0;
    var arrow = diff > 0 ? "▲" : "▼";
    return { text: arrow + " " + benchMag(test, diff) + " since baseline", tone: improved ? "good" : "bad" };
  }
  // Seed each benchmark's first entry from the assessment so day-zero is
  // captured. Runs once per benchmark (skips any that already have history).
  function seedBenchmarks() {
    var p = store.profile;
    if (!p || !p.onboarded) return;
    var date = p.startDate || todayISO();
    RB.benchmarkTests.forEach(function (t) {
      if (!t.seed) return;
      if (store.benchmarkLog[t.id] && store.benchmarkLog[t.id].length) return;
      var raw = t.seed.lift ? (p.lifts || {})[t.seed.lift] : (t.seed.field ? p[t.seed.field] : (t.seed.time ? p[t.seed.time] : ""));
      var v = benchParse(t, raw);
      if (v > 0) store.benchmarkLog[t.id] = [{ date: date, value: v }];
    });
  }

  function renderBenchmarks() {
    var groups = [];
    RB.benchmarkTests.forEach(function (t) {
      var g = groups.filter(function (x) { return x.name === t.group; })[0];
      if (!g) { g = { name: t.group, items: [] }; groups.push(g); }
      g.items.push(t);
    });
    var html = '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Retest deliberately</span><h2>Benchmarks</h2></div></div>';
    html += '<p class="bench-intro">Log a fresh result whenever you retest — each keeps a dated history so you can watch it move. Retesting every 3–4 weeks works well.</p>';
    groups.forEach(function (g) {
      html += '<h3 class="bench-group">' + esc(g.name) + "</h3><div class=\"bench-list\">";
      g.items.forEach(function (t) {
        var arr = store.benchmarkLog[t.id] || [];
        var latest = arr.length ? arr[arr.length - 1] : null;
        var d = benchDelta(t, arr);
        var inputType = t.type === "time" ? "text" : "number";
        var im = t.type === "time" ? "" : ' inputmode="' + (t.type === "weight" ? "decimal" : "numeric") + '"';
        var ph = t.type === "time" ? "mm:ss" : (t.type === "weight" ? "lb" : (t.type === "bpm" ? "bpm" : (t.type === "seconds" ? "sec" : "reps")));
        html += '<article class="bench-item"><div class="bench-top">' +
          '<div class="bench-name"><strong>' + esc(t.label) + "</strong><small>" + esc(t.hint) + "</small></div>" +
          '<div class="bench-value">' + (latest ? esc(benchFormat(t, latest.value)) : "—") + "</div></div>";
        if (d) html += '<div class="bench-sub ' + d.tone + '">' + esc(d.text) + " · " + arr.length + " entries</div>";
        else if (latest) html += '<div class="bench-sub">Baseline set ' + esc(latest.date.slice(5)) + " · retest to track change</div>";
        else html += '<div class="bench-sub">Not logged yet</div>';
        html += '<div class="bench-log"><input type="' + inputType + '"' + im + ' placeholder="' + esc(ph) + '" data-bench-input="' + esc(t.id) + '" aria-label="Log ' + esc(t.label) + '" />' +
          '<button type="button" class="rest-btn" data-action="bench-log" data-id="' + esc(t.id) + '">Log</button></div>';
        if (arr.length > 1) {
          html += '<details class="bench-history"><summary>History (' + arr.length + ")</summary><ul>";
          arr.slice().reverse().forEach(function (e) { html += "<li><span>" + esc(e.date) + "</span><strong>" + esc(benchFormat(t, e.value)) + "</strong></li>"; });
          html += "</ul></details>";
        }
        html += "</article>";
      });
      html += "</div>";
    });
    return html + "</section>";
  }

  function renderProgress() {
    var latest = store.checkIns[0];
    var oldest = store.checkIns.length ? store.checkIns[store.checkIns.length - 1] : null;
    var profWeight = toNum(store.profile.weight);
    var goal = toNum(store.profile.goalWeight);
    // Current weight comes from the latest check-in, and before any check-in
    // exists, from the weight entered during onboarding (not a hardcoded 200).
    var weight = latest ? latest.weight : profWeight;
    var hasWeight = weight > 0;
    // Baseline is the onboarding weight — the program's day-zero. Falls back to
    // the earliest check-in only if onboarding weight is missing. Progress works
    // for losing or gaining.
    var startWeight = profWeight || (oldest ? oldest.weight : weight);
    var weightProgress = 0;
    if (hasWeight && goal && Math.abs(startWeight - goal) > 0.01) {
      weightProgress = Math.max(0, Math.min(100, ((startWeight - weight) / (startWeight - goal)) * 100));
    }

    var html = '<section class="screen" aria-labelledby="progress-heading">';
    html += '<div class="screen-title-row"><div><span class="eyebrow">Weekly evidence</span><h1 id="progress-heading">Progress</h1></div><button class="text-button" type="button" data-action="export">Export backup</button></div>';

    html += '<div class="progress-hero"><div><span>Current weight</span><strong>' + (hasWeight ? weight.toFixed(1) + " lb" : "—") + "</strong><small>" + (goal ? "Goal: " + goal + " lb" : "No goal set") + "</small></div>" +
      '<div class="goal-ring" style="--progress:' + weightProgress + '%"><span>' + (goal && hasWeight ? Math.round(weightProgress) + "%" : "—") + "</span></div></div>";

    // ---- KPI stat tiles ----
    var vol = weeklyVolume(), miles = weeklyMiles(), sess = weeklySessions();
    var wk = store.currentWeek;
    var totalSessions = sumMap(sess);
    var scheduled = 6 * wk;
    var adherence = scheduled > 0 ? Math.round(100 * totalSessions / scheduled) : 0;
    var totalMiles = sumMap(miles);
    var waistSeries = checkInSeries("waist");
    var latestWaist = waistSeries.length ? waistSeries[waistSeries.length - 1].value : null;

    html += '<div class="stat-grid">';
    html += statTile("Weight", hasWeight ? weight.toFixed(1) + ' <span class="stat-unit">lb</span>' : "—",
      store.checkIns.length >= 2 ? deltaSub(seriesDelta("weight"), "lb", true)
        : { text: latest ? "logged " + latest.date.slice(5) : "starting weight", tone: "" });
    html += statTile("Waist", latestWaist !== null ? latestWaist.toFixed(1) + ' <span class="stat-unit">in</span>' : "—", latestWaist !== null ? deltaSub(seriesDelta("waist"), "in", true) : { text: "Log waist to track", tone: "" });
    html += statTile("Sessions done", String(totalSessions), { text: adherence + "% of wk " + wk + " plan", tone: totalSessions > 0 ? "good" : "" });
    html += statTile("Miles run", totalMiles.toFixed(1) + ' <span class="stat-unit">mi</span>', { text: "this week " + (miles[wk] || 0).toFixed(1) + " mi", tone: "" });
    html += "</div>";

    html += '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Same conditions each week</span><h2>Weekly check-in</h2></div></div>' +
      '<div class="input-grid three">' +
      '<label>Weight (lb)<input type="number" inputmode="decimal" value="' + esc(ui.checkWeight) + '" data-action="check-field" data-field="checkWeight" /></label>' +
      '<label>Waist (in)<input type="number" inputmode="decimal" placeholder="optional" value="' + esc(ui.checkWaist) + '" data-action="check-field" data-field="checkWaist" /></label>' +
      '<label>Avg sleep (hr)<input type="number" inputmode="decimal" value="' + esc(ui.checkSleep) + '" data-action="check-field" data-field="checkSleep" /></label></div>' +
      '<button class="primary-button" type="button" data-action="save-checkin">Save check-in</button></section>';

    // ---- Body-metric trend (Weight / Waist / Sleep toggle) ----
    var bm = ui.bodyMetric;
    var bmMeta = {
      weight: { label: "Weight", unit: "lb" },
      waist: { label: "Waist", unit: "in" },
      sleep: { label: "Sleep", unit: "hr" },
    };
    var bmeta = bmMeta[bm] || bmMeta.weight;
    var bseries = checkInSeries(bm);
    var oneDp = function (v) { return v.toFixed(1); };
    html += '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Body metrics</span><h2>' + bmeta.label + ' trend</h2></div><span>' + bseries.length + " pts</span></div>";
    html += '<div class="segmented three">' +
      metricBtn("body-metric", "weight", "Weight", bm) +
      metricBtn("body-metric", "waist", "Waist", bm) +
      metricBtn("body-metric", "sleep", "Sleep", bm) + "</div>";
    html += lineChart(bseries, oneDp, bmeta.unit, bmeta.label + " over check-ins", "Save weekly check-ins to chart your " + bmeta.label.toLowerCase() + ".");
    html += "</section>";

    // ---- Training by week (Volume / Miles / Sessions toggle) ----
    var tm = ui.trainMetric;
    var tmTitle = tm === "volume" ? "Strength volume" : tm === "miles" ? "Running miles" : "Sessions completed";
    html += '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Training by week</span><h2>' + tmTitle + '</h2></div><span>weeks 1–12</span></div>';
    html += '<div class="segmented three">' +
      metricBtn("train-metric", "volume", "Volume", tm) +
      metricBtn("train-metric", "miles", "Miles", tm) +
      metricBtn("train-metric", "sessions", "Sessions", tm) + "</div>";
    if (tm === "volume") html += weekBars(vol, fmtVol, "lb", "Weekly strength volume (weight × reps)", "Log weight and reps in your workouts to see volume build week to week.");
    else if (tm === "miles") html += weekBars(miles, oneDp, "mi", "Weekly running miles", "Log run distances to see your weekly mileage build.");
    else html += weekBars(sess, function (v) { return String(v); }, "sessions", "Sessions completed per week", "Finish workouts to track your consistency.");
    html += "</section>";

    html += renderBenchmarks();

    html += '<div class="rule-card"><strong>Nutrition adjustment</strong><p>Lose 0.5–1.0 lb/week with good workouts: hold. Lose more than 1.25 lb/week or see performance decline: add 150–200 calories, mainly carbohydrates. If waist shrinks and strength improves even with slower scale loss, hold.</p></div>';

    html += "</section>";
    return html;
  }

  // ---- top-level render ----
  function renderTopbar() {
    var el = document.getElementById("topbar");
    if (!store.profile.onboarded) {
      el.innerHTML = '<div class="brand-mark" aria-hidden="true">R</div>' +
        '<div class="brand-copy"><p>REBUILD</p><span>Set up your plan</span></div>' +
        '<span class="phase-pill">Setup</span>';
      return;
    }
    var week = store.currentWeek;
    el.innerHTML =
      '<div class="brand-mark" aria-hidden="true">R</div>' +
      '<div class="brand-copy"><p>REBUILD</p><span>' + esc(programById(store.profile.program).name) + " · Week " + week + "</span></div>" +
      '<span class="phase-pill">' + phaseForWeek(week) + "</span>";
  }

  function renderNav() {
    var el = document.getElementById("bottom-nav");
    var html = "";
    Object.keys(tabLabels).forEach(function (tab) {
      var active = ui.tab === tab ? " active" : "";
      html += '<button type="button" class="' + active.trim() + '" data-action="tab" data-tab="' + tab + '"' + (ui.tab === tab ? ' aria-current="page"' : "") + '><span aria-hidden="true">' + tabIcons[tab] + "</span>" + tabLabels[tab] + "</button>";
    });
    el.innerHTML = html;
  }

  function render() {
    // A full re-render replaces #main, so any running rest timer's display
    // element is about to be destroyed — stop it rather than leak the interval.
    stopRest();
    renderTopbar();
    var main = document.getElementById("main");
    var nav = document.getElementById("bottom-nav");
    // Until the baseline assessment is done, the app is the setup flow.
    if (!store.profile.onboarded) {
      main.innerHTML = renderOnboarding();
      nav.hidden = true;
      nav.innerHTML = "";
      return;
    }
    nav.hidden = false;
    if (ui.tab === "home") main.innerHTML = renderHome();
    else if (ui.tab === "today") main.innerHTML = renderToday();
    else if (ui.tab === "workouts") main.innerHTML = renderWorkouts();
    else if (ui.tab === "nutrition") main.innerHTML = renderNutrition();
    else main.innerHTML = renderProgress();
    renderNav();
  }

  function goTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  // ---- per-exercise rest timer ----
  // Turn a prescribed rest string ("2–2.5 min", "75–90 sec", "45 sec", "—")
  // into seconds, using the lower bound of any range ("at least this long").
  function restToSeconds(rest) {
    if (!rest || rest === "—") return 0;
    var isMin = /min/i.test(rest);
    var m = String(rest).match(/[\d.]+/);
    if (!m) return 0;
    return Math.round(parseFloat(m[0]) * (isMin ? 60 : 1));
  }

  function restEl(exId, attr) {
    return document.querySelector("[" + attr + '="' + cssEscape(exId) + '"]');
  }
  function updateRestDisplay(exId) {
    var d = restEl(exId, "data-rest-display");
    if (d) d.textContent = fmtTimer(Math.max(0, restState.remaining));
  }
  function clearRestInterval() {
    if (restInterval) { window.clearInterval(restInterval); restInterval = null; }
  }
  // Fully stop and forget the running timer (used on navigation / reset).
  function stopRest() {
    clearRestInterval();
    restState = { exId: null, remaining: 0 };
  }
  // Start (or restart) the rest timer inside a specific exercise card.
  function startRest(exId, sec) {
    if (!sec) return;
    clearRestInterval();
    restState = { exId: exId, remaining: sec };
    document.querySelectorAll(".rest-timer").forEach(function (w) { w.classList.remove("running", "done"); });
    var w = restEl(exId, "data-rest-for");
    if (w) w.classList.add("running");
    updateRestDisplay(exId);
    restInterval = window.setInterval(function () {
      restState.remaining -= 1;
      if (restState.remaining <= 0) {
        restState.remaining = 0;
        updateRestDisplay(exId);
        clearRestInterval();
        var done = restEl(exId, "data-rest-for");
        if (done) { done.classList.remove("running"); done.classList.add("done"); }
        var disp = restEl(exId, "data-rest-display");
        if (disp) disp.textContent = "Go";
        beep();
        return;
      }
      updateRestDisplay(exId);
    }, 1000);
  }
  // Stop a specific exercise's timer and reset its display to the full rest.
  function resetRest(exId, sec) {
    clearRestInterval();
    restState = { exId: null, remaining: 0 };
    var w = restEl(exId, "data-rest-for");
    if (w) w.classList.remove("running", "done");
    var d = restEl(exId, "data-rest-display");
    if (d) d.textContent = fmtTimer(sec);
  }
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } catch (e) { /* audio not allowed */ }
  }

  // ---- actions ----
  function exportBackup() {
    var blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "rebuild-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Backup downloaded.");
  }

  function saveCheckIn() {
    var parsed = Number(ui.checkWeight);
    if (!isFinite(parsed) || parsed < 50 || parsed > 600) { toast("Enter a body weight between 50 and 600 lb."); return; }
    var entry = {
      id: String(Date.now()),
      date: new Date().toISOString().slice(0, 10),
      weight: parsed,
      waist: ui.checkWaist ? Number(ui.checkWaist) : undefined,
      sleep: ui.checkSleep ? Number(ui.checkSleep) : undefined,
    };
    store.checkIns = [entry].concat(store.checkIns).slice(0, 52);
    save();
    toast("Weekly check-in saved.");
    render();
  }

  // ---- event wiring ----
  function onClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");

    switch (action) {
      case "tab":
        ui.tab = el.getAttribute("data-tab");
        render(); goTop();
        break;
      case "open-workout":
        ui.selectedDay = el.getAttribute("data-day");
        ui.tab = "workouts";
        render(); goTop();
        break;
      case "open-nutrition":
        ui.nutritionDay = el.getAttribute("data-day");
        ui.nutritionMode = "plan";
        ui.tab = "nutrition";
        render(); goTop();
        break;
      case "select-workout-day":
        ui.selectedDay = el.getAttribute("data-day");
        render();
        break;
      case "select-nutrition-day":
        ui.nutritionDay = el.getAttribute("data-day");
        render();
        break;
      case "nutrition-mode":
        ui.nutritionMode = el.getAttribute("data-mode");
        render();
        break;
      case "ob-select-program":
        if (!ui.draft) ui.draft = clone(store.profile);
        ui.draft.program = el.getAttribute("data-program");
        // Tapping a card IS the choice — go straight on rather than making the
        // user hunt for a Continue button below five long cards.
        ui.onboardStep = 1;
        render(); goTop();
        break;
      case "ob-choice":
        if (ui.draft) ui.draft[el.getAttribute("data-field")] = el.getAttribute("data-value");
        render();
        break;
      case "ob-next":
        ui.onboardStep = Math.min(5, ui.onboardStep + 1);
        render(); goTop();
        break;
      case "ob-back":
        ui.onboardStep = Math.max(0, ui.onboardStep - 1);
        render(); goTop();
        break;
      case "ob-finish": {
        var d = ui.draft || clone(store.profile);
        if (!d.startDate) d.startDate = nextMondayISO();
        d.onboarded = true;
        store.profile = clone(d);
        if (d.weight) ui.checkWeight = String(d.weight);
        syncWeekFromStart();
        seedBenchmarks();
        save();
        ui.draft = null;
        ui.onboardStep = 0;
        ui.tab = "home";
        render(); goTop();
        toast("Your plan is ready.");
        break;
      }
      case "redo-assessment":
        ui.draft = clone(store.profile);
        // Start at "About you" so every number is editable (metrics, ability,
        // lifts, goals), not just the field tests.
        ui.onboardStep = 1;
        store.profile.onboarded = false;
        save();
        render(); goTop();
        break;
      case "change-program":
        ui.draft = clone(store.profile);
        ui.onboardStep = 0;
        store.profile.onboarded = false;
        save();
        render(); goTop();
        break;
      case "pick-quick": {
        var qid = el.getAttribute("data-id");
        ui.quickPick = ui.quickPick === qid ? null : qid; // tap again to collapse
        render();
        break;
      }
      case "swap-toggle": {
        var sxid = el.getAttribute("data-ex");
        ui.swapOpen = ui.swapOpen === sxid ? null : sxid;
        render();
        break;
      }
      case "swap-choose": {
        var cxid = el.getAttribute("data-ex");
        var altId = el.getAttribute("data-alt");
        if (altId === "default") delete store.exerciseSwaps[cxid];
        else store.exerciseSwaps[cxid] = altId;
        ui.swapOpen = null;
        save();
        render();
        toast(altId === "default" ? "Back to the recommended movement." : "Swapped.");
        break;
      }
      case "bench-log": {
        var bid = el.getAttribute("data-id");
        var btest = benchTestById(bid);
        var binput = document.querySelector('[data-bench-input="' + cssEscape(bid) + '"]');
        var bval = benchParse(btest, binput ? binput.value : "");
        if (!bval || bval <= 0) { toast(btest && btest.type === "time" ? "Enter a time like 12:30." : "Enter a valid number."); break; }
        if (!Array.isArray(store.benchmarkLog[bid])) store.benchmarkLog[bid] = [];
        store.benchmarkLog[bid].push({ date: todayISO(), value: bval });
        save();
        render();
        toast(btest.label + " logged.");
        break;
      }
      case "body-metric":
        ui.bodyMetric = el.getAttribute("data-metric");
        render();
        break;
      case "train-metric":
        ui.trainMetric = el.getAttribute("data-metric");
        render();
        break;
      case "set-done": {
        var key = el.getAttribute("data-key");
        var cur = store.workoutLogs[key] || { weight: "", reps: "", rpe: "", done: false };
        cur.done = el.checked;
        store.workoutLogs[key] = cur;
        save();
        var row = document.querySelector('[data-set-row="' + cssEscape(key) + '"]');
        if (row) row.classList.toggle("completed", el.checked);
        // Completing a set auto-starts that exercise's rest timer.
        if (el.checked) {
          var restSec = Number(el.getAttribute("data-rest")) || 0;
          if (restSec > 0) startRest(el.getAttribute("data-ex"), restSec);
        }
        break;
      }
      case "log-meal": {
        var mkey = el.getAttribute("data-key");
        store.completedMeals[mkey] = !store.completedMeals[mkey];
        save();
        var card = document.querySelector('[data-meal="' + cssEscape(mkey) + '"]');
        if (card) {
          card.classList.toggle("meal-complete", store.completedMeals[mkey]);
          el.textContent = store.completedMeals[mkey] ? "Logged ✓" : "Log meal";
        }
        break;
      }
      case "shop-check": {
        var skey = el.getAttribute("data-key");
        store.shoppingChecks[skey] = el.checked;
        save();
        var item = document.querySelector('[data-shop="' + cssEscape(skey) + '"]');
        if (item) item.classList.toggle("checked", el.checked);
        break;
      }
      case "reset-shopping":
        store.shoppingChecks = {};
        save();
        render();
        toast("Shopping list reset.");
        break;
      case "finish-workout": {
        var dk = store.currentWeek + ":" + ui.selectedDay;
        var wasDone = Boolean(store.completedWorkouts[dk]);
        store.completedWorkouts[dk] = !wasDone;
        save();
        el.textContent = store.completedWorkouts[dk] ? "Completed ✓" : "Finish workout";
        toast(wasDone ? "Workout reopened." : "Workout completed.");
        break;
      }
      case "rest-start":
        startRest(el.getAttribute("data-ex"), Number(el.getAttribute("data-sec")) || 0);
        break;
      case "rest-reset":
        resetRest(el.getAttribute("data-ex"), Number(el.getAttribute("data-sec")) || 0);
        break;
      case "export":
        exportBackup();
        break;
      case "save-checkin":
        saveCheckIn();
        break;
      default:
        break;
    }
  }

  function onInput(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");

    switch (action) {
      case "set-field": {
        var key = el.getAttribute("data-key");
        var field = el.getAttribute("data-field");
        var cur = store.workoutLogs[key] || { weight: "", reps: "", rpe: "", done: false };
        cur[field] = el.value;
        store.workoutLogs[key] = cur;
        save();
        break;
      }
      case "run-field": {
        var rkey = el.getAttribute("data-key");
        var rfield = el.getAttribute("data-field");
        var rcur = store.runLogs[rkey] || { distance: "", pace: "", rpe: "6" };
        rcur[rfield] = el.value;
        store.runLogs[rkey] = rcur;
        save();
        break;
      }
      case "check-field":
        ui[el.getAttribute("data-field")] = el.value;
        break;
      case "ob-field":
        if (ui.draft) ui.draft[el.getAttribute("data-field")] = el.value;
        // Refresh the live tier / calorie preview once the field is committed,
        // never mid-keystroke (that would steal focus).
        if (e.type === "change") render();
        break;
      case "ob-lift":
        if (ui.draft) {
          ui.draft.lifts = ui.draft.lifts || {};
          ui.draft.lifts[el.getAttribute("data-lift")] = el.value;
        }
        if (e.type === "change") render();
        break;
      case "ob-time": {
        // Recombine the minutes + seconds boxes into the canonical "m:ss".
        var tf = el.getAttribute("data-field");
        var wrap = el.closest("[data-time-for]");
        if (!wrap || !ui.draft) break;
        var miEl = wrap.querySelector('[data-part="min"]');
        var seEl = wrap.querySelector('[data-part="sec"]');
        var mi = miEl ? String(miEl.value).trim() : "";
        var se = seEl ? String(seEl.value).trim() : "";
        if (mi === "" && se === "") {
          ui.draft[tf] = "";
        } else {
          var mnum = parseInt(mi, 10); if (!isFinite(mnum) || mnum < 0) mnum = 0;
          var snum = parseInt(se, 10); if (!isFinite(snum) || snum < 0) snum = 0;
          if (snum > 59) { mnum += Math.floor(snum / 60); snum = snum % 60; } // 13:75 -> 14:15
          ui.draft[tf] = mnum + ":" + String(snum).padStart(2, "0");
        }
        if (e.type === "change") render();
        break;
      }
      case "set-week":
        store.currentWeek = Number(el.value);
        save();
        render();
        break;
      case "set-sleep":
        ui.sleep = el.value;
        persistReadiness();
        updateReadiness();
        break;
      case "set-soreness":
        ui.soreness = el.value;
        persistReadiness();
        updateReadiness();
        break;
      default:
        break;
    }
  }

  function updateReadiness() {
    var box = document.getElementById("readiness-box");
    if (box) box.innerHTML = readinessBox();
  }

  // Readiness is a "this morning" input; persist it stamped with today's date
  // so it restores on a same-day reopen but never shows stale yesterday values.
  function persistReadiness() {
    store.readiness = { date: todayISO(), sleep: ui.sleep, soreness: ui.soreness };
    save();
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  // Escape a value for use inside a quoted [attr="..."] selector. Keys may hold
  // ":", digits, spaces, and "&" (e.g. "Protein & dairy:0"); CSS.escape handles
  // all of them. The fallback only needs to guard the quote/backslash/"]".
  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\\]]/g, "\\$&");
  }

  // ---- boot ----
  function init() {
    load();
    if (store.profile.onboarded) { syncWeekFromStart(); seedBenchmarks(); save(); }
    else ui.draft = clone(store.profile);
    var t = todayKey();
    ui.selectedDay = t;
    ui.nutritionDay = t;
    if (store.readiness.date === todayISO()) {
      ui.sleep = store.readiness.sleep || ui.sleep;
      ui.soreness = store.readiness.soreness || ui.soreness;
    }
    // Seed the check-in weight field from the last check-in, or failing that
    // from the weight entered at onboarding — never a hardcoded default.
    if (store.checkIns[0]) ui.checkWeight = String(store.checkIns[0].weight);
    else if (toNum(store.profile.weight)) ui.checkWeight = String(store.profile.weight);

    render();

    var root = document.getElementById("app");
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput); // selects/checkboxes fire change

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline unavailable */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
