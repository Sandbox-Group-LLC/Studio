# The Score: deck-derived visual direction

## Reference and scope

Reference: [Internal | Robinhood HOOD Summit RFP 2027](https://docs.google.com/presentation/d/1MMmeX53GdAfASn-vFuaaA50pLUw7PMbVndD-_VnDMJk/edit), reviewed October 3, 2026. Scanned the slide structure and visually reviewed slides 14, 17–22, 36, 76, and 77. This is a working deck, not a claim of approved brand standards. Material after its “Graveyard” divider was not treated as current direction.

This change is presentation-only. Keep Newsreader, existing headline and interaction copy, per-preset identities, self-serve creation, the QR handoff, provider parameters, and retention behavior. Do not import internal notes, unapproved dates, logos, photography, or licensed typefaces into the attendee UI.

## Styling options

- **Sound rings / title sequence, selected:** Slide 17 pairs soft concentric forms with a widely spaced serif title. Translate this into a CSS sound field behind the kiosk headline, retaining the existing words. Slow, low-amplitude motion stops under reduced-motion preferences.
- **Architectural light:** Slide 18 suggests dark vertical planes and a light reveal. A good alternative for a portrait booth surround or a later attract-screen variant. Not mixed into this pass: combining both metaphors would dilute the opening screen.
- **Cymatic texture:** Slide 19 and the slide 21 collage suggest physical sound, particulate ripples, and sculptural waveforms. Better suited to a future art-directed video backdrop or cover-art treatment. Not copied as a slide screenshot and not tied to a GPU-heavy runtime.

The active moodboards on slides 20–22 also inform fine rules, restrained lime, tactile dark surfaces, and generous space. Newsreader remains the user's chosen locally served typeface; the deck does not authorize bundling proprietary fonts.

## Applied surfaces

- **Attract screen:** Existing headline becomes a cinematic typographic lockup, with “score.” dominant. A restrained studio eyebrow, lime divider, slow concentric rings, and framed header/footer replace the terminal-grid emphasis.
- **Choice flow:** Shared warm-black surfaces and fine rules; square-edged preset cards retain their original accent colors, selection cues, and waveforms.
- **Phone:** Quiet, static rings and a ruled header connect the souvenir to the kiosk without competing with lyrics, playback, or QR-related content.
- **Operations:** Only the shared palette changes. No atmospheric motion is added to the operator dashboard.

## QA inventory

Check before signoff:

- Desktop 1440×900, phone 375×812, portrait kiosk 1080×1920.
- Opening headline, CTA, footer, fonts, rings, and viewport fit.
- Begin, each preset, both tune selections, back, name/goal/detail input, submit, QR handoff, done, start-over.
- Phone ready, generating, failed, and missing-code states with isolated fixtures.
- Operations layout with an isolated fixture.
- Off-happy-path: submission rejection remains recoverable; long name/lyrics at phone width do not overflow.
- Reduced-motion sound field is static; keyboard focus remains visible.
- TypeScript and production build pass; confirm no server/shared-schema/provider edits.

Test data must be mocked locally. Do not spend provider credits or modify production rows for a styling change. A private visual preview is not a replacement for the Coolify production deployment.

## Verification results

- TypeScript, production build, and whitespace checks pass. The build retains a pre-existing PostCSS `from` warning; it is not a build failure.
- Reviewed desktop 1440×900, mobile 375×812, and portrait 1080×1920 opening screens.
- All four preset routes opened correctly; Next remained disabled until both tune selections were made.
- Exercised back, selections, personal inputs, submission rejection/retry, fixture claim code, QR image rendering, Done, and Start over.
- Reviewed phone ready/lyrics and generating screens; verified failed and missing-code messaging. A long name and lyric lines fit the 375px viewport with no horizontal page overflow.
- Reviewed the operator layout with a fixture row. No real metrics or attendee rows were fetched.
- Reduced-motion preference disables the new sound-field animation. Keyboard Tab focuses Begin with a visible outline.
- Provider calls, live playback, download/share delivery, and scanning a real QR on a second device were deliberately not exercised. Those paths are unchanged.
- No files under `server/` or `shared/` changed. No credentials, generated tracks, or deck source assets are included.
