# Simulator file inventory

Second audit, after the Exercise-1-PDF-driven redesign (new dataset, new 5-stage
diagram, role-based file resolution). Verified against the actual source
(`workflow-data.js`, `terminal-config.js`, `filesystem.js`, `terminal.js`,
`app.js`, `viewer.js`, `index.html`) and against every file physically present
in `site/data/` — every `ASSET_MAP` URL was checked to resolve to a real file
(0 missing, re-run this session), and every file on disk was checked to be
referenced by something (0 orphans). This replaces the first audit, which
covered a different dataset entirely (see `docs/manifest.md` §9–10 for why it
was replaced).

## How this differs from the first simulator (context for this audit)

The previous simulator used a Zenodo-sourced participant for the main pipeline
(whose raw DICOMs could never be published) plus a *second, unrelated*
public-domain DICOM series only for the DICOM→NIfTI demo — a dead end with no
downstream consumer. This version uses **one matched, CC0-licensed participant**
(`dfsp-spirit/sub-01`) for the entire exercise: both DICOM series are real,
public, downloadable, and feed directly into the rest of the pipeline. There is
no second dataset and no dead-end conversion demo this time.

Inputs are now resolved by **role**, not filename stem (see `filesystem.js`'s
`requireInput`): every file carries a `role` tag assigned by the command that
produced it. A student can rename anything to anything and later steps still
find it correctly — only the *role* is checked, not the text of the name. See
§5 for exactly how this was verified.

## 1. Behavior that applies to every row below

- **The Viewer is gated on terminal progress.** Its "Open:" dropdown and the
  three quick-comparison buttons only include/enable files that are actually
  present in the current session's virtual filesystem — either provided at
  start (the two DICOM folders, the two MNI templates) or revealed by a
  command you ran. Verified: a fresh page load shows exactly 2 dropdown
  options (the MNI templates) and all 3 comparison buttons disabled.
- **`reset` is scoped to the currently active step**, not global — it removes
  only the files tagged `producedByStep === <active step>`, then refreshes
  both the Files panel and the Viewer's available-asset list. Running `reset`
  while a different step is active than the one that made the files you want
  to clear does nothing to those files (by design — each step's outputs are
  independent).
- **Revealed-file placement is cosmetic.** Every revealed file lands at
  `{cwd at the moment the command succeeds}/{the name you typed}`; since nothing
  auto-`cd`s, in practice everything lands at `~/<name>`. Lookups
  (`VFS.findByName`) search by filename stem anywhere in the filesystem, so
  this never affects whether a later step can find its input.
- **Custom output names carry through completely.** Whatever you type as a
  command's output argument becomes that file's real name; `ensureExt()` only
  adds an extension if you didn't give one. A later step accepts it as long as
  its *role* matches — confirmed directly: BET output named `banana.nii.gz`
  was accepted by the next FLIRT step as the post-BET T1w with no special
  casing.
- **Comparison-only parameter variants are never silently swapped for the
  designated result.** If you feed a non-designated variant (e.g. BET `-f 0.2`
  on the T1w, or the `-refvol 0` MCFLIRT run) into a step that needs the
  designated one, you get an explicit message naming the mismatch and pointing
  back at the supported value — never a silent substitution. Verified directly
  (see §5).

## 2. File inventory

