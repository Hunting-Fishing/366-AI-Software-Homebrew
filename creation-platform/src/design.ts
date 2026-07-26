// The design system generated apps are built against.
//
// WHY THIS EXISTS
// Output looked like 1998 because the prompt said "no Tailwind, no extra
// packages", which left the model hand-writing CSS from first principles
// on every single generation. It got spacing, contrast and hierarchy
// slightly wrong every time, in a different way every time.
//
// Lovable's output looks good for an unglamorous reason: it generates
// against a design system rather than a blank stylesheet. So do we now.
//
// Two halves:
//   TAILWIND_CDN   injected into every preview, so utilities just work
//   DESIGN_RULES   appended to the prompt, so the model knows the
//                  vocabulary and — more importantly — the taste
//
// The rules are deliberately opinionated. "Make it look nice" produces
// grey boxes; "18-24px card padding, one accent colour, 1.5 line height
// on body text" produces something that looks designed.

import { catalogueRules } from "./packages.js";
import { SIZE_RULES } from "./codeHealth.js";

/** Tailwind Play CDN — no build step, resolved by the browser. */
export const TAILWIND_CDN =
  '<script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>';

/**
 * Base layer injected before the app's own styles. Sets the typography
 * and colour foundation so even a plain <div> starts from something
 * considered rather than from Times New Roman on white.
 */
export const BASE_CSS = `
:root{
  --bg:#0b0c10; --surface:#14161d; --surface-2:#1b1e27; --border:#272b36;
  --text:#e9ecf3; --muted:#9aa3b8;
  --accent:#6366f1; --accent-hover:#4f46e5;
  --radius:12px;
  --shadow:0 1px 2px rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.28);
}
@media (prefers-color-scheme: light){
  :root{
    --bg:#f7f8fa; --surface:#ffffff; --surface-2:#f2f4f8; --border:#e4e7ee;
    --text:#12141a; --muted:#5c6478;
    --shadow:0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.08);
  }
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:16px; line-height:1.6;
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3,h4{line-height:1.25; letter-spacing:-.02em; margin:0 0 .5em; font-weight:600}
h1{font-size:clamp(1.75rem,1.3rem + 2vw,2.5rem)}
h2{font-size:clamp(1.35rem,1.1rem + 1vw,1.75rem)}
h3{font-size:1.15rem}
p{margin:0 0 1em}
a{color:var(--accent)}
img{max-width:100%;height:auto;display:block}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
::selection{background:var(--accent);color:#fff}
`.trim();

/**
 * Appended to every UI-generating target's system prompt.
 *
 * Written as concrete numbers rather than adjectives. "Modern and
 * clean" means nothing to a model; "20px card padding, 8px gaps,
 * one accent colour" produces a consistent result.
 */
