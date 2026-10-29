(() => {
  "use strict";

  // ---------- Datos ----------
  const D = window.CHILE_DATA;
  const REG = D.regiones;
  const COM = D.comunas;
  const regByCode = new Map(REG.map((r) => [r.c, r]));
  const comByCode = new Map(COM.map((c) => [c.c, c]));

  const REG_SHORT = {
    15: "Arica y Parinacota", 1: "Tarapacá", 2: "Antofagasta", 3: "Atacama", 4: "Coquimbo",
    5: "Valparaíso", 13: "Metropolitana", 6: "O'Higgins", 7: "Maule", 16: "Ñuble",
    8: "Biobío", 9: "La Araucanía", 14: "Los Ríos", 10: "Los Lagos", 11: "Aysén", 12: "Magallanes",
  };
  const REG_FULL = {
    15: "Región de Arica y Parinacota", 1: "Región de Tarapacá", 2: "Región de Antofagasta",
    3: "Región de Atacama", 4: "Región de Coquimbo", 5: "Región de Valparaíso",
    13: "Región Metropolitana de Santiago", 6: "Región del Libertador General Bernardo O'Higgins",
    7: "Región del Maule", 16: "Región de Ñuble", 8: "Región del Biobío", 9: "Región de La Araucanía",
    14: "Región de Los Ríos", 10: "Región de Los Lagos", 11: "Región de Aysén del General Carlos Ibáñez del Campo",
    12: "Región de Magallanes y de la Antártica Chilena",
  };
  REG.forEach((r) => { r.short = REG_SHORT[r.c]; r.full = REG_FULL[r.c]; });

  // Nombres alternativos aceptados en el modo infinito.
  const ALIAS = {
    coihaique: "Coyhaique", llayllay: "Llaillay", paiguano: "Paihuano", aisen: "Aysén",
    marchihue: "Marchigüe", trehuaco: "Treguaco", calera: "La Calera", chollchol: "Cholchol",
    quinchaoachao: "Quinchao", santiagocentro: "Santiago", alhue: "Alhué", lareina: "La Reina",
    antartica: "Antártica", antarticachilena: "Antártica", rapanui: "Isla de Pascua",
    sanjosedelamariquina: "Mariquina", puertonatales: "Natales", natales: "Natales",
  };

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fmt = (n) => n.toLocaleString("es-CL");
  const $ = (sel, root = document) => root.querySelector(sel);
  const SVGNS = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
    return e;
  }
  function sv(tag, attrs = {}) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
  };

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 1800);
  }

  // ---------- Día (hora de Chile) y aleatoriedad con semilla ----------
  function chileParts(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]));
    return p;
  }
  const TP = chileParts();
  const TODAY = `${TP.year}-${TP.month}-${TP.day}`;
  const DAY = Math.round((Date.parse(TODAY) - Date.parse("2026-01-01")) / 864e5);
  const NUM = DAY + 1;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Recorre la lista completa antes de repetir; cada ciclo usa un orden distinto.
  function dailyPick(list, salt) {
    const cycle = Math.floor(DAY / list.length);
    const order = shuffle(list, rng(hash(`${salt}:${cycle}`)));
    return order[((DAY % list.length) + list.length) % list.length];
  }

  // ---------- Geografía ----------
  const R_EARTH = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  function distance(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  const ARROWS = ["⬆️", "↗️", "➡️", "↘️", "⬇️", "↙️", "⬅️", "↖️"];
  const arrow = (deg) => ARROWS[Math.round(deg / 45) % 8];
  const MAX_KM = 4300; // Arica – Puerto Williams aprox.
  const proximity = (km) => Math.max(0, Math.round((1 - km / MAX_KM) * 100));

  function viewBoxOf(bb, padFrac = 0.06, minSize = 0) {
    let [x0, y0, x1, y1] = bb;
    let w = x1 - x0, h = y1 - y0;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    w = Math.max(w * (1 + padFrac * 2), minSize);
    h = Math.max(h * (1 + padFrac * 2), minSize);
    return [cx - w / 2, cy - h / 2, w, h];
  }

  // ---------- Autocompletar ----------
  function autocomplete(input, getItems, onPick) {
    const list = el("ul", { class: "ac-list", hidden: true });
    input.after(list);
    let shown = [], sel = 0;
    const close = () => { list.hidden = true; shown = []; };
    function render() {
      const q = norm(input.value);
      if (!q) return close();
      const items = getItems();
      const starts = [], contains = [];
      for (const it of items) {
        if (it.keys.some((k) => k.startsWith(q))) starts.push(it);
        else if (it.keys.some((k) => k.includes(q))) contains.push(it);
      }
      shown = starts.concat(contains).slice(0, 8);
      sel = 0;
      list.replaceChildren(...shown.map((it, i) => el("li", {
        class: i === sel ? "sel" : "",
        onpointerdown: (e) => { e.preventDefault(); pick(it); },
      }, it.label, it.sub ? el("small", {}, it.sub) : null)));
      list.hidden = shown.length === 0;
    }
    function pick(it) { input.value = ""; close(); onPick(it); }
    input.addEventListener("input", render);
    input.addEventListener("blur", () => setTimeout(close, 100));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!shown.length) return;
        e.preventDefault();
        sel = (sel + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
        [...list.children].forEach((li, i) => li.classList.toggle("sel", i === sel));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (shown.length) pick(shown[sel]);
        else if (input.value.trim()) toast("No está en la lista");
      } else if (e.key === "Escape") close();
    });
    return { submit() { if (shown.length) pick(shown[sel]); else if (input.value.trim()) toast("Elige una opción de la lista"); } };
  }

  // ---------- Estadísticas ----------
  const STATS_KEY = "chiledle:stats";
  function getStats() { return store.get(STATS_KEY, {}); }
  function recordResult(mode, won, tries) {
    const all = getStats();
    const s = all[mode] || { played: 0, wins: 0, streak: 0, max: 0, last: null, dist: {} };
    if (s.last === TODAY) return;
    s.played++;
    const yesterday = new Date(Date.parse(TODAY) - 864e5).toISOString().slice(0, 10);
    if (won) {
      s.wins++;
      s.streak = s.last === yesterday && s.lastWon ? s.streak + 1 : 1;
      s.max = Math.max(s.max, s.streak);
      s.dist[tries] = (s.dist[tries] || 0) + 1;
    } else {
      s.streak = 0;
      s.dist.X = (s.dist.X || 0) + 1;
    }
    s.last = TODAY;
    s.lastWon = won;
    all[mode] = s;
    store.set(STATS_KEY, all);
  }

  function nextCountdown() {
    const p = chileParts();
    const left = 86400 - (+p.hour * 3600 + +p.minute * 60 + +p.second);
    const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60);
    return `Próximo desafío en ${h} h ${String(m).padStart(2, "0")} min`;
  }

  function showStats() {
    const all = getStats();
    const names = { region: "Región", comuna: "Comuna", ordenar: "Ordenar" };
    const body = $("#stats-body");
    body.replaceChildren();
    for (const [k, title] of Object.entries(names)) {
      const s = all[k] || { played: 0, wins: 0, streak: 0, max: 0, dist: {} };
      body.append(el("h3", {}, title));
      body.append(el("div", { class: "stats-grid" },
        el("div", {}, el("b", {}, s.played), el("span", {}, "Jugadas")),
        el("div", {}, el("b", {}, s.played ? Math.round((100 * s.wins) / s.played) : 0), el("span", {}, "% Ganadas")),
        el("div", {}, el("b", {}, s.streak), el("span", {}, "Racha")),
        el("div", {}, el("b", {}, s.max), el("span", {}, "Mejor racha"))));
      const rows = k === "ordenar" ? ["1", "2", "3", "X"] : ["1", "2", "3", "4", "5", "6", "X"];
      const max = Math.max(1, ...rows.map((r) => s.dist[r] || 0));
      body.append(el("div", { class: "dist" }, rows.map((r) => el("div", {}, el("span", {}, r),
        el("i", { style: `width:${Math.max(6, (100 * (s.dist[r] || 0)) / max)}%` }, s.dist[r] || 0)))));
    }
    $("#next-in").textContent = nextCountdown();
    $("#dlg-stats").showModal();
  }

  async function share(text) {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Resultado copiado"); }
    } catch { toast("No se pudo compartir"); }
  }
  const siteUrl = () => location.origin + location.pathname;

  function squares(p) {
    const full = Math.floor(p / 20);
    const half = p % 20 >= 10 && full < 5 ? 1 : 0;
    return "🟩".repeat(full) + "🟨".repeat(half) + "⬜".repeat(5 - full - half);
  }

  // ---------- Juego diario de siluetas (Región / Comuna) ----------
  const MAX_TRIES = 6;

  function silhouetteSvg(item) {
    const svg = sv("svg", { viewBox: viewBoxOf(item.bb).join(" "), preserveAspectRatio: "xMidYMid meet" });
    svg.append(sv("path", { d: item.d }));
    return svg;
  }

  function choiceQuestion(q, correct, distractors, rand, note) {
    const opts = shuffle([correct, ...distractors.slice(0, 3)], rand);
    return { q, options: opts, answer: opts.indexOf(correct), note };
  }

  function SilhouetteGame(cfg) {
    // cfg: mode, root, title, items, target, practice, itemLabel, itemSub, bonus(target, rand), minimap(target, guesses)
    const key = `chiledle:${cfg.mode}:${TODAY}`;
    const state = cfg.practice ? { guesses: [], bonus: [] } : store.get(key, { guesses: [], bonus: [] });
    const target = cfg.target;
    const rand = rng(hash(`${cfg.mode}:${TODAY}:${target.c}:${cfg.practice ? Math.random() : ""}`));
    const bonus = cfg.bonus(target, rand);
    const save = () => { if (!cfg.practice) store.set(key, state); };
    const won = () => state.guesses.includes(target.c);
    const done = () => won() || state.guesses.length >= MAX_TRIES;

    function guessRow(code, isNew) {
      if (code == null) return el("div", { class: "guess empty" }, el("div"), el("div"), el("div"), el("div"));
      const g = cfg.items.find((x) => x.c === code);
      const ok = code === target.c;
      const km = Math.round(distance(g, target));
      return el("div", { class: `guess${ok ? " win" : ""}${isNew ? " pop" : ""}` },
        el("div", { title: cfg.itemLabel(g) }, cfg.itemLabel(g)),
        el("div", {}, `${fmt(km)} km`),
        el("div", {}, ok ? "🎉" : arrow(bearing(g, target))),
        el("div", {}, `${ok ? 100 : proximity(km)}%`));
    }

    function render(newIdx = -1) {
      const root = cfg.root;
      root.replaceChildren();
      root.append(el("div", { class: "game-head" },
        el("h2", {}, cfg.title),
        el("span", { class: "muted" }, cfg.practice ? "Práctica" : `#${NUM}`)));
      const sil = el("div", { class: "silhouette" });
      sil.append(silhouetteSvg(target));
      root.append(sil);

      const rows = [];
      for (let i = 0; i < MAX_TRIES; i++) rows.push(guessRow(state.guesses[i], i === newIdx));
      root.append(el("div", { class: "guesses" }, rows));

      if (!done()) {
        const input = el("input", { type: "text", placeholder: cfg.placeholder, autocomplete: "off", spellcheck: "false" });
        const wrap = el("div", { class: "ac" }, input);
        const ac = autocomplete(input,
          () => cfg.items.filter((x) => !state.guesses.includes(x.c)).map((x) => ({
            label: cfg.itemLabel(x), sub: cfg.itemSub(x), keys: cfg.keys(x), value: x.c,
          })),
          (it) => guess(it.value));
        root.append(el("div", { class: "row" }, wrap, el("button", { class: "btn", onclick: () => ac.submit() }, "Adivinar")));
        if (newIdx >= 0 || cfg.focus) input.focus();
        return;
      }
      renderResult(root);
    }

    function guess(code) {
      if (state.guesses.includes(code) || done()) return;
      state.guesses.push(code);
      save();
      if (done() && !cfg.practice) recordResult(cfg.mode, won(), state.guesses.length);
      render(state.guesses.length - 1);
      if (done()) toast(won() ? "¡Correcto! 🇨🇱" : `Era ${cfg.itemLabel(target)}`);
    }

    function renderResult(root) {
      const res = el("div", { class: "result" },
        el("h3", {}, won() ? "¡Lo lograste!" : "La respuesta era"),
        el("div", { class: "answer" }, cfg.itemLabel(target)),
        el("div", { class: "muted" }, cfg.itemSub(target)));
      const mm = el("div", { class: "minimap" });
      mm.append(cfg.minimap(target, state.guesses));
      res.append(mm);
      root.append(res);

      // Rondas bonus: se muestran de a una.
      for (let i = 0; i < bonus.length; i++) {
        const b = bonus[i];
        const picked = state.bonus[i];
        const box = el("div", { class: "bonus" }, el("h4", {}, `⭐ Bonus ${i + 1}/${bonus.length}: ${b.q}`));
        const opts = el("div", { class: "opts" });
        b.options.forEach((o, j) => {
          let cls = "opt";
          if (picked != null) {
            if (j === b.answer) cls += " correct";
            else if (j === picked) cls += " wrong";
          }
          opts.append(el("button", {
            class: cls, disabled: picked != null,
            onclick: () => { state.bonus[i] = j; save(); render(); },
          }, o));
        });
        box.append(opts);
        if (picked != null && b.note) box.append(el("p", { class: "note muted" }, b.note));
        root.append(box);
        if (picked == null) break;
      }

      const actions = el("div", { class: "actions" });
      if (!cfg.practice) actions.append(el("button", { class: "btn", onclick: () => share(shareText()) }, "Compartir"));
      actions.append(el("button", { class: "btn btn-red", onclick: cfg.onPractice }, cfg.practice ? "Otra más" : "Jugar práctica"));
      if (cfg.practice) actions.append(el("button", { class: "btn btn-ghost", onclick: cfg.onDaily }, "Volver al diario"));
      if (cfg.extraAction) actions.append(cfg.extraAction(target));
      root.append(actions);
    }

    function shareText() {
      const lines = [`#Chiledle ${cfg.title} #${NUM} ${won() ? state.guesses.length : "X"}/${MAX_TRIES}`];
      for (const code of state.guesses) {
        const g = cfg.items.find((x) => x.c === code);
        if (code === target.c) lines.push("🟩🟩🟩🟩🟩🎉");
        else {
          const km = distance(g, target);
          lines.push(squares(proximity(km)) + arrow(bearing(g, target)));
        }
      }
      const stars = bonus.map((b, i) => (state.bonus[i] === b.answer ? "⭐" : state.bonus[i] == null ? "" : "✖️")).join("");
      if (stars) lines.push(stars);
      lines.push(siteUrl());
      return lines.join("\n");
    }

    render();
  }

  // ---------- Minimapas ----------
  function regionMinimap(target, guesses) {
    const svg = sv("svg", { viewBox: viewBoxOf(target.bb, 0.6, 5).join(" "), preserveAspectRatio: "xMidYMid meet" });
    for (const r of REG) {
      const cls = r.c === target.c ? "target" : guesses.includes(r.c) ? "guessed" : "";
      svg.append(sv("path", { d: r.d, class: cls }));
    }
    return svg;
  }
  function comunaMinimap(target, guesses) {
    const [x0, y0, x1, y1] = target.bb;
    const size = Math.max(x1 - x0, y1 - y0);
    const svg = sv("svg", { viewBox: viewBoxOf(target.bb, 1.2, Math.max(0.8, size * 3)).join(" "), preserveAspectRatio: "xMidYMid meet" });
    for (const c of COM) {
      if (!c.d || (c.isla && c.c !== target.c)) continue;
      const cls = c.c === target.c ? "target" : guesses.includes(c.c) ? "guessed" : "";
      svg.append(sv("path", { d: c.d, class: cls }));
    }
    const reg = regByCode.get(target.r);
    svg.append(sv("path", { d: reg.d, style: "fill:none;stroke:var(--map-region);stroke-width:1.5" }));
    return svg;
  }

  // ---------- Bonus ----------
  function regionBonus(target, rand) {
    const coms = COM.filter((c) => c.r === target.c).sort((a, b) => b.pop - a.pop);
    const otherCaps = shuffle(REG.filter((r) => r.c !== target.c).map((r) => r.cap), rand);
    const localBig = coms.map((c) => c.n).filter((n) => n !== target.cap).slice(0, 2);
    const capQ = choiceQuestion("¿Cuál es la capital regional?", target.cap,
      [...localBig, ...otherCaps.filter((n) => !localBig.includes(n))], rand,
      `La capital de la ${target.full} es ${target.cap}.`);

    const top = coms[0];
    const popQ = choiceQuestion("¿Cuál es la comuna con más habitantes?", top.n, coms.slice(1, 4).map((c) => c.n), rand,
      coms.slice(0, 4).map((c) => `${c.n}: ${fmt(c.pop)}`).join(" · "));

    const n = coms.length;
    const counts = new Set([n]);
    const deltas = shuffle([-9, -6, -4, -3, 3, 4, 6, 9, 12], rand);
    for (const d of deltas) { if (counts.size >= 4) break; if (n + d > 0) counts.add(n + d); }
    const cntQ = choiceQuestion("¿Cuántas comunas tiene?", String(n),
      [...counts].filter((x) => x !== n).map(String), rand, `Tiene ${n} comunas y ${fmt(target.pop)} habitantes (Censo 2017).`);
    cntQ.options.sort((a, b) => a - b);
    cntQ.answer = cntQ.options.indexOf(String(n));
    return [capQ, popQ, cntQ];
  }

  function comunaBonus(target, rand) {
    const reg = regByCode.get(target.r);
    const nearRegs = REG.filter((r) => r.c !== reg.c).sort((a, b) => Math.abs(a.o - reg.o) - Math.abs(b.o - reg.o));
    const regQ = choiceQuestion("¿A qué región pertenece?", reg.short,
      shuffle(nearRegs.slice(0, 5), rand).map((r) => r.short), rand,
      `${target.n} está en la provincia de ${target.pv}, ${reg.full}.`);

    const near = COM.filter((c) => c.c !== target.c && c.r === target.r && c.cab !== target.cab)
      .sort((a, b) => distance(a, target) - distance(b, target));
    const cabQ = choiceQuestion("¿Cuál es su ciudad principal (cabecera comunal)?", target.cab,
      shuffle(near.slice(0, 6), rand).map((c) => c.cab), rand,
      target.cab === target.n ? `La cabecera comunal es la ciudad de ${target.cab}.` : `La cabecera de ${target.n} es ${target.cab}.`);

    const others = shuffle(COM.filter((c) => {
      const ratio = c.pop / target.pop;
      return ratio > 1.6 || ratio < 0.6;
    }), rand);
    const picks = [];
    for (const c of others) {
      if (picks.every((p) => p / c.pop > 1.5 || p / c.pop < 0.66)) picks.push(c.pop);
      if (picks.length === 3) break;
    }
    const popQ = choiceQuestion("¿Cuántos habitantes tiene?", fmt(target.pop), picks.map(fmt), rand,
      `${target.n} tenía ${fmt(target.pop)} habitantes en el Censo 2017.`);
    const vals = [target.pop, ...picks].sort((a, b) => a - b).map(fmt);
    popQ.options = vals;
    popQ.answer = vals.indexOf(fmt(target.pop));
    return [regQ, cabQ, popQ];
  }

  // ---------- Pestañas Región y Comuna ----------
  const regionItems = REG;
  const comunaPool = COM.filter((c) => c.d && !c.isla);

  function startRegion(practice) {
    const target = practice ? REG[Math.floor(Math.random() * REG.length)] : dailyPick(REG, "region");
    SilhouetteGame({
      mode: "region", root: $("#tab-region"), title: "Región", items: regionItems, target, practice,
      placeholder: "¿Qué región es?",
      itemLabel: (r) => r.short,
      itemSub: (r) => r.rom === "RM" ? "Región Metropolitana" : `Región ${r.rom}`,
      keys: (r) => [norm(r.short), norm(r.n), norm(r.rom)],
      bonus: regionBonus, minimap: regionMinimap,
      onPractice: () => startRegion(true), onDaily: () => startRegion(false),
      extraAction: (t) => el("button", { class: "btn btn-ghost", onclick: () => openInfinite(t.c) }, `Nombrar sus comunas`),
      focus: practice,
    });
  }
  function startComuna(practice) {
    const target = practice ? comunaPool[Math.floor(Math.random() * comunaPool.length)] : dailyPick(comunaPool, "comuna");
    SilhouetteGame({
      mode: "comuna", root: $("#tab-comuna"), title: "Comuna", items: COM.filter((c) => c.c !== 12202), target, practice,
      placeholder: "¿Qué comuna es?",
      itemLabel: (c) => c.n,
      itemSub: (c) => regByCode.get(c.r).short,
      keys: (c) => [norm(c.n)],
      bonus: comunaBonus, minimap: comunaMinimap,
      onPractice: () => startComuna(true), onDaily: () => startComuna(false),
      focus: practice,
    });
  }

  // ---------- Ordenar por habitantes ----------
  const ORDER_N = 6, ORDER_TRIES = 3;
  function pickOrderSet(rand) {
    const pool = shuffle(COM.filter((c) => c.pop >= 15000), rand);
    const out = [];
    for (const c of pool) {
      if (out.every((o) => Math.max(o.pop, c.pop) / Math.min(o.pop, c.pop) >= 1.12)) out.push(c);
      if (out.length === ORDER_N) break;
    }
    return out;
  }

  function startOrdenar(practice) {
    const root = $("#tab-ordenar");
    const key = `chiledle:ordenar:${TODAY}`;
    const rand = rng(practice ? (Math.random() * 2 ** 32) >>> 0 : hash(`ordenar:${DAY}`));
    const set = pickOrderSet(rand);
    const correct = set.slice().sort((a, b) => b.pop - a.pop).map((c) => c.c);
    const fresh = { order: shuffle(set.map((c) => c.c), rand), locked: [], tries: [], done: false };
    const state = practice ? fresh : store.get(key, fresh);
    const save = () => { if (!practice) store.set(key, state); };
    const won = () => state.locked.length === ORDER_N;

    function render() {
      root.replaceChildren();
      root.append(el("div", { class: "game-head" },
        el("h2", {}, "Ordena por habitantes"),
        el("span", { class: "muted" }, practice ? "Práctica" : `#${NUM}`)));
      root.append(el("p", { class: "muted" }, "De mayor a menor población (comuna, Censo 2017). Arrastra o usa las flechas."));
      root.append(el("div", { class: "tries" },
        Array.from({ length: ORDER_TRIES }, (_, i) => el("span", { class: i < state.tries.length ? "used" : "" }))));

      const list = el("ol", { class: "order-list" });
      state.order.forEach((code, i) => {
        const c = comByCode.get(code);
        const locked = state.locked.includes(i);
        const wrong = state.tries.length && !locked && !state.done;
        const item = el("li", { class: `order-item${locked ? " locked" : ""}${wrong ? " wrong" : ""}`, "data-i": i },
          el("span", { class: "pos" }, i + 1),
          el("span", { class: "nm" }, c.cab === c.n ? c.n : `${c.n}`,
            el("small", {}, `${c.cab !== c.n ? `ciudad: ${c.cab} · ` : ""}${regByCode.get(c.r).short}`)),
          state.done
            ? el("span", { class: "popn" }, fmt(c.pop))
            : el("span", { class: "mv" },
              el("button", { "aria-label": "Subir", onclick: () => move(i, -1) }, "▲"),
              el("button", { "aria-label": "Bajar", onclick: () => move(i, 1) }, "▼")));
        if (!locked && !state.done) enableDrag(item, list);
        list.append(item);
      });
      root.append(list);

      if (!state.done) {
        root.append(el("button", { class: "btn btn-wide", onclick: check }, "Comprobar"));
      } else {
        root.append(el("div", { class: "result" },
          el("h3", {}, won() ? `¡Perfecto en ${state.tries.length}/${ORDER_TRIES}!` : "Orden correcto"),
          won() ? null : el("ol", { style: "text-align:left;margin:6px 0 0" },
            correct.map((code) => { const c = comByCode.get(code); return el("li", {}, `${c.n} — ${fmt(c.pop)}`); }))));
        const actions = el("div", { class: "actions" });
        if (!practice) actions.append(el("button", { class: "btn", onclick: () => share(shareText()) }, "Compartir"));
        actions.append(el("button", { class: "btn btn-red", onclick: () => startOrdenar(true) }, practice ? "Otra más" : "Jugar práctica"));
        if (practice) actions.append(el("button", { class: "btn btn-ghost", onclick: () => startOrdenar(false) }, "Volver al diario"));
        root.append(actions);
      }
    }

    // Mueve el elemento i a la siguiente posición libre en la dirección dada.
    function move(i, dir) {
      let j = i + dir;
      while (j >= 0 && j < ORDER_N && state.locked.includes(j)) j += dir;
      if (j < 0 || j >= ORDER_N) return;
      [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
      save();
      render();
    }

    function enableDrag(item, list) {
      item.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        e.preventDefault();
        item.setPointerCapture(e.pointerId);
        item.classList.add("dragging");
        let over = null;
        const onMove = (ev) => {
          const hit = [...list.children].find((li) => {
            const r = li.getBoundingClientRect();
            return li !== item && !li.classList.contains("locked") && ev.clientY > r.top && ev.clientY < r.bottom;
          }) || null;
          if (hit === over) return;
          over?.classList.remove("drop");
          over = hit;
          over?.classList.add("drop");
        };
        const onUp = () => {
          item.removeEventListener("pointermove", onMove);
          item.removeEventListener("pointerup", onUp);
          item.removeEventListener("pointercancel", onUp);
          if (over) {
            const a = +item.dataset.i, b = +over.dataset.i;
            [state.order[a], state.order[b]] = [state.order[b], state.order[a]];
            save();
          }
          render();
        };
        item.addEventListener("pointermove", onMove);
        item.addEventListener("pointerup", onUp);
        item.addEventListener("pointercancel", onUp);
      });
    }

    function check() {
      const row = state.order.map((code, i) => code === correct[i]);
      state.locked = row.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0);
      state.tries.push(row);
      if (won() || state.tries.length >= ORDER_TRIES) {
        state.done = true;
        if (!won()) state.order = correct.slice();
        if (!practice) recordResult("ordenar", won(), state.tries.length);
        toast(won() ? "¡Perfecto! 🇨🇱" : "Se acabaron los intentos");
      } else {
        toast(`${state.locked.length}/${ORDER_N} en su lugar`);
      }
      save();
      render();
    }

    function shareText() {
      const lines = [`#Chiledle Ordenar #${NUM} ${won() ? state.tries.length : "X"}/${ORDER_TRIES}`];
      for (const row of state.tries) lines.push(row.map((ok) => (ok ? "🟩" : "🟥")).join(""));
      lines.push(siteUrl());
      return lines.join("\n");
    }

    render();
  }

  // ---------- Modo infinito: nombrar todas las comunas ----------
  const INF_KEY = "chiledle:infinito";
  const inf = {
    state: store.get(INF_KEY, { found: [], elapsed: 0, gaveUp: [] }),
    scope: 0, // 0 = todo Chile; otro = código de región
    nodes: new Map(),
    started: null,
    vb: null,
  };
  const lookup = new Map();
  for (const c of COM) lookup.set(norm(c.n), c);
  for (const [a, n] of Object.entries(ALIAS)) {
    const c = COM.find((x) => x.n === n);
    if (c) lookup.set(a, c);
  }
  const keysOf = new Map(COM.map((c) => [c.c, [...lookup.entries()].filter(([, v]) => v === c).map(([k]) => k)]));

  const inScope = (c) => inf.scope === 0 || c.r === inf.scope;
  const scopeList = () => COM.filter(inScope);
  const foundSet = () => new Set(inf.state.found);
  const saveInf = () => store.set(INF_KEY, inf.state);

  // Insets para islas lejanas y la Antártica (en unidades del mapa).
  const proj = (lon, lat) => [(lon + 71) * Math.cos(rad(lat)), -lat]; // igual que tools/build_data.py
  const INSETS = [
    { id: "pascua", label: "Isla de Pascua", box: [-10.2, 25.6, 4.4, 3.2], center: proj(-109.35, -27.12), scale: 7 },
    { id: "juanfernandez", label: "Archipiélago Juan Fernández", box: [-10.2, 30.2, 4.4, 3.2], center: proj(-79.0, -33.66), scale: 10 },
    { id: "antartica", label: "Antártica", box: [-10.2, 34.8, 4.4, 2.2] },
  ];
  const MAIN_BB = (() => {
    const bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const c of COM) {
      if (!c.bb || c.isla) continue;
      bb[0] = Math.min(bb[0], c.bb[0]); bb[1] = Math.min(bb[1], c.bb[1]);
      bb[2] = Math.max(bb[2], c.bb[2]); bb[3] = Math.max(bb[3], c.bb[3]);
    }
    bb[0] = -10.4;
    return bb;
  })();

  function buildMap() {
    const svg = $("#inf-map");
    const defs = sv("defs");
    svg.append(defs);
    const gMain = sv("g");
    gMain.append(sv("path", { d: D.sinDemarcar.d, class: "nodem" }));
    for (const c of COM) {
      if (c.isla) continue;
      const p = sv("path", { d: c.d, class: "com" });
      p.dataset.c = c.c;
      inf.nodes.set(c.c, p);
      gMain.append(p);
    }
    for (const r of REG) gMain.append(sv("path", { d: r.d, class: "reg" }));
    svg.append(gMain);

    for (const ins of INSETS) {
      const [x, y, w, h] = ins.box;
      const g = sv("g");
      g.append(sv("rect", { x, y, width: w, height: h, class: "inset", rx: 0.15 }));
      const t = sv("text", { x: x + 0.15, y: y + 0.45 });
      t.textContent = ins.label;
      g.append(t);
      const c = COM.find((k) => k.isla === ins.id);
      if (ins.id === "antartica") {
        const r = sv("rect", { x: x + 0.6, y: y + 0.8, width: w - 1.2, height: h - 1.2, rx: 0.2, class: "com" });
        r.dataset.c = c.c;
        inf.nodes.set(c.c, r);
        g.append(r);
      } else {
        const clip = sv("clipPath", { id: `clip-${ins.id}` });
        clip.append(sv("rect", { x, y, width: w, height: h }));
        defs.append(clip);
        const cx = x + w / 2, cy = y + h / 2 + 0.2;
        const inner = sv("g", { "clip-path": `url(#clip-${ins.id})` });
        const tr = sv("g", { transform: `translate(${cx} ${cy}) scale(${ins.scale}) translate(${-ins.center[0]} ${-ins.center[1]})` });
        const p = sv("path", { d: c.d, class: "com" });
        p.dataset.c = c.c;
        inf.nodes.set(c.c, p);
        tr.append(p);
        inner.append(tr);
        g.append(inner);
      }
      svg.append(g);
    }

    setupPanZoom(svg);
    svg.addEventListener("pointermove", (e) => {
      const tip = $("#map-tip");
      const code = e.target.dataset && e.target.dataset.c;
      const c = code && comByCode.get(+code);
      if (!c || !(foundSet().has(c.c) || inf.state.gaveUp.includes(c.r))) { tip.hidden = true; return; }
      const r = $("#map-wrap").getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = `${c.n} · ${regByCode.get(c.r).short}`;
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
    });
    svg.addEventListener("pointerleave", () => { $("#map-tip").hidden = true; });
  }

  function setVB(vb) {
    inf.vb = vb;
    $("#inf-map").setAttribute("viewBox", vb.join(" "));
  }
  function fitTo(bb) {
    const wrap = $("#map-wrap").getBoundingClientRect();
    const aspect = wrap.width / Math.max(1, wrap.height) || 0.5;
    let [x, y, w, h] = viewBoxOf(bb, 0.04);
    if (w / h < aspect) { const nw = h * aspect; x -= (nw - w) / 2; w = nw; }
    else { const nh = w / aspect; y -= (nh - h) / 2; h = nh; }
    setVB([x, y, w, h]);
  }
  function fitScope() {
    if (inf.scope === 0) fitTo(MAIN_BB);
    else fitTo(regByCode.get(inf.scope).bb);
  }

  function setupPanZoom(svg) {
    const pts = new Map();
    let last = null;
    const toUnits = (dx, dy) => {
      const r = svg.getBoundingClientRect();
      const s = Math.max(inf.vb[2] / r.width, inf.vb[3] / r.height);
      return [dx * s, dy * s];
    };
    const zoomAt = (factor, cx, cy) => {
      const r = svg.getBoundingClientRect();
      const [x, y, w, h] = inf.vb;
      const nw = Math.min(Math.max(w * factor, 0.05), 80), nh = (h * nw) / w;
      const s = Math.max(w / r.width, h / r.height);
      const ox = x + (w - r.width * s) / 2, oy = y + (h - r.height * s) / 2;
      const px = ox + (cx - r.left) * s, py = oy + (cy - r.top) * s;
      const k = nw / w;
      setVB([px - (px - x) * k, py - (py - y) * k, nw, nh]);
    };
    svg.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    svg.addEventListener("pointerdown", (e) => {
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      svg.classList.add("grabbing");
      last = null;
    });
    svg.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) {
        const [dx, dy] = toUnits(e.clientX - prev[0], e.clientY - prev[1]);
        const [x, y, w, h] = inf.vb;
        setVB([x - dx, y - dy, w, h]);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (last) zoomAt(last / d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        last = d;
      }
    });
    const end = (e) => { pts.delete(e.pointerId); last = null; if (!pts.size) svg.classList.remove("grabbing"); };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    const center = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    $("#zoom-in").onclick = () => zoomAt(1 / 1.5, ...center());
    $("#zoom-out").onclick = () => zoomAt(1.5, ...center());
    $("#zoom-fit").onclick = fitScope;
  }

  function paintMap(newCode) {
    const found = foundSet();
    const gave = new Set(inf.state.gaveUp);
    for (const [code, node] of inf.nodes) {
      const c = comByCode.get(code);
      node.classList.toggle("found", found.has(code));
      node.classList.toggle("missed", !found.has(code) && gave.has(c.r));
      node.classList.toggle("dim", !inScope(c));
      node.classList.toggle("new", code === newCode);
    }
    if (newCode) setTimeout(() => inf.nodes.get(newCode)?.classList.remove("new"), 1600);
  }

  function renderInfStats() {
    const found = foundSet();
    const list = scopeList();
    const n = list.filter((c) => found.has(c.c)).length;
    $("#inf-count").textContent = n;
    $("#inf-total").textContent = list.length;
    $("#inf-bar").style.width = `${(100 * n) / list.length}%`;
    $("#inf-regions").replaceChildren(...REG.map((r) => {
      const tot = COM.filter((c) => c.r === r.c);
      const f = tot.filter((c) => found.has(c.c)).length;
      return el("li", { class: f === tot.length ? "done" : "", onclick: () => setScope(r.c) },
        el("span", {}, r.short), el("span", {}, `${f}/${tot.length}`),
        el("span", { class: "bar" }, el("i", { style: `width:${(100 * f) / tot.length}%` })));
    }));
    $("#inf-recent").replaceChildren(...inf.state.found.slice(-12).reverse().map((code) => {
      const c = comByCode.get(code);
      return el("li", {}, c.n, " ", el("small", {}, regByCode.get(c.r).short));
    }));
  }

  function elapsed() { return inf.state.elapsed + (inf.started ? Date.now() - inf.started : 0); }
  function tick() {
    const s = Math.floor(elapsed() / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    $("#inf-timer").textContent = `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  function pauseTimer() {
    if (inf.started) { inf.state.elapsed = elapsed(); inf.started = null; saveInf(); }
  }
  function startTimer() {
    if (!inf.started && inf.state.found.length < COM.length) inf.started = Date.now();
  }

  function msg(text, cls) {
    const m = $("#inf-msg");
    m.textContent = text;
    m.className = `inf-msg ${cls || ""}`;
  }

  function accept(c) {
    startTimer();
    inf.state.found.push(c.c);
    saveInf();
    paintMap(c.c);
    renderInfStats();
    $("#inf-input").value = "";
    const list = scopeList();
    const found = foundSet();
    const left = list.filter((x) => !found.has(x.c)).length;
    if (!left) {
      pauseTimer();
      msg(`🎉 ¡Completaste ${inf.scope ? `la región de ${regByCode.get(inf.scope).short}` : "las 346 comunas de Chile"}! Tiempo: ${$("#inf-timer").textContent}`, "ok");
      toast("¡Completado! 🇨🇱");
    } else {
      msg(`✓ ${c.n} (${regByCode.get(c.r).short})`, "ok");
    }
  }

  function onInfInput(e) {
    const input = $("#inf-input");
    const q = norm(input.value);
    if (!q) return;
    const c = lookup.get(q);
    const found = foundSet();
    const enter = e.type === "keydown";
    if (c && !found.has(c.c) && inScope(c)) {
      // Espera Enter si el texto aún puede convertirse en otra comuna pendiente (p. ej. "San Pedro" → "San Pedro de la Paz").
      const longer = scopeList().some((x) => x.c !== c.c && !found.has(x.c) && keysOf.get(x.c).some((k) => k !== q && k.startsWith(q)));
      if (!longer || enter) accept(c);
      return;
    }
    if (!enter) return;
    if (c && found.has(c.c)) msg(`Ya tienes ${c.n}`, "err");
    else if (c) msg(`${c.n} es de ${regByCode.get(c.r).short}`, "err");
    else msg(`"${input.value.trim()}" no es una comuna`, "err");
    input.select();
  }

  function setScope(code) {
    inf.scope = code;
    $("#inf-region").value = String(code);
    paintMap();
    renderInfStats();
    fitScope();
    msg("");
    $("#inf-input").focus();
  }

  function giveUp() {
    const label = inf.scope ? `la región de ${regByCode.get(inf.scope).short}` : "todo Chile";
    if (!confirm(`¿Rendirse y mostrar las comunas faltantes de ${label}?`)) return;
    const regs = inf.scope ? [inf.scope] : REG.map((r) => r.c);
    inf.state.gaveUp = [...new Set([...inf.state.gaveUp, ...regs])];
    pauseTimer();
    saveInf();
    paintMap();
    const found = foundSet();
    const missing = scopeList().filter((c) => !found.has(c.c));
    msg(`Faltaron ${missing.length}. Pasa el cursor por las comunas rojas para ver sus nombres.`, "err");
  }

  function resetInf() {
    if (!confirm("¿Borrar todo el progreso del modo infinito?")) return;
    inf.state = { found: [], elapsed: 0, gaveUp: [] };
    inf.started = null;
    saveInf();
    paintMap();
    renderInfStats();
    tick();
    msg("");
  }

  let infReady = false;
  function initInfinite() {
    if (infReady) return;
    infReady = true;
    const sel = $("#inf-region");
    sel.append(el("option", { value: "0" }, "Todo Chile (346)"));
    for (const r of REG) sel.append(el("option", { value: String(r.c) }, `${r.rom} · ${r.short}`));
    sel.addEventListener("change", () => setScope(+sel.value));
    const input = $("#inf-input");
    input.addEventListener("input", onInfInput);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onInfInput(e); } });
    $("#inf-giveup").onclick = giveUp;
    $("#inf-reset").onclick = resetInf;
    buildMap();
    paintMap();
    renderInfStats();
    tick();
    setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => { if (document.hidden) pauseTimer(); });
    window.addEventListener("resize", () => { if (activeTab === "infinito") fitScope(); });
  }

  function openInfinite(regionCode) {
    selectTab("infinito");
    setScope(regionCode || 0);
  }

  // ---------- Pestañas ----------
  let activeTab = "region";
  function selectTab(name) {
    if (activeTab === "infinito" && name !== "infinito") pauseTimer();
    activeTab = name;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
    if (name === "infinito") {
      initInfinite();
      if (!inf.vb) fitScope();
      $("#inf-input").focus();
    }
    history.replaceState(null, "", `#${name}`);
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));

  $("#btn-help").onclick = () => $("#dlg-help").showModal();
  $("#btn-stats").onclick = showStats;

  startRegion(false);
  startComuna(false);
  startOrdenar(false);
  const initial = location.hash.slice(1);
  if (["region", "comuna", "ordenar", "infinito"].includes(initial)) selectTab(initial);
  if (!store.get("chiledle:visto", false)) { store.set("chiledle:visto", true); $("#dlg-help").showModal(); }
})();
