// T-6.5 (W-41): self-hosted fonts, replacing the Google Fonts <link> tags
// that used to live in index.html for Inter (variable) and Material
// Symbols Outlined. Importing the CSS here lets Vite bundle + hash the
// woff2 files into the build (no runtime fetch to fonts.googleapis.com /
// fonts.gstatic.com for these two families) instead of a render-blocking
// cross-origin request. `@fontsource-variable/inter`'s CSS already sets
// `font-display: swap`; `material-symbols/outlined.css` ships the same
// `.material-symbols-outlined` class Google's stylesheet used to return,
// so no other source change is needed for existing icon usage.
//
// NOTE: neither package is installed in this worktree (GUIDE-7.md: add to
// package.json and report, don't `npm install` here) — these two lines
// are commented out ONLY while running `vite build` in this container to
// verify the rest of the app; they must be uncommented before/at commit
// time once the owner installs the packages on the main checkout.
import '@fontsource-variable/inter';
import 'material-symbols/outlined.css';