export const DESIGN_RULES = `
${catalogueRules()}

${SIZE_RULES}

DESIGN SYSTEM — follow this, it is what separates a real product from a school project:

STYLING METHOD
- Tailwind CSS is available and already loaded. Use Tailwind utility classes for everything. Do NOT write a custom stylesheet unless asked; do not use inline style= attributes.
- A base layer already sets typography, colours and a dark/light palette. Build on it, do not fight it.

LAYOUT
- Give content a max width (max-w-5xl / max-w-6xl) and centre it (mx-auto). Never let text run the full width of a wide screen.
- Generous breathing room: p-6 or p-8 inside cards, gap-4 to gap-6 between items, py-10 or more between page sections.
- One clear column on mobile, grid on wider screens (grid md:grid-cols-2 lg:grid-cols-3).

COLOUR
- Pick ONE accent colour and use it only for the primary action and active state. Everything else is neutral (slate/zinc/gray).
- Never more than one accent. Rainbow UIs read as amateur.
- Body text at high contrast, secondary text one step down (text-slate-400 on dark, text-slate-600 on light). Never grey-on-grey.

ICONS — use lucide-react, never emoji
- import { Truck, Receipt, Users } from 'lucide-react' then <Truck className="w-5 h-5" aria-hidden="true" />. About 1500 icons, all one consistent stroked set, all inheriting the current text colour.
- Never emoji (📊 📦 ⚖️ 🚀) as an icon. They are drawn by the operating system's own bitmap font: they cannot take your colour, cannot match your type size, and look completely different on Windows, macOS, Android and iOS. A UI iconed with emoji reads as unfinished no matter how good the rest is.
- Do not hand-write SVG paths when an icon exists for it. Hand-drawn SVG is only for something genuinely bespoke, like a logo.
- Icons beside a label are decorative, so add aria-hidden="true". An icon-only button needs aria-label.
- Emoji are fine inside sample content a person would actually type (a note, a message). They are not fine as interface furniture.

DEPTH AND SHAPE
- Cards: rounded-xl, a subtle border (border border-slate-800 / border-slate-200), and either a soft shadow OR a border — not both heavily.
- Buttons: rounded-lg, px-4 py-2, a clear hover state, and a visible focus ring. Primary is filled with the accent; secondary is bordered and transparent.
- Avoid heavy drop shadows, gradients on everything, and glow effects.

TYPOGRAPHY
- One font family. Sizes from a scale: text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl. Do not invent in-between sizes.
- Headings are semibold, not black. Long text gets max-w-prose.

STATE — this is what most generated apps forget
- Empty state: when a list has no items, show a short line of copy and the action that fills it. Never a blank rectangle.
- Loading: a skeleton or a spinner, never a frozen screen.
- Interactive elements need hover AND focus states.
- Destructive actions ask for confirmation.

CONTENT
- Realistic sample data, seeded so the UI looks alive on first load. Never "Lorem ipsum", never "Item 1 / Item 2 / Item 3".
- Real labels: "Add expense", not "Submit".

SAVING DATA — use the built-in database, not localStorage
- Every app gets real server-side storage, already wired up. Nothing to configure, no keys, no imports to install.
- The API is on window.db and has four methods, all returning promises:
    await db.list('employees')                  // -> array of records
    await db.save('employees', record)          // one record, or an array of them
    await db.remove('employees', id)            // one id, or an array of ids
    db.ready                                    // false when storage is unavailable
- Every record MUST have a unique \`id\` string. Use crypto.randomUUID().
- A collection name is a plain lowercase word: 'employees', 'deliveries', 'receipts'. One collection per kind of thing, exactly as you would name a table.
- Load on mount and write on change:
    useEffect(() => { db.list('employees').then(setEmployees); }, []);
    async function addEmployee(e) { await db.save('employees', e); setEmployees(await db.list('employees')); }
- Handle the failure honestly: if db.ready is false, or a call rejects, show a short banner saying changes are not being saved. Never swallow the error, and never silently lose what the user typed.
- Do NOT use localStorage for real records. It is per-browser, so the data cannot be reached from a phone or shared with staff, which defeats the point. localStorage is only for interface preferences — the last selected tab, a collapsed sidebar.
- Do NOT write a fetch to any other backend. There is no other backend.

DEMO DATA — put it behind one switch
- Sample data makes a new app look alive, and makes it useless the moment someone wants to use it for real. Do not force a choice between the two. Ship both, behind a single flag.
- Create src/demoData.js with EXACTLY this first line, on its own line, nothing before it:
  export const USE_DEMO_DATA = true;
  The platform rewrites that one line when the user flips the Demo data switch, so the text must match precisely — same name, same spacing, no type annotation, no wrapping in an object.
- Export the seed records from that same file, e.g. export const DEMO_EMPLOYEES = [...]. Keep every hardcoded sample record in this one file; nothing sample-shaped anywhere else.
- Wherever state is initialised, read the flag: const [rows, setRows] = useState(USE_DEMO_DATA ? DEMO_ORDERS : []);
- With the flag off the app must be genuinely usable, not broken: empty states with real copy, working "Add" forms, totals that read 0 rather than NaN or undefined. Test that path in your head before finishing — an app that only works with fake data in it is not finished.
- If the app persists to localStorage, saved real data always wins over demo data; the flag only decides what is there on a first run.

ACCESSIBILITY
- Semantic elements: button for actions, a for navigation, label tied to every input.
- Touch targets at least 44px tall.
- Text contrast at least 4.5:1 against its background.
`.trim();


/**
 * The taste half of the design system, without the web-specific
 * mechanics. For targets that render through their own toolkit —
 * Flutter's Material 3, for instance — where Tailwind advice would
 * mislead but the principles still hold.
 */
export const DESIGN_TASTE = `
DESIGN PRINCIPLES — this is what separates a real product from a school project:
- Generous spacing. Cramped layouts read as unfinished.
- ONE accent colour, used only for the primary action. Everything else neutral.
- High contrast body text; secondary text exactly one step down, never grey-on-grey.
- A type scale, not arbitrary sizes. Headings semibold, not black.
- Empty states get a line of copy and the action that fills them — never a blank rectangle.
- Loading states are visible. Interactive elements have pressed and focus states.
- Never emoji as icons. Use the toolkit's own icon set, drawn in the current text colour so it matches what sits beside it. Emoji are OS bitmaps: wrong colour, wrong size, different on every device.
- Realistic seeded sample data so the UI looks alive on first run. Never "Item 1 / Item 2".
- Real labels: "Add expense", not "Submit".
- Touch targets at least 44px. Text contrast at least 4.5:1.
`.trim();
