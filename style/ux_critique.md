## UX/UI Critique Review - "The Angry Designer"

**Objective:** Detailed critical review of `ChatInterface.tsx` and recent styling changes. Focus on usability, eye comfort (long-term use), and clarity.

### 🟥 Critical Issues (Must Fix)

1.  **Header Styling is Aggressive:**
    - **Current:** `h1`, `h2`, `h3` are all `text-rose-600`.
    - **Critique:** Headers are structural content, not alerts. Making them all Red (even Soft Red) creates constant cognitive urgency (Danger/Stop signals). It makes the document look like a giant error log.
    - **Fix:** Revert headers to `text-gray-900 dark:text-gray-100` (Neutral). Use the Rose color efficiently ONLY for accents (like the little indicator bar next to H2) or links.

2.  **Layout Width Fatigue:**
    - **Current:** `max-w-none` on prose.
    - **Critique:** On wide screens (1920px+), lines of text will stretch across the whole container if the "Visuals" panel isn't there. Reading >100 characters per line causes eye strain (tracking difficulty).
    - **Fix:** Constrain `prose` to `max-w-3xl` or `max-w-4xl` even if container is wider.

3.  **Visual Noise in "Badges":**
    - **Current:** Code language badges (`uppercase tracking-widest`) are visually heavy.
    - **Critique:** They compete with the content.
    - **Fix:** Tone down the badges. Make them subtle text, remove heavy borders.

4.  **Dark Mode Contrast:**
    - **Current:** `bg-zinc-900` blocks on `bg-[#0a0a0a]` body.
    - **Critique:** It's okay, but the "Soft Red" text (`text-rose-400`) on dark background might vibrate if not calibrated.

### 🟧 Interaction Nitpicks

1.  **Backdrop Input Hack:**
    - **Critique:** Using a duplicate `div` backdrop for syntax highlighting is fragile. If `line-height` or fonts drift by 1px, the caret will be misaligned with the text, driving users insane.
    - **Check:** Verify `font-family: inherit` and `line-height: relaxed` are identical on both layers.

2.  **Citations:**
    - **Current:** Citations are below the text.
    - **Critique:** Good placement, but are they interactable? Do they link to anything?

### 🟩 Proposed "Premium & Comfortable" Design

**Theme:** "Clean Slate with Rose Accents" (Not "Red Everything")

1.  **Typography:**
    - Headers: Dark Grey / White (Structure)
    - Links: Rose (Action)
    - Bullets: Rose (Guide)
    - Body: Zinc-600 / Zinc-300 (Readability)

2.  **Chat Interface:**
    - Input: Clean, no focus ring (Fixed).
    - Buปิดไว้นะจ๊ะes: Give user buปิดไว้นะจ๊ะes a subtle background (Gray-50) instead of White to distinguish from "Paper" feel.

---

**Approval to Proceed with:**

1.  **Neutralizing Headers:** Change H1-H6 to Neutral colors. Keep the decorative left-border.
2.  **Input Stability:** Double check styling sync between backdrop and textarea.
3.  **Prose Constaint:** Add `max-w-4xl` to readable content.
