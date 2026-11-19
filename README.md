# Signal — How mobile phones work

A 24-second, code-driven 3D motion explainer. It follows a voice from a phone, over radio waves and through a cell tower, to another phone.

- **Finished video:** `output/how-mobile-phones-work.mp4` — 1280 × 720, 30 fps, with original synthesized music and sound effects. There is no narration.
- **Interactive preview:** playback, scrubbing and chapter navigation (silent).

## Run the interactive preview

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Run `npm run build` to make a production build and `npm run preview` to serve it.

## Re-render the video

The renderer captures the actual Three.js film at exact time steps and encodes it with FFmpeg. It needs Node.js, Python 3 with NumPy, FFmpeg with libx264, and the Linux libraries required by Chromium (including NSS/NSPR). `CHROME_PATH` can point to an installed Chromium; otherwise the bundled `@sparticuz/chromium` binary is used.

```sh
npm install
python3 -m pip install numpy
python3 scripts/soundtrack.py output/soundtrack.wav
node scripts/render-video.mjs --audio=output/soundtrack.wav --out=output/how-mobile-phones-work.mp4
```

Set `FFMPEG_PATH` if FFmpeg is not on the PATH. To inspect stills, run `node scripts/render-video.mjs --stills=0,7,13,20`. The source sound is synthesized by `scripts/soundtrack.py`; all effect timings are in that file. The browser film is implemented in `src/main.js` and its layout in `src/style.css`.

`PLAN.md` contains the shot plan and `NOTES.md` records the build. The supplied archive was unpacked into `3d-animator/` (with its PDF at the project root); `film-kit/` is a copy of the original starter kit.
