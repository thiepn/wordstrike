# Practice Lab — Offline & Real-Device Acceptance

Phase 7 separates automated browser/device proxies from tests that genuinely require physical hardware.

## Automated release gate

The Practice Certification Matrix now covers:

| Surface | Automated environment | What is certified |
| --- | --- | --- |
| Desktop Chromium | Playwright Chromium | full Practice journeys, offline boot, PWA upgrade, storage stress, accessibility |
| Android-Chromium proxy | Chromium mobile context, Android/Samsung user agent, touch enabled | 390×844 portrait, 844×390 landscape, 44 px controls, software-keyboard attributes, background pause/resume |
| Desktop Firefox | Playwright Firefox | public journeys and saturated-storage resilience |
| iOS-WebKit proxy | Playwright WebKit mobile context, iPhone Safari user agent, touch enabled | portrait/landscape, mobile overflow, background pause/resume, public journeys, saturated-storage resilience |
| Fresh offline install | Chromium service worker | offline document boot, Assessment, Real Text, Read-Ahead, Metronome and persisted history |
| Service-worker upgrade | Chromium service worker | optional-precache failure tolerance, old-cache replacement, IndexedDB preservation, offline boot after upgrade |
| IndexedDB repair/quota | Chromium/Firefox/WebKit browser storage | schema recovery, transaction failure, localStorage pressure, persisted Practice data |

These are release-blocking automated proxies. They are not presented as physical-device certification.

## Physical hardware sign-off

The following checks require an actual phone/browser and cannot be honestly certified by Playwright emulation alone.

### Android Chrome — physical phone

- Install the PWA from Chrome.
- Launch from the home-screen icon and confirm standalone display.
- Open Practice Lab, Daily Training, Problem Words, Custom Text and Read-Ahead.
- Type with the software keyboard; verify no viewport jump hides the current line or primary controls.
- Rotate portrait → landscape → portrait during an ordinary target session.
- Background the app for at least 30 seconds; return and verify ordinary target practice is paused rather than silently progressing.
- Resume explicitly and finish/save a session.
- Enable airplane mode, force-close the installed PWA, reopen it offline and verify Practice Lab boots and saved local history remains readable.
- Restore network and verify normal operation without clearing storage.

### Samsung Internet — physical Samsung phone

Repeat the Android checks above in Samsung Internet, with special attention to:

- add-to-home-screen/standalone launch behavior;
- software-keyboard resize behavior;
- Back button behavior;
- background/foreground lifecycle;
- IndexedDB persistence after browser process restart;
- offline launch after the service worker has been installed.

### iOS Safari — physical iPhone

- Add WORDSTRIKE to Home Screen.
- Launch from the icon and confirm standalone presentation.
- Exercise Practice in portrait and landscape.
- Verify the iOS software keyboard does not cause page-level horizontal scrolling.
- Background and foreground an ordinary target session; confirm it returns paused.
- Verify protected/tightly timed protocols do not pretend uninterrupted validity after backgrounding.
- Complete a local session, force-close the PWA, reopen and verify IndexedDB history persists.
- Test offline relaunch after a successful online install.

### Upgrade sign-off on installed PWA

On at least one Android device and one iPhone:

1. Install/use build A and create Practice history plus a saved Custom Text.
2. Deploy build B with a new service-worker cache version.
3. Open online once so the service worker updates.
4. Confirm saved Practice data remains.
5. Force-close, enable airplane mode and reopen.
6. Confirm the updated shell launches offline and the pre-upgrade data is still readable.

## Acceptance rule

Automated proxy failures block merging.

Physical-device checks are a separate release sign-off. Until they have actually been run on hardware, release notes must say **physical-device sign-off pending** rather than claiming Samsung Internet/iOS installed-PWA certification.