| # | Path shown to student | Role | Produced by | Consumed by | Viewer / metadata |
|---|---|---|---|---|---|
| 1 | `~/T1w_dicom/` (192 real files) | `t1w-dicom` | *provided at start* | **T1w dcm2niix** — positional folder arg, matched by role not just name. | `ls T1w_dicom` lists all 192 real filenames (`0002_MR000004.dcm` … `0002_MR000195.dcm`). Real archive downloadable from the Files panel (`T1w_dicom.zip`, 15 MB). |
| 2 | `~/BOLD_dicom/` (240 real files) | `bold-dicom` | *provided at start* | **BOLD dcm2niix**. | `ls BOLD_dicom` lists all 240 real filenames (`0005_MR000580.dcm` … `0005_MR000819.dcm`). Downloadable (`BOLD_dicom.zip`, 50 MB). |
| 3 | `~/MNI152_T1_2mm.nii.gz` | `mni-head` | *provided at start* | **FNIRT** (`--ref=`, full head). | Viewer: yes. |
| 4 | `~/MNI152_T1_2mm_brain.nii.gz` | `mni-brain` | *provided at start* | **T1w→MNI FLIRT** (`-ref`), **applywarp** (`-r`). | Viewer: yes. "Registration" quick-comparison base. |
| 5 | `~/T1w.nii.gz` (+ `.json`) | `t1w-nifti` (+`-json`) | **T1w dcm2niix**, on success. Dims/TR in the log and in the revealed file's metadata are derived from the real series (192 files → 256×256×192; real JSON sidecar), not hardcoded. | **T1w BET** (main input). **FNIRT** (`--in=`, full head). | Viewer: yes. JSON: metadata only. |
| 6 | `~/BOLD.nii.gz` (+ `.json`) | `bold-nifti` (+`-json`) | **BOLD dcm2niix**, on success (240 files → 70×64×37×240, TR=2.0s, derived from the real series). | **MCFLIRT** (main input, both runs). | Viewer: yes (4D). JSON: metadata only. |
| 7 | `~/BOLD_mcf.nii.gz` (+ `.par`, designated) | `bold-mcf-default` | **MCFLIRT**, no `-refvol` (registers to the middle volume, index 120 of 0–239). | **fslroi** (representative-volume extraction) and **fslmaths -mas** (applying the mask to the full 4D) in the fMRI BET step. | Viewer: yes (4D). `.par`: dedicated dual-chart motion plot (rotations/translations separated, units labeled). "Motion correction before/after" comparison's "after" side. |
| 8 | `~/BOLD_mcf_refvol0.nii.gz` (+ `.par`, comparison) | `bold-mcf-refvol0` | **MCFLIRT**, `-refvol 0` — registers to the **first** acquired volume (index 0); see §6. Deliberately *not* the homework's literal `-refvol 1`, which (since `-refvol` is 0-indexed) would register to the second volume instead of the first. | Nothing — dead end by design (Question 2b is a standalone comparison). | Viewer: yes (4D). `.par`: own motion plot, for direct comparison against row 7's. |
| 9 | T1w brain, designated (`-f 0.5`, default) + mask | `t1w-brain` / `t1w-brain-mask` | **T1w BET**, `-f 0.5` or `-f` omitted entirely (0.5 is the homework's and FSL's actual default). | **func→struct FLIRT** (`-ref`), **struct→MNI FLIRT** (`-in`). | Viewer: yes; mask as red overlay on row 5. |
| 10 | T1w brain, comparison variants (`-f 0.2`, `0.4`, `0.8`) + masks | `t1w-brain-variant` / `t1w-brain-mask-variant` | **T1w BET**, those `-f` values. | Nothing — explicitly comparison-only; using one where row 9 is expected gives a named explanation, not a silent swap. | Viewer: yes, all 4 (all 4 full brain images are present on disk this time — the first audit's missing-asset bug does not recur, re-verified §5). |
| 11 | `~/BOLD_mcf_vol0.nii.gz` | `bold-mcf-vol0` | **fslroi** (`fslroi BOLD_mcf.nii.gz <out> 0 1`), part of the fMRI BET step — extracts exactly one volume, enforced (`tmin=0 tsize=1`, any other values rejected with a specific message). | **fMRI BET** (next sub-command). | Viewer: yes. |
| 12 | fMRI-BET representative volume, designated (`-f 0.5`) + mask | `bold-brain-vol0` / `bold-brain-mask` | **fMRI BET**, `-f 0.5`/default, on row 11. | **fslmaths -mas** (the mask; applies to the full 4D, not this single volume). | Viewer: yes; mask as overlay on row 11. |
| 13 | fMRI-BET representative volume, comparison (`-f 0.3`) + mask | `bold-brain-vol0-variant` / `bold-brain-mask-variant` | **fMRI BET**, `-f 0.3`. | Nothing — comparison-only. | Viewer: yes. |
| 14 | `~/BOLD_mcf_brain.nii.gz` — **the real brain-extracted 4D series** | `bold-brain-4d` | **fslmaths -mas** (`fslmaths BOLD_mcf.nii.gz -mas <mask from row 12> <out>`) — explicit, shown, not hidden behind BET's own silent 4D→3D truncation (see §6). | **func→struct FLIRT** (`-in`), **applywarp** (`-i`) — both as the full 240-volume series. | Viewer: yes (4D). |
| 15 | `~/functional2struct.mat` | `func2struct-mat` | **func→struct FLIRT** (`-omat`). | **applywarp** (`--premat=`). | Metadata only (4×4 matrix table). |
| 16 | `~/struct2standard.mat` | `struct2standard-mat` | **struct→MNI FLIRT** (`-omat`). | **FNIRT** (`--aff=`). | Metadata only. |
| 17 | warp field, name from `--cout` | `struct2standard-warp` | **FNIRT** (`--cout=`). | **applywarp** (`--warp=`). | **Not an image — see §7.** Excluded from the Viewer's select dropdown; reachable via the Files panel's "View" button, which shows a text description plus a precomputed displacement-magnitude visualization instead of attempting to render the raw coefficient field. |
| 18 | T1-in-MNI preview, name from `--iout` (**optional**) | `struct2standard-fnirt-result` | **FNIRT**, only if `--iout=<name>` is given — the homework's own command doesn't include it, so nothing is revealed here unless you add it yourself. | Nothing downstream. | Viewer: yes, as a red overlay on row 4. "Registration" quick-comparison's "after" side (so that button stays disabled until you've opted into `--iout`). |
| 19 | `~/BOLD_mni.nii.gz` | `bold-mni` | **applywarp** (`-o`) — combines rows 15 and 17/warp in one resampling pass, applied to the *full* 4D (row 14), not a single volume. | **Smoothing** (main input). | Viewer: yes (4D, 240 volumes, 91×109×91 @ 2mm). "Smoothing before/after" comparison's "before" side. |
| 20 | `~/BOLD_mni_smooth5mm.nii.gz` | `bold-smoothed` | **Smoothing** (`fslmaths -kernel gauss 2.1233 -fmean`) — only sigma 2.1233 (5mm FWHM) is precomputed; 3mm/7mm are Question 5's pencil-and-paper calculation, explicitly not run here (see the step's `slideNote`). | Nothing — final output. | Viewer: yes. "Smoothing before/after" comparison's "after" side — **fixed** this session (previously wired to a nonexistent key; now `bold_mni`/`bold_smooth5mm`, both real). |

## 3. DICOM series detail

| Property | T1w (series 0002) | BOLD (series 0005) |
|---|---|---|
| File count | 192 | 240 |
| Filename pattern | `0002_MR######.dcm`, e.g. `0002_MR000004.dcm` … `0002_MR000195.dcm` | `0005_MR######.dcm`, e.g. `0005_MR000580.dcm` … `0005_MR000819.dcm` |
| Converted dims | 256×256×192, 1mm isotropic | 70×64×37×240, 3mm, TR=2.0s |
| Real archive | `site/data/dicom/T1w_dicom.zip` (15 MB) | `site/data/dicom/BOLD_dicom.zip` (50 MB) |
| Simulator's virtual listing | `ls T1w_dicom` enumerates all 192 real filenames — not a placeholder this time. | `ls BOLD_dicom` enumerates all 240 real filenames. |
| Same participant/session? | Both series share one DICOM `StudyInstanceUID` (verified directly against the downloaded files) — a direct, file-level fact. | |

## 4. Outputs that exist only for inspection (no downstream command reads them)

Rows 5's/6's JSON sidecars, row 8 (the entire `-refvol 0` comparison run, both the 4D image and its `.par`), row 10 (3 of 4 T1w BET comparison variants), row 13 (the fMRI BET comparison variant), and row 18 (the FNIRT `--iout` preview, itself optional). This is intentional — these are exactly the files Questions 2b and 3 ask students to look at and compare, not to feed forward.

## 5. Verification performed this session (not just read the code)

