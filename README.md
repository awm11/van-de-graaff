# Van de Graaff Generator — Vite project

A GCSE/A-level simulation of a Van de Graaff generator. A belt carries charge to the dome, and the potential difference rises, levelling off gradually as charge leaks into the air. You can:

- change the belt speed with the slider on the generator's base;
- show the earthed sphere and drag it towards the dome to make sparks;
- show a person with long hair, standing on an insulating stool, and charge them up by putting their hand on the dome;
- click the stool to take it away (they then discharge through the floor) and the "Add stool" button on the floor to put it back;
- click the doorknob, or the person's hand nearest the door, to make them touch it, with a metal or a wooden knob;
- read the p.d. and charge of the dome and the person, with a meter for each;
- show the charges, the gap and the movement of positive charge;
- open the "What is happening" card for explanations.

Clickable things in the scene glow when you hover over them, with a label saying what clicking will do.

Only electrons move in the sim: the + signs (positive charge) stay put, and the − signs show electrons flowing. The dome is positive because electrons have left it. The person becomes positive when electrons flow out of them into the dome. When they discharge, electrons flow in from earth and cancel their positive charge. The "Show movement of positive charge" switch shows the same flows as + signs moving the opposite way (conventional current). The streams of electrons slow down and thin out as the current falls.

The "What is happening" card (minimised at the start; open it with its + button) lists the explanations for what is in the scene and highlights the one for what is happening now.

### Keyboard and screen readers

- Tab to the scene and use the left and right arrow keys to move the earthed sphere (hold Shift for bigger steps).
- Tab on from the scene to reach "Touch doorknob" and "Remove stool"/"Add stool". These buttons are hidden until they have focus, then appear in the scene's top-right corner.
- The belt-speed slider on the generator's base and all the panel controls are ordinary form controls.

## Setup

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

## Structure

- `index.html` — Vite entry HTML (loads the fonts and `src/main.jsx`).
- `src/main.jsx` — React root bootstrap.
- `src/App.jsx` — the simulation: physics model, canvas drawing and all React components.
- `src/styles.css` — all styling, with light and dark themes.
- `src/BuyMeCoffee.jsx` — the support button in the footer.
- `.github/workflows/deploy.yml` — builds and deploys to GitHub Pages on every push to `main`.

## Things you might want to tweak (top of `src/App.jsx`)

- `R_DOME` — dome radius (sets its capacitance, C = 4πε₀R ≈ 13 pF).
- `C_PERSON` — the person's capacitance (about 100 pF).
- `BELT_K` — charging current per m/s of belt speed (0.12 µA, so about 0.5 µA at the default speed).
- `CORONA`, `CORONA_P`, `CORONA_N` — corona leakage, which sets the top p.d. of the dome and of the person (`CORONA_N` sets how gradually it levels off).
- `R_LEAK` — leakage through the air and the column; with the dome alone RC ≈ 11 s, which gives the charging curve its gradual, capacitor-like shape.
- `E_SPARK` — breakdown field of air (3 MV/m, 30 kV per cm).
- `R_FLOOR` — resistance from the person to the floor through their shoes (sets how fast they discharge off the stool).
- `HAIR_N`, `HAIR_FRONT` — how many strands of hair grow from the outline of the head and from the front of the scalp.
- `SHOCK_V` — the smallest p.d. that gives a shock.

## Deploying to GitHub Pages

1. In `vite.config.js`, `REPO_NAME` is set to `van-de-graaff`. Change it if your repo has a different name.
2. Push this project to a GitHub repo, on branch `main`.
3. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
4. The workflow builds the project and publishes `dist/` on every push to `main`.
