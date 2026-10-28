/* Harness de test : jsdom + machine à états déterministe + chargeur de modules. */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function createHarness() {
  const { window } = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    url: "https://extension.local/",
    runScripts: "outside-only",
  });
  const document = window.document;

  /* Horloge déterministe + rAF -> file */
  let clock = 0;
  let rafQueue = [];
  window.performance.now = () => clock;
  window.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = () => {
    rafQueue = [];
  };

  /* Timers déterministes : rien ne tourne en réel, on flush à la demande. */
  let timerSeq = 0;
  const pendingTimers = new Map();
  window.setTimeout = (cb) => {
    const id = ++timerSeq;
    pendingTimers.set(id, cb);
    return id;
  };
  window.clearTimeout = (id) => {
    pendingTimers.delete(id);
  };

  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));

  const registry = new Map();

  function makeContext() {
    return vm.createContext({
      window,
      document,
      console,
      localStorage: window.localStorage,
      performance: window.performance,
      requestAnimationFrame: window.requestAnimationFrame,
      cancelAnimationFrame: window.cancelAnimationFrame,
      setTimeout: window.setTimeout,
      clearTimeout: window.clearTimeout,
      CustomEvent: window.CustomEvent,
      Event: window.Event,
      HTMLElement: window.HTMLElement,
      MouseEvent: window.MouseEvent,
      PointerEvent: window.PointerEvent,
      Math,
      Date,
      JSON,
      parseFloat,
      parseInt,
      String,
      Number,
      Object,
      Array,
      Map,
      Set,
      RegExp,
      Error,
      TypeError,
      Promise,
      globalThis,
      isFinite,
      isNaN,
      Infinity,
    });
  }

  /** Remplit `ns` avec les exports de `abs` (en chargeant ses deps d'abord). */
  async function execInto(ns, abs) {
    const src = readFileSync(abs, "utf8");

    const re = /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
    const deps = {};
    let m;
    while ((m = re.exec(src))) {
      const depFull = resolve(abs, "..", m[2]);
      let depNs = registry.get(depFull);
      if (!depNs) {
        depNs = {};
        registry.set(depFull, depNs);
        await execInto(depNs, depFull);
      }
      for (const nm of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        const parts = nm.split(/\s+/);
        const sourceName = parts[0];
        const localName = parts.includes("as") ? parts[parts.length - 1] : sourceName;
        deps[localName] = depNs[sourceName];
      }
    }

    const ctx = makeContext();
    Object.assign(ctx, deps);

    let body = src
      .replace(re, "")
      .replace(/export\s+function\s+/g, "function ")
      .replace(/export\s+const\s+/g, "const ");
    /* `export { a, b };` (ligne seule, ex. ré-exports depuis balance.js) :
       la syntaxe est retirée du corps ; les noms sont déjà déclarés par le
       `export const` transformé ci-dessus et collectés dans `exported`. */
    body = body.replace(/export\s*\{[^}]*\};?/g, "");
    const exported = [
      ...[...src.matchAll(/export\s+function\s+(\w+)/g)].map((x) => x[1]),
      ...[...src.matchAll(/export\s+const\s+(\w+)/g)].map((x) => x[1]),
    ];
    const result = vm.runInContext(
      `(function(){ ${body}\n; return { ${exported.map((n) => `${n}: ${n}`).join(", ")} }; })()`,
      ctx
    );
    Object.assign(ns, result);
  }

  /** Charge un module (chemin relatif à la racine du repo), mémoïsé. */
  async function loadModule(repoRel) {
    const full = resolve(ROOT, repoRel);
    if (registry.has(full)) return registry.get(full);
    const ns = {};
    registry.set(full, ns);
    await execInto(ns, full);
    return ns;
  }

  /** Recharge un module "comme si on fermait/réouvrait" (persistance). */
  async function reloadFresh(repoRel) {
    const full = resolve(ROOT, repoRel);
    registry.delete(full);
    return loadModule(repoRel);
  }

  return {
    window,
    document,
    app: document.querySelector("#app"),
    clock: () => clock,
    setClock: (v) => {
      clock = v;
    },
    advance: (ms) => {
      clock += ms;
    },
    flushFrames: () => {
      const s = rafQueue.slice();
      rafQueue = [];
      s.forEach((cb) => cb());
    },
    flushTimers: () => {
      const now = [...pendingTimers.values()];
      pendingTimers.clear();
      now.forEach((cb) => cb());
    },
    errors,
    loadModule,
    reloadFresh,
    ROOT,
  };
}