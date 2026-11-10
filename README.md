# MRI preprocessing teaching demo

Sources, validates, and preprocesses a matched T1w + BOLD DICOM pair from one
real, CC0-licensed participant, and uses it to power a static HTML/CSS/JS
teaching site built around "Exercise 1 - Preprocessing.pdf": a clickable
5-stage workflow diagram, a guided terminal simulator (both real DICOM series
convert live in the simulator), and an in-browser NIfTI viewer gated on what
you've actually produced.

**Live site:** https://yoavmp.github.io/MRI_processing/

See `docs/manifest.md` §10 onward for the current writeup — dataset/license, the
FSL-behavior verifications (`-refvol` indexing, 4D truncation in `bet`/`flirt`),
pipeline run log, bundle size, and test results. (§1–9 document a prior
iteration built on a different dataset; superseded, kept for history.)
See `docs/simulation-files.md` for the full per-file inventory of what the
simulator reveals, consumes, and gates, and §0 there for the latest UI/UX
fixes (files sidebar, self-contained terminal steps, WebGL2 fallback,
comparisons, workflow data-flow badges).

## Layout

```
Exercise 1 - Preprocessing.pdf   the homework (source of truth for stages/commands/defaults)
data/            raw downloaded DICOMs — gitignored, local only
derivatives/     full pipeline outputs (non-public, includes non-defaced T1w) — gitignored, local only
scripts/         tracked: fetch + pipeline scripts, public-bundle assembly
docs/            tracked: manifest.md, simulation-files.md, QC images
site/            the teaching website — HTML/CSS/JS + its public data bundle (site/data/)
.devtools/       local dev tooling (Playwright, for browser testing) — gitignored, not part of the site
```

MRI binaries outside `site/data/` (raw DICOM working copies, non-defaced T1w,
intermediate derivatives) are intentionally kept out of the tracked git tree
(see `.gitignore`). `site/` itself — including `site/data/`, which contains
only de-identified, defaced, CC0-licensed files, plus the two real downloadable
DICOM archives — is tracked, since that's the deployable artifact.

## Rebuilding the data from scratch

```
bash scripts/04_fetch_sub01_dicom.sh     # download the matched T1w+BOLD DICOM pair (CC0) + build the downloadable zips
bash scripts/05_run_pipeline_sub01.sh    # full pipeline: dcm2niix x2 -> deface -> BET/FLIRT/FNIRT -> MCFLIRT x2 -> BET+mask -> applywarp -> fslmaths
bash scripts/03_build_public_bundle.sh   # copy the validated, de-identified outputs into site/data/ (wipes and rebuilds it)
bash scripts/06_build_previews.sh        # build the Viewer's no-WebGL2 static preview PNGs from the site/data/ bundle
```

Requires FSL (`$FSLDIR` set, incl. `fsl_deface`, `fnirtfileutils`, and
`fsleyes`) and `dcm2niix` on `PATH`. FNIRT takes ~15-20 minutes.

## Running the website locally

```
cd site
python3 -m http.server 8765
```

Then open `http://localhost:8765/index.html`. Pure static files — any static
file server works, at root or any subpath (tested under a simulated GitHub
Pages project subpath). No build step.

## What's left

- The FSL-GUI simulator (as opposed to the command-line terminal) — deliberately not done yet.
- This exercise uses 1 of the homework's 3 participants (bundle-size tradeoff).
- 3mm/7mm smoothing (Question 5) is a calculation exercise in the UI, not a third precomputed pipeline branch.
- See manifest §10g for the full list of remaining differences from the homework.
