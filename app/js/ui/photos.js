// Photos tab: create collections from picked files, choose which one is shown, browse its photos.
// Talks to wallpapers/library.js (storage), wallpapers/importer.js (processing) and the engine (display).
import { listCollections, createCollection, deleteCollection, getImage, images, usage } from "../wallpapers/library.js";
import { importFiles } from "../wallpapers/importer.js";

const $ = id => document.getElementById(id);

export function createPhotos({ settings, save, engine, toast, onCollectionChange }) {
  let urls = [];          // object URLs for thumbnails currently on screen (revoked on re-render to free memory)
  let busy = false;

  const track = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const releaseAll = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };

  async function render() {
    releaseAll();
    const cols = await listCollections();
    const list = $("collectionList");
    list.textContent = "";
    if (!cols.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "No collections yet. Type a name below and choose photos.";
      list.append(p);
    }
    for (const c of cols) {
      const row = document.createElement("div");
      row.className = "collection" + (c.id === settings.wallCollection ? " active" : "");
      const cover = document.createElement("img");
      cover.className = "cover"; cover.alt = "";
      const first = c.covers && c.covers[0];
      if (first) getImage(first).then(r => { if (r) cover.src = track(r.thumb); });
      const name = document.createElement("div");
      name.className = "cname";
      const b = document.createElement("b"); b.textContent = c.name;
      const s = document.createElement("span"); s.textContent = `${c.count} photo${c.count === 1 ? "" : "s"}`;
      name.append(b, s);
      row.append(cover, name);
      if (c.id !== settings.wallCollection) row.append(button("Show", "btn ghost tiny", () => activate(c.id)));
      row.append(button("Delete", "btn danger tiny", ev => confirmDelete(ev.currentTarget, c)));
      list.append(row);
    }

    const active = cols.find(c => c.id === settings.wallCollection);
    $("activeGroup").hidden = !active;
    if (active) {
      $("activeTitle").textContent = `Showing: ${active.name}`;
      const grid = $("thumbs");
      grid.textContent = "";
      for (const rec of await images(active.id)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.key = rec.key;
        btn.setAttribute("aria-label", "Show this photo now");
        btn.className = rec.key === engine.current ? "current" : "";
        const img = document.createElement("img");
        img.alt = ""; img.loading = "lazy"; img.src = track(rec.thumb);
        btn.append(img);
        btn.addEventListener("click", () => engine.showKey(rec.key));
        grid.append(btn);
      }
    }

    const u = await usage();
    $("storageNote").textContent = u && u.usage != null
      ? `Photos are stored only on this device (${(u.usage / 1048576).toFixed(0)} MB used). They are never uploaded.`
      : "Photos are stored only on this device. They are never uploaded.";
  }

  function button(text, cls, onClick) {
    const b = document.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  async function activate(id) {
    settings.wallCollection = id;
    save();
    await engine.setCollection(id);
    onCollectionChange && onCollectionChange();
    render();
  }

  function confirmDelete(btn, c) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again";
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = "Delete"; } }, 4000);
      return;
    }
    (async () => {
      await deleteCollection(c.id);
      if (settings.wallCollection === c.id) {
        const rest = await listCollections();
        await activate(rest[0] ? rest[0].id : null);
      } else render();
      toast(`Deleted "${c.name}" from this device`);
    })();
  }

  function setBusy(v, text) {
    busy = v;
    $("newCollectionBtn").classList.toggle("disabled", v);
    $("newCollectionFiles").disabled = v;
    $("addFiles").disabled = v;
    if (text !== undefined) $("importStatus").textContent = text;
  }

  async function runImport(collectionId, files) {
    setBusy(true, `Importing 0 of ${files.length}…`);
    const r = await importFiles(collectionId, files, p => {
      $("importStatus").textContent = `Importing ${p.done} of ${p.total}…`;
    });
    const parts = [`Added ${r.added}`];
    if (r.duplicates) parts.push(`${r.duplicates} already in this collection`);
    if (r.failed) parts.push(`${r.failed} couldn't be read`);
    setBusy(false, parts.join(" · "));
    return r;
  }

  $("newCollectionFiles").addEventListener("change", async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length || busy) return;
    const name = $("newCollectionName").value.trim().slice(0, 60) || "Cosmos collection";
    const c = await createCollection(name);
    $("newCollectionName").value = "";
    await runImport(c.id, files);
    await activate(c.id);
  });

  $("addFiles").addEventListener("change", async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length || busy || !settings.wallCollection) return;
    await runImport(settings.wallCollection, files);
    await engine.refresh();
    onCollectionChange && onCollectionChange();
    render();
  });

  // Labels act as buttons for the hidden file inputs; make them work with the keyboard too.
  document.querySelectorAll('label[for="newCollectionFiles"], label[for="addFiles"]').forEach(l =>
    l.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $(l.htmlFor).click(); } }));

  $("wpPrevBtn").addEventListener("click", () => engine.prev());
  $("wpNextBtn").addEventListener("click", () => engine.next());

  return {
    render,
    release: releaseAll,
    markCurrent(key) {
      document.querySelectorAll("#thumbs button").forEach(b => b.classList.toggle("current", b.dataset.key === key));
    },
  };
}