- **Every `ASSET_MAP` URL resolves to a real file** — scripted check against the 30 URLs in `terminal-config.js` vs. `site/data/`: 0 missing (the first audit's 3-missing-file bug does not recur; this time `03_build_public_bundle.sh` was actually re-run after being written, not just edited).
- **Every file under `site/data/` is referenced by something** — 0 orphans (the DICOM zips and the warp PNG are referenced by hardcoded paths in `app.js`/`viewer.js` rather than `ASSET_MAP`, checked separately).
- **Full pipeline chain, end to end, in a real browser** (Playwright): both DICOM conversions → both MCFLIRT runs → T1w BET → 3-command fMRI BET → missing-prerequisite rejection on `applywarp` → full Stage 4 chain (including the optional `--iout`) → smoothing. Zero console errors, zero failed requests.
- **Comparison-only rejection, specifically**: ran `bet T1w.nii.gz my_custom_brain.nii.gz -f 0.2 -m`, then tried to use `my_custom_brain.nii.gz` as the input to struct→MNI FLIRT. Got: *"is a real result, but a comparison-only one — it isn't wired into the rest of this exercise's pipeline... use the designated result for this role instead"* — not a silent substitution, not a generic error. (This caught and fixed a real bug: the first version of this check only fired for some steps because `flirt`'s `-ref` check never received a `comparisonRoles` argument at all, and `struct→MNI FLIRT`'s step config never declared one for its `-in`. Both fixed; re-verified.)
- **Custom-filename chaining**: renamed BET's T1w output to `banana.nii.gz`; the next FLIRT step accepted it as `-in` with no special handling — confirms role-based resolution actually works, not just in the direct/suggested-filename case.
- **Viewer gating**: a *second, fresh* browser context (nothing run yet) shows 2 dropdown options and all 3 comparison buttons disabled; the main session after the full chain shows 20.
- **Warp visualization**: clicked "View" on the warp field via the Files panel; confirmed the description panel renders and the magnitude-map image loads (not a 404, not an attempt to render the coefficient field as a volume).
- **Smoothing comparison button**: confirmed enabled once both sides exist, click-tested, canvas renders.
- **Dual motion plots**: both the default and `-refvol 0` `.par` files render their own 2-chart (rotations/translations) plot.
- **Layout**: 0 horizontal-overflow regressions at 320/375/768/1280px across all 5 tabs.
- **Deployment path-independence**: the entire test sequence above re-run against a simulated GitHub Pages project subpath (`/my-repo/index.html` served from a parent directory) — identical result, 0 errors.

## 6. FSL-behavior findings this design depends on (verified against the installed FSL 6.0.7.13, not assumed)

- **`mcflirt -refvol` is 0-indexed.** Its own `--help` text: *"-refvol <number of reference volume> (default is no_vols/2) - registers to the (n+1)th volume in series."* So `-refvol 0` selects the **first** volume (index 0); `-refvol 1`, the homework's literal flag, would select the second. The homework's own prose calls this run an alignment "to the first volume" — we use `-refvol 0` to actually produce that, and say so explicitly (`workflow-data.js`'s `mcflirt` step `slideNote`) rather than silently following the homework's literal flag (which would contradict its own prose) or its prose (which would contradict its own flag).
- **`bet`/`flirt` silently truncate a 4D input to its first volume.** Confirmed by actually running `bet` and `flirt` on a real 4D file without `-F`/other 4D-aware flags: *"Warning: An input intended to be a single 3D volume has multiple timepoints. Input will be truncated to first volume, but this functionality is deprecated and will be removed in a future release."* Not an average, not all volumes. This is why the fMRI BET step is three explicit commands (extract first volume → BET it → mask the full 4D back) instead of one `bet <4D> <out> -m` call: the homework's own one-line command, run exactly as written, would silently produce a single 3D volume, not the 4D result Stage 4 needs.

## 7. Why the warp field isn't rendered as a volume

FNIRT's `--cout` output is a field of spline coefficients (here, 21×24×21×3)
describing a nonlinear displacement — not voxel intensities. Niivue (or any
NIfTI viewer) would render it as noise if asked to. Instead, `viewer.js`'s
`showWarpDescription()` shows a plain-language explanation plus a precomputed
visualization: the coefficient field converted to a full displacement field
(`fnirtfileutils --outformat=field`), reduced to its magnitude in mm at every
point, and overlaid on the MNI brain — so students can see *where* (mostly
near ventricles and the cortical surface, where individual anatomy differs
most from the template) and *how much* (up to ~12.5mm in this registration)
the nonlinear step actually moved things.
