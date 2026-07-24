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
    readiness: { date: "", sleep: "7", soreness: "low" },
  };

  var tabLabels = { today: "Today", workouts: "Workouts", nutrition: "Nutrition", progress: "Progress" };
  var tabIcons = { today: "●", workouts: "▰", nutrition: "◆", progress: "↗" };

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
    if (!Array.isArray(store.checkIns)) store.checkIns = [];
    ["workoutLogs", "runLogs", "completedWorkouts", "completedMeals", "shoppingChecks"].forEach(function (k) {
      if (!store[k] || typeof store[k] !== "object") store[k] = {};
    });
    var w = Number(store.currentWeek);
    store.currentWeek = w >= 1 && w <= 12 ? Math.floor(w) : 1;
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
    dayDef.exercises.forEach(function (ex) {
      var pres = info.deload ? ex.deload : ex.wk[info.idx];
      if (!pres) return;
      exercises.push({
        id: ex.id, name: ex.name, cue: ex.cue, group: ex.group,
        tempo: ex.tempo, rest: ex.rest,
        sets: pres.sets, reps: pres.reps, target: pres.target,
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

  // Turn that history into a concrete load target for this week:
  //   normal   -> last top + the lift's step
  //   RPE 9+   -> repeat the same weight (it was already maximal)
  //   deload   -> ~85% of last top
  function suggestLoad(ex, week) {
    if (RB.noLoadProgress && RB.noLoadProgress.indexOf(ex.id) !== -1) return null;
    var last = lastSessionFor(ex.id, week);
    if (!last) return null;
    var info = blockForWeek(week);
    var deload = !!(info && info.deload);
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

  // ---- screens ----
  function renderToday() {
    var week = store.currentWeek;
    var today = todayKey();
    var session = sessionFor(today, week);
    var plan = RB.nutritionPlans[today];
    var dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    var sub = session.kind === "strength" ? session.subtitle : session.prescription;

    var html = '<section class="screen" aria-labelledby="today-heading">';
    html += '<div class="eyebrow">' + esc(dateStr) + "</div>";
    html += '<h1 id="today-heading">Do the work. Recover. Repeat.</h1>';
    html += '<p class="lead">The goal is not to destroy today. It is to be ready to train again tomorrow.</p>';

    html += '<div class="metric-grid">' +
      '<article class="metric-card"><span>Plan</span><strong>Week ' + week + "</strong><small>" + phaseForWeek(week) + " phase</small></article>" +
      '<article class="metric-card"><span>Nutrition</span><strong>2,500</strong><small>kcal starting target</small></article>' +
      '<article class="metric-card"><span>Protein</span><strong>175+</strong><small>grams per day</small></article></div>';

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
        var sug = suggestLoad(ex, week);
        var effort = sug ? effortPart(ex.target) : ex.target;
        var groupTag = ex.group ? '<span class="group-tag">' + esc(ex.group) + "</span>" : "";
        html += '<article class="exercise-card"><div class="exercise-title"><div><h3>' + groupTag + esc(ex.name) + "</h3><p>" + esc(ex.cue) + "</p></div><span>" + prescribedSets + " × " + esc(ex.reps) + "</span></div>";
        html += '<div class="rx-line">';
        if (ex.tempo && ex.tempo !== "—") html += "<span>Tempo <strong>" + esc(ex.tempo) + "</strong></span>";
        if (ex.rest && ex.rest !== "—") html += "<span>Rest <strong>" + esc(ex.rest) + "</strong></span>";
        if (effort) html += '<span class="rx-target"><strong>' + esc(effort) + "</strong></span>";
        html += "</div>";
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
      var plan = RB.nutritionPlans[day];
      html += dayPicker(day, "select-nutrition-day");
      html += '<article class="nutrition-summary"><div><span class="eyebrow">' + esc(plan.focus) + "</span><h2>" + plan.macros.calories + " kcal · " + plan.macros.protein + " g protein</h2><p>" + esc(plan.fuel) + "</p></div>" + macroLine(plan.macros) + "</article>";

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
          '<div class="meal-heading"><div><span>' + esc(meal.timing) + "</span><h2>" + esc(meal.name) + "</h2></div>" +
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

  function renderProgress() {
    var latest = store.checkIns[0];
    var weight = latest ? latest.weight : 200;
    var weightProgress = Math.max(0, Math.min(100, ((200 - weight) / 15) * 100));

    var html = '<section class="screen" aria-labelledby="progress-heading">';
    html += '<div class="screen-title-row"><div><span class="eyebrow">Weekly evidence</span><h1 id="progress-heading">Progress</h1></div><button class="text-button" type="button" data-action="export">Export backup</button></div>';

    html += '<div class="progress-hero"><div><span>Current weight</span><strong>' + weight.toFixed(1) + ' lb</strong><small>Goal: 185 lb</small></div>' +
      '<div class="goal-ring" style="--progress:' + weightProgress + '%"><span>' + Math.round(weightProgress) + "%</span></div></div>";

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
    html += statTile("Weight", latest ? weight.toFixed(1) + ' <span class="stat-unit">lb</span>' : "—", deltaSub(seriesDelta("weight"), "lb", true));
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

    var b = store.benchmarks;
    html += '<section class="section-block"><div class="section-heading"><div><span class="eyebrow">Retest deliberately</span><h2>Benchmarks</h2></div></div>' +
      '<div class="benchmark-list">' +
      '<label><span>5K time</span><input placeholder="Not tested" value="' + esc(b.fiveK) + '" data-action="benchmark" data-field="fiveK" /><small>Formal test in week 12</small></label>' +
      '<label><span>Strict pull-ups</span><input inputmode="numeric" value="' + esc(b.pullups) + '" data-action="benchmark" data-field="pullups" /><small>Stop when form changes</small></label>' +
      '<label><span>Easy pace</span><input value="' + esc(b.easyPace) + '" data-action="benchmark" data-field="easyPace" /><small>At RPE 3–4</small></label></div></section>';

    html += '<div class="rule-card"><strong>Nutrition adjustment</strong><p>Lose 0.5–1.0 lb/week with good workouts: hold. Lose more than 1.25 lb/week or see performance decline: add 150–200 calories, mainly carbohydrates. If waist shrinks and strength improves even with slower scale loss, hold.</p></div>';

    html += "</section>";
    return html;
  }

  // ---- top-level render ----
  function renderTopbar() {
    var week = store.currentWeek;
    var el = document.getElementById("topbar");
    el.innerHTML =
      '<div class="brand-mark" aria-hidden="true">R</div>' +
      '<div class="brand-copy"><p>REBUILD</p><span>Hybrid training · Week ' + week + "</span></div>" +
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
    if (ui.tab === "today") main.innerHTML = renderToday();
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
      case "benchmark": {
        var bfield = el.getAttribute("data-field");
        store.benchmarks[bfield] = el.value;
        save();
        break;
      }
      case "check-field":
        ui[el.getAttribute("data-field")] = el.value;
        break;
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
    var t = todayKey();
    ui.selectedDay = t;
    ui.nutritionDay = t;
    if (store.readiness.date === todayISO()) {
      ui.sleep = store.readiness.sleep || ui.sleep;
      ui.soreness = store.readiness.soreness || ui.soreness;
    }
    if (store.checkIns[0]) ui.checkWeight = String(store.checkIns[0].weight);

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
