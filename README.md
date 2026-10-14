# Van de Graaff Generator — Vite project

A GCSE/A-level simulation of a Van de Graaff generator. A belt carries charge up to the dome, and the potential difference rises until corona leakage levels it off. You can:

- change the belt speed;
- show the charges on the belt, the dome, the earthed sphere and the person;
- read the dome's p.d. and charge;
- drag an earthed sphere towards the dome to make sparks;
- charge up a person with long hair, standing on an insulating stool or on the floor;
- have the person touch a metal or wooden doorknob.

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
- `BELT_K` — charging current per m/s of belt speed.
- `CORONA`, `CORONA_P` — corona leakage, which sets the top p.d. of the dome and of the person.
- `E_SPARK` — breakdown field of air (3 MV/m, 30 kV per cm).
- `R_FLOOR` — resistance from the person to the floor through their shoes (sets how fast they discharge off the stool).
- `SHOCK_V` — the smallest p.d. that gives a shock.

## Deploying to GitHub Pages

1. In `vite.config.js`, `REPO_NAME` is set to `van-de-graaff`. Change it if your repo has a different name.
2. Push this project to a GitHub repo, on branch `main`.
3. In the repo's Settings → Pages, set **Source** to "GitHub Actions".
4. The workflow builds the project and publishes `dist/` on every push to `main`.
