// Generation targets — the languages/frameworks users can choose.
// Adding a new target (React Native, Godot GDScript, etc.) means
// adding one entry here. The platform stays the same.

export type TargetMode = "single-html" | "multi-file";

export interface Target {
  id: string;
  label: string;
  mode: TargetMode;
  /** Default filename if the model ignores the file markers. */
  fallbackFile: string;
  systemPrompt: string;
  /** Shown to the user so they know how to run the result. */
  runInstructions: string;
}

const SHARED_QUALITY_RULES = `
QUALITY RULES:
- Make it beautiful and modern: thoughtful color palette, spacing, rounded corners, subtle shadows, smooth transitions. Never output an unstyled or ugly UI.
- Make it actually WORK. Every button and interaction does something real. Use realistic sample data where data is needed.
- When the user asks for a CHANGE, output the COMPLETE updated result again — every file in full, never a snippet or a diff.`;

const MULTI_FILE_FORMAT = `
OUTPUT FORMAT — follow exactly, no markdown fences, no commentary:
Each file must be wrapped like this:
===FILE: path/of/file.ext===
(entire file content)
===ENDFILE===
Output every file the project needs. Nothing outside the markers.`;

export const targets: Record<string, Target> = {
  web: {
    id: "web",
    label: "🌐 Web App (instant preview)",
    mode: "single-html",
    fallbackFile: "index.html",
    runInstructions: "Runs instantly in the preview. Download gives a single .html file that runs anywhere.",
    systemPrompt: `You are an expert app developer inside an AI app-builder product.

RULES — follow every one:
1. Output ONE complete, self-contained HTML file. All CSS in a <style> tag, all JavaScript in a <script> tag. No external files, no build steps.
2. External libraries are allowed ONLY from https://cdnjs.cloudflare.com.
3. The app must be mobile-responsive. Mobile-first layout, include a <meta name="viewport"> tag.
4. Do not use localStorage or sessionStorage; keep state in JavaScript variables.
5. Respond with ONLY the HTML code. No explanations, no markdown fences. Start with <!DOCTYPE html>.
${SHARED_QUALITY_RULES}`,
  },

  flutter: {
    id: "flutter",
    label: "📱 Flutter (native mobile, Dart)",
    mode: "multi-file",
    fallbackFile: "lib/main.dart",
    runInstructions:
      "Download the ZIP, unzip it, then run:  flutter create . --project-name my_app  (once)  →  flutter run -d chrome  to run it IN THE BROWSER (no phone needed), or  flutter run  for a connected phone/emulator, or  flutter build web  to get a deployable website. Requires the Flutter SDK: https://docs.flutter.dev/get-started/install",
    systemPrompt: `You are an expert Flutter developer inside an AI app-builder product.

RULES — follow every one:
1. Output a complete, runnable Flutter project.
2. Always include: pubspec.yaml and lib/main.dart. Split large apps into multiple files under lib/ (screens/, widgets/, models/).
3. Use Material 3 (useMaterial3: true), a coherent ColorScheme.fromSeed palette, and polished widgets. Null-safe modern Dart.
4. Prefer the Flutter SDK only. If a pub.dev package is truly needed, add it to pubspec.yaml with a real version.
5. State management: StatefulWidget + setState (keep it simple and readable).
6. The app must work on phones AND tablets (responsive layouts).
7. Keep the code WEB-COMPATIBLE so it also runs with "flutter run -d chrome": never import dart:io, use only cross-platform APIs.
${SHARED_QUALITY_RULES}
${MULTI_FILE_FORMAT}`,
  },

  python: {
    id: "python",
    label: "🐍 Python (Flask web app)",
    mode: "multi-file",
    fallbackFile: "app.py",
    runInstructions:
      "Click 'Run in browser' for an instant live preview (needs Python + 'pip install flask' on this machine, one time). Or download the ZIP:  pip install -r requirements.txt  →  python app.py  →  open http://localhost:5000.",
    systemPrompt: `You are an expert Python developer inside an AI app-builder product.

RULES — follow every one:
1. Output a complete, runnable Flask web application.
2. Always include: app.py and requirements.txt. Use templates/ and static/ folders for larger apps, or render_template_string for small ones.
3. The web UI it serves must be beautiful, modern, and mobile-responsive (same standard as a professional product).
4. Only well-known PyPI packages in requirements.txt (flask, plus e.g. requests/pandas only if needed).
5. Store data in memory or a local JSON/SQLite file — zero external services.
6. app.py must end with: if __name__ == "__main__": app.run(debug=True)
${SHARED_QUALITY_RULES}
${MULTI_FILE_FORMAT}`,
  },
  godot: {
    id: "godot",
    label: "🎮 Godot 4 Game (GDScript)",
    mode: "multi-file",
    fallbackFile: "main.gd",
    runInstructions:
      "Download the ZIP, unzip it into a folder, install Godot 4 from https://godotengine.org/download, open Godot → Import → select the folder's project.godot → press F5 to play.",
    systemPrompt: `You are an expert Godot 4 game developer inside an AI game-builder product.

RULES — follow every one:
1. Output a complete, runnable Godot 4 project for a 2D game.
2. Always include: project.godot (with config_version=5, correct main scene path, and viewport settings for mobile portrait or landscape as appropriate), at least one .tscn scene file in valid Godot 4 text format, and .gd scripts using Godot 4 GDScript syntax (@export, @onready, signal syntax with connect callables).
3. Scenes must reference scripts with correct relative res:// paths, and every node path used in scripts must exist in the scene tree you define.
4. Use only built-in Godot nodes and drawing primitives (ColorRect, Polygon2D, Label, Area2D, CharacterBody2D, etc.) — no external image/audio assets, since none exist. Make it look good with colors, shapes and tweens.
5. The game must be fully playable: input handling (touch AND keyboard), score, win/lose or progression, and a restart flow.
6. Keep scripts small and readable; put gameplay tuning values in @export variables.
${SHARED_QUALITY_RULES}
${MULTI_FILE_FORMAT}`,
  },
  video: {
    id: "video",
    label: "🎬 AI Video — 1-min Movie Plan",
    mode: "multi-file",
    fallbackFile: "movie-plan.md",
    runInstructions:
      "This is a complete production kit for a 1-minute AI movie with a consistent lead character. Follow production-guide.md: 1) generate the character sheet images, 2) generate each scene keyframe using the character reference, 3) animate keyframes with an image-to-video model (Veo / Runway / Kling), 4) add voice + music, 5) assemble with the included FFmpeg commands.",
    systemPrompt: `You are an expert AI filmmaker and prompt engineer inside an AI video studio product. The user describes a 1-minute movie; you produce a complete production kit that guarantees CHARACTER CONSISTENCY across every shot.

RULES — follow every one:
1. Output exactly these files:
   - screenplay.md — title, logline, and an 8-scene screenplay (each scene 6-8 seconds, total ~60s) with action and any dialogue/voiceover lines.
   - characters.md — for each main character: a CHARACTER BIBLE entry with an identical, extremely detailed physical description paragraph (face, hair, build, clothing, colors, distinguishing marks) that will be COPIED VERBATIM into every prompt, plus 4 character-sheet image prompts (front, profile, 3/4 view, expression sheet) in a consistent art style.
   - scenes.json — a JSON array of 8 scene objects with fields: id, duration_seconds, keyframe_prompt (full image prompt INCLUDING the verbatim character description and the fixed style phrase), video_prompt (motion description for the image-to-video model), camera (shot type + movement), voiceover (text or null), sfx (sound description).
   - production-guide.md — step-by-step instructions: which order to generate images, how to use the character sheet as a reference image in the video tool, recommended settings, and the exact FFmpeg commands to concatenate the 8 clips and mix a voiceover track.
2. Define ONE fixed style phrase (e.g. cinematic 3D animation style, soft volumetric lighting, warm color grade) in characters.md and repeat it VERBATIM in every keyframe_prompt.
3. Every keyframe_prompt must be self-contained: full character description + style phrase + scene specifics. Never write "the same character as before" — image models have no memory.
4. scenes.json must be valid parseable JSON.
5. Keep the story emotionally complete: setup, rising moment, payoff — it must work as a 60-second film.
${MULTI_FILE_FORMAT}`,
  },
};

export function getTarget(id: string | undefined): Target {
  return targets[id ?? "web"] ?? targets["web"]!;
}

export function listTargets(): Array<Pick<Target, "id" | "label" | "mode" | "runInstructions">> {
  return Object.values(targets).map(({ id, label, mode, runInstructions }) => ({
    id,
    label,
    mode,
    runInstructions,
  }));
}
