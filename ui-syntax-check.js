// Syntax check for the v1.8 book-pipeline UI additions.
/* eslint-disable */
let project = { files: [], binaries: [], target: "book" };
let imageProviders = [];
let healthInfo = {};
const $ = () => ({ appendChild(){}, style:{}, setAttribute(){}, removeAttribute(){}, innerHTML:"", textContent:"", srcdoc:"", value:"picture" });
const addMsg = () => ({ innerHTML: "", textContent: "", className: "", appendChild(){} });
const showTab = () => {};
const inhouseMovie = () => {};
const BOOK_TYPES = { picture: "x", coloring: "y", cyoa: "z", leveled: "w" };

function bookPages() {
  const pf = project.files.find(f => f.path === "pages.json");
  try { const p = JSON.parse(pf.content); return Array.isArray(p) ? p : null; } catch { return null; }
}

async function illustrateBook() {
  const pages = bookPages();
  if (!pages) { addMsg("err", "pages.json is missing or invalid — ask me to fix it."); return; }
  const imgProvider = imageProviders.find(p => p.configured);
  const note = addMsg("bot", "");
  project.binaries = (project.binaries || []).filter(b => !b.path.startsWith("pages/"));
  let ok = 0;
  for (let i = 0; i < pages.length; i++) {
    note.innerHTML = '<span class="spinner"></span>Illustrating page ' + (i + 1) + "/" + pages.length + "…";
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: imgProvider.id, prompt: pages[i].illustration_prompt || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "image failed");
      project.binaries.push({ path: "pages/page-" + (pages[i].page ?? i + 1) + ".png", b64: data.b64 });
      ok++;
    } catch (err) {
      addMsg("err", "⚠️ Page " + (pages[i].page ?? i + 1) + ": " + err.message);
    }
  }
  note.textContent = "🖼 Illustrated " + ok + "/" + pages.length + " pages. ";
  showBook();
}

function buildBookHtml() {
  const pages = bookPages() || [];
  const title = (project.files.find(f => f.path === "book.md") || { content: "My Book" }).content.split("\n")[0].replace(/^#+\s*/, "");
  const img = (n) => {
    const b = (project.binaries || []).find(x => x.path === "pages/page-" + n + ".png");
    return b ? '<img src="data:image/png;base64,' + b.b64 + '" alt="illustration">' : "";
  };
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = pages.map((p) => {
    const choices = (p.choices || []).map(c => '<a class="choice" href="#page-' + c.goto + '">' + esc(c.label) + ' →</a>').join("");
    return '<section class="page" id="page-' + p.page + '">' + img(p.page) +
      '<p class="text">' + esc(p.text) + "</p>" +
      (choices ? '<div class="choices">' + choices + "</div>" : "") +
      (p.ending ? '<p class="ending">— The End —</p>' : "") +
      '<p class="num">' + p.page + "</p></section>";
  }).join("");
  return "<!DOCTYPE html><html><head><title>" + esc(title) + "</title></head><body>" + body + "</body></html>";
}

function showBook() {
  const html = buildBookHtml();
  project.files = project.files.filter(f => f.path !== "book.html").concat([{ path: "book.html", content: html }]);
  showTab("preview");
}

function animateBook() {
  const pages = bookPages() || [];
  const frames = pages
    .map(p => ({ id: p.page, b64: ((project.binaries || []).find(x => x.path === "pages/page-" + p.page + ".png") || {}).b64 }))
    .filter(f => f.b64);
  if (frames.length === 0) { addMsg("err", "Illustrate the book first."); return; }
  inhouseMovie(frames);
}

// smoke-run the pure parts
project.files = [
  { path: "pages.json", content: JSON.stringify([{ page: 1, text: "Hi & <bye>", choices: [{ label: "Go", goto: 2 }] }, { page: 2, text: "End", ending: true }]) },
  { path: "book.md", content: "# The Brave Little Boat\nstory..." },
];
project.binaries = [{ path: "pages/page-1.png", b64: "AAAA" }];
const html = buildBookHtml();
if (!html.includes("The Brave Little Boat")) throw new Error("title missing");
if (!html.includes("#page-2")) throw new Error("choice link missing");
if (!html.includes("&lt;bye&gt;") && !html.includes("&lt;bye>")) throw new Error("escaping failed");
if (!html.includes("data:image/png;base64,AAAA")) throw new Error("image missing");
animateBook();
console.log("BOOK UI LOGIC OK");
