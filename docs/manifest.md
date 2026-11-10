# Teaching data manifest — MRI preprocessing demo

Status: the site has been rebuilt around a different source of truth — see **§10** for
the current design (dataset, pipeline, verification). §1–9 document the *previous*
iteration (different dataset, different workflow structure) and are kept for history;
where they conflict with §10, §10 is current. The FSL-GUI simulator and actual
deployment remain a later phase.

## 1. Source evaluation

| Source | License | Redistributable? | Verdict |
|---|---|---|---|
| `datalad/example-dicom-functional` (GitHub, `1block` branch) | **PDDL** (Open Data Commons Public Domain Dedication & Licence) — full repo, confirmed via `LICENSE` file | Yes, unrestricted, no attribution required | Valid, public-domain, pre-anonymized (`PatientName=Jane_Doe`, no institution/physician/serial fields). **Functional only — no T1w**, so it cannot alone satisfy the "T1w + BOLD from the same person" requirement. Kept as a secondary/fallback functional-only asset (18 vols, 80×80×35, TR=2s, 43 MB raw). |
| `psychoinformatics-de/studyforrest-data-structural`, sub-02 anat | **PDDL**, confirmed via repo README badge | Yes | Valid structural-only dataset, but it is a DataLad/git-annex dataset — `datalad`/`git-annex` are **not installed** in this environment, so the actual T1w content was not fetched. Pairing it with `example-dicom-functional`'s sub-02 to claim "same person" would rely on the two studyforrest sub-projects' shared participant-ID convention (documented in their publications) rather than on anything independently verifiable in the files themselves. **Not used**, for this reason — see §3. |
| **Zenodo 3677090** — "Princeton Handbook for Reproducible Neuroimaging: Sample Data" | **CC-BY-4.0** (Zenodo record metadata) | Yes, with attribution | **Selected as primary source.** Single scan session (`ses-01`), single subject, containing both the T1w anatomical and 5 functional runs — the only one of the three candidates where same-person/same-session is a direct, file-verifiable fact rather than an inference. See §3 and §4 for the identifiability trade-off this introduces. |

### Citations

- **Zenodo 3677090**: Nastase, S. A., Mennen, A. C., Brooks, P. P., & McDevitt, E. A. (2020). *Princeton Handbook for Reproducible Neuroimaging: Sample Data* (Version 1.0.0) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.3677090
- **example-dicom-functional** (secondary asset): derived from Sengupta, A., Kaule, F. R., Guntupalli, J. S., Hoffmann, M. B., Häusler, C., Stadler, J., & Hanke, M. (2016). A studyforrest extension, retinotopic mapping and localization of higher visual areas. *Scientific Data*, 3:160093. https://doi.org/10.1038/sdata.2016.93
- **MNI152 standard-space template** (`$FSLDIR/data/standard/MNI152_T1_2mm*`): © 1993–2009 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Permissively licensed ("permission to use, copy, modify and distribute... for any purpose and without fee... provided the copyright notice appears in all copies"). We retain this notice in the public bundle. Background: Grabner et al. (2006), *Symmetric Atlasing and Model Based Segmentation*, MICCAI.
- FSL itself (the software, not its bundled data) is licensed under the **FSL Non-Commercial licence** — fine for running locally and for non-commercial teaching use, but FSL's own binaries/source must not be redistributed in the student bundle. We only ship outputs the pipeline produces, plus the separately-licensed MNI template.

### Pinned versions

- Zenodo record 3677090, file `0219191_mystudy-0219-1114.tar.gz`, size **405,671,662 bytes**, MD5 **`cec6bb90a60a41b75028261387a6ede5`** — verified against the Zenodo API on download (§5).
- `datalad/example-dicom-functional`, branch `1block`, commit at time of clone (small repo, plain git, no git-annex).
- FSL **6.0.7.13** (local install, `$FSLDIR=/Users/crazyjoe/fsl`), `dcm2niix` **v1.0.20211006**.

## 2. DICOM / sidecar identifier check (before any public hosting)

**`example-dicom-functional`** (already anonymized by the original authors via `gdcmanon`):
`PatientName=Jane_Doe`, `PatientID=02`, DOB/weight are placeholder values, institution/physician/station/device-serial fields are blank. `StudyDate=2014-04-25` is real and retained (minor residual quasi-identifier, low risk). **Safe to host as-is.**

**Zenodo 3677090** (the record is explicitly "authorized for non-anonymized distribution" by the contributing author — this is a deliberate, consented release, not an oversight): the raw DICOM headers carry **real identifiers** —

- `PatientName`/`PatientID = 0219191_greenEyes`, `PatientBirthDate = 1988-05-14`, `PatientSex = M`, `PatientAge = 030Y`, `PatientWeight = 81.6 kg`
- `StudyDate/Time = 2019-02-19 11:14:35`
- `InstitutionName/Address = Princeton University – Neuroscience Institute, Washington and Faculty Rd., Building 25, Princeton, NJ 08540`
- `StationName = AWP45031`, `DeviceSerialNumber = 45031`

Critically, **`dcm2niix`'s default BIDS JSON sidecar carries several of these straight through**: `InstitutionName`, `InstitutionAddress`, `InstitutionalDepartmentName`, `DeviceSerialNumber`, `StationName`, and `ProcedureStepDescription` (which embeds the PI names as `"Norman_Mennen^5516_greenEyes"`). `PatientName`/`DOB`/`weight` are *not* carried into the JSON by default, and NIfTI itself has no PHI fields (checked `descrip`/`aux_file`/`intent_name` — only contain `TE`/scan-clock-time, non-identifying in isolation).

**Action taken:** raw DICOMs for this source stay in `data/` (gitignored, local-only) and are never copied into anything meant for public hosting. `scripts/sanitize_sidecar.py` strips the nine institution/scanner/PI/timestamp fields from the JSON sidecar before any public copy is made; the sanitized sidecar keeps every field that matters for teaching (TR, TE, flip angle, matrix, slice timing, manufacturer/model, field strength). This step is **mandatory**, not optional, and is wired into `02_run_pipeline.sh`.

## 3. Same-subject / alignment confirmation

Both series used (T1w = DICOM series 5, BOLD = series 13) come from the **same Zenodo session folder**, same `StudyInstanceUID`, both labeled `ses-01`, same `PatientID`/`PatientName`, acquired ~78 minutes apart in one sitting (T1w at 11:29, faces-task BOLD at 12:47, same day). This is a direct, file-level fact, not an inference — which is exactly why this source was chosen over pairing sources 1+2.

Alignment was checked three ways (FSL available locally, see §6 for full run log):
1. **BET mask** on the T1w (`-f 0.4 -m`, the slide's example value) — visually reasonable, slightly generous at frontal/orbital edges (expected at this fraction).
2. **func→struct FLIRT** (6 DOF): rotation terms near-identity, translations in the tens-of-mm range (consistent with normal FOV offset between an EPI and a 3D structural), not a degenerate/failed solution.
3. **QC overlay**: functional-brain edges (from the registered mean functional) over the structural grayscale image — edges track the cortical ribbon and ventricle boundaries closely in all three planes, with no gross offset. Screenshots saved during this session; see §6.

## 4. I/O manifest

```
RAW (local only, never public)
  data/zenodo_3677090/0219191_mystudy-0219-1114/dcm/{5,13}-*.dcm.gz
      ├─ series 5  (192 files) = anat_ses-01_T1w
      └─ series 13 (196 files) = func_ses-01_task-faces_run-01

ANATOMICAL BRANCH                              FUNCTIONAL BRANCH
  dcm2niix                                        dcm2niix
   -> sub-02_T1w.nii.gz + .json                     -> sub-02_task-faces_bold.nii.gz + .json
   -> sanitize_sidecar.py -> .sanitized.json         -> sanitize_sidecar.py -> .sanitized.json
  bet (-f 0.4 -m -R)                              mcflirt (-mats -plots -rmsrel -rmsabs)
   -> sub-02_T1w_brain.nii.gz                        -> sub-02_task-faces_bold_mcf.nii.gz
   -> sub-02_T1w_brain_mask.nii.gz                   -> sub-02_task-faces_bold_mcf.nii.gz.par
  flirt (12 DOF, -> MNI152_2mm_brain)                -> sub-02_task-faces_bold_mcf.nii.gz.mat/
   -> struct2standard_affine.mat                   fslmaths -Tmean
  fnirt (--aff=affine, config=T1_2_MNI152_2mm)       -> ..._mcf_mean.nii.gz
   -> struct2standard_warp.nii.gz                  bet (-f 0.3 -m -R)  [motion-corr. BEFORE BET,
                                                        -> ..._mcf_mean_brain.nii.gz   per slide 42]
                                                        -> ..._mcf_mean_brain_mask.nii.gz
                      \                            /
                       \   JOIN (func -> struct -> standard)
                        \ /
             flirt (6 DOF, mean-func-brain -> T1w_brain)
               -> example_func2highres.mat
             applywarp (--premat=example_func2highres.mat --warp=struct2standard_warp)
               -> sub-02_task-faces_bold_mni.nii.gz        [normalized 4D BOLD]
             fslmaths -kernel gauss 2.1233 -fmean
               -> sub-02_task-faces_bold_mni_smooth5mm.nii.gz   [smoothed 4D BOLD]
```

Deliverables for the terminal simulator (planned next phase): BET mask, `.par` motion file, FLIRT/affine `.mat` files, FNIRT warp, normalized 4D BOLD, smoothed 4D BOLD — all listed above.

## 5. Download & verification steps

See `scripts/01_fetch_data.sh` (checks size + MD5 against the Zenodo API record before extracting) and `scripts/02_run_pipeline.sh` (full command sequence, matches what was actually run this session).

## 6. Pipeline run log (this session, FSL 6.0.7.13, local)

All stages ran successfully, locally, with FSL 6.0.7.13 and dcm2niix v1.0.20211006. Commands and flags follow the slide deck exactly where the deck specifies them (BET `-f 0.4 -m`; FLIRT/FNIRT plain usage as shown in their `--help` screenshots on slides 29–30; MCFLIRT `-mats -plots`; FEAT's own FWHM default of 5 mm from the slide 35 screenshot). Where the deck leaves a parameter unspecified we chose one and say so inline.

| Stage | Command | Result |
|---|---|---|
| dcm2niix (T1w) | `dcm2niix -z y -b y -f sub-02_T1w -o anat T1w/` | 256×256×192, 1 vol. Valid NIfTI + BIDS JSON. |
| dcm2niix (BOLD) | `dcm2niix -z y -b y -f sub-02_task-faces_bold -o func faces/` | **64×64×27×196, TR=1.5s.** Valid 4D NIfTI + BIDS JSON (mosaic DICOM correctly unpacked to 27 slices × 196 volumes). |
| sidecar sanitization | `scripts/sanitize_sidecar.py` | Stripped `InstitutionName/Address`, `DeviceSerialNumber`, `StationName`, `ProcedureStepDescription` (PI names), `AcquisitionTime`, `ConsistencyInfo` from both JSON sidecars; all technical fields (TR/TE/flip angle/slice timing/matrix) retained. |
| BET (T1w) | `bet sub-02_T1w.nii.gz sub-02_T1w_brain.nii.gz -f 0.4 -m -R` | `-f 0.4 -m` is the slide's own example verbatim (slide 7: "bet 001.nii 001_brain.nii -f 0.4 -m"). **`-R` is not on the slide** — we added it ourselves (robust brain-centre estimation, iterates BET's initial centre-of-gravity guess) as cheap insurance against a bad starting estimate; it does not change what `-f` means or alter the slide's documented f-value behavior. Mask volume 1.59 L. Visual QC (overlay screenshot): anatomically reasonable, slightly generous at frontal/orbital edges — expected at this lower threshold, consistent with slide 6's own observation that smaller `-f` gives a larger brain outline. |
| FLIRT (struct→standard) | `flirt -in sub-02_T1w_brain.nii.gz -ref MNI152_T1_2mm_brain.nii.gz -omat struct2standard_affine.mat -out struct2standard_affine.nii.gz` | 12-DOF affine, ~30 s. |
| FNIRT (struct→standard) | `fnirt --in=sub-02_T1w.nii.gz --ref=MNI152_T1_2mm.nii.gz --aff=struct2standard_affine.mat --cout=struct2standard_warp --config=T1_2_MNI152_2mm` | ~20 min (single-threaded phases). Warp field (coefficient representation, 21×24×21×3 @ 10mm spacing) produced cleanly. QC overlay (MNI edge contours on warped structural) tracks the cortical outline and ventricles closely in all three planes — nonlinear registration looks good. |
| MCFLIRT | `mcflirt -in sub-02_task-faces_bold.nii.gz -out sub-02_task-faces_bold_mcf.nii.gz -mats -plots -rmsrel -rmsabs` | ~17 s. Mean abs. displacement **0.65 mm**, mean relative (frame-to-frame) **0.057 mm**, max frame-to-frame **0.18 mm** — low motion, no outlier volumes. `.par` file (196 rows × 6 columns) produced. |
| BET (mean functional) | `fslmaths ..._mcf -Tmean ..._mcf_mean` then `bet ..._mcf_mean ..._mcf_mean_brain -f 0.3 -m -R` | Run **after** MCFLIRT, per the homework order (slide 42: "motion correction (fMRI only)" precedes BET). `-f 0.3` used (BET's own documented default for `-F`/4D-FMRI mode, since the slide's `-f 0.4` example was given for a T1w, not EPI). Mask QC: covers the brain reasonably given 64×64×27 native resolution. |
| FLIRT (func→struct) | `flirt -in ..._mcf_mean_brain.nii.gz -ref sub-02_T1w_brain.nii.gz -omat example_func2highres.mat -dof 6` | 6-DOF rigid, ~4 s. Rotation terms near-identity, translations in the 10–20 mm range (normal FOV offset). QC overlay (functional edges on structural) tracks the cortical ribbon closely — supports the same-person/suitable-alignment conclusion in §3. |
| applywarp (join) | `applywarp -i sub-02_task-faces_bold_mcf.nii.gz -r MNI152_T1_2mm_brain.nii.gz -o sub-02_task-faces_bold_mni.nii.gz --premat=example_func2highres.mat --warp=struct2standard_warp.nii.gz` | ~1m50s. Output **91×109×91×196 @ 2mm**, exactly matching the MNI152_2mm grid — func→struct and struct→standard combined in one resampling step as intended. **[normalized 4D BOLD]** |
| fslmaths (smoothing) | `fslmaths sub-02_task-faces_bold_mni.nii.gz -kernel gauss 2.1233 -fmean sub-02_task-faces_bold_mni_smooth5mm.nii.gz -odt short` | FWHM = 5 mm, sigma = 2.1233 mm (matches slide 34's own annotated value and slide 35's FEAT-default screenshot). Before/after single-slice QC shows clear, expected blurring. **[smoothed 4D BOLD]**. Storage format quantified in §6a below. |

### 6a. Storage format decision: int16 vs float32 (not from the slides — our own choice)

`fslmaths` defaults to `FLOAT32` output regardless of the input's datatype. On the full 196-volume run this inflated the smoothed file from 122 MB (int16) to 487 MB (float32) for a Gaussian-mean operation — a 4× size cost. Before picking `-odt short` (forcing int16 output, matching the input) as the final choice, we quantified what that costs in accuracy, on the 30-volume excerpt (identical operation, same kernel):

- **Rounding:** mean absolute rounding error vs. the float32 result, restricted to signal-bearing voxels (intensity > 50): **0.25 intensity units**, max **0.50** (i.e. exactly the ±0.5 bound of round-to-nearest-integer quantization — no systematic bias, pure quantization noise).
- **As a fraction of the data's dynamic range** (0–1370.8 in this excerpt): mean rounding error **0.018%**, max **0.037%** — three orders of magnitude below anything that could matter for a voxel-wise statistical analysis.
- **Clipping:** int16 covers ±32767; this BOLD data's intensities top out around 1371. Checked every voxel/timepoint in the excerpt: **zero values exceeded the int16 range** — no clipping occurs.
- A naive whole-image relative-error metric (including background) reports a misleading ~15% mean / up to 100% max — an artifact of dividing small absolute differences by near-zero background intensities, not a real effect. We report the signal-restricted absolute and dynamic-range-relative figures above instead, since those are what actually bears on data quality.

**Final choice: `-odt short` (int16) for every public/shipped NIfTI in this project.** Consequence: ~4× smaller files, with rounding error roughly 400× smaller than anything that would be visible or statistically relevant, and no clipping risk given this data's intensity range. This is not a slide-specified parameter — it is a deliberate engineering choice made after measuring the trade-off, and should be re-verified if this pipeline is ever pointed at data with a very different intensity range (e.g. already-normalized z-score maps, which can be fractional and centered near zero — int16 would be a poor choice there).

Nothing in this pipeline was left unverified — every stage ran to completion locally and was spot-checked (dimensions via `fslinfo`, motion stats via the `.rms` files, and visual QC overlays, saved at `docs/qc/`):

- `01_bet_t1w_f0.4.png` — BET mask (`-f 0.4 -m`) on the T1w.
- `02_func2struct_flirt.png` — functional-edges-on-structural overlay, 6-DOF FLIRT.
- `03_struct2mni_fnirt.png` — MNI-edges-on-warped-structural overlay, FNIRT.
- `04_bet_mean_func.png` — BET mask on the mean (post-MCFLIRT) functional.
- `05_pre_smoothing.png` / `06_post_smoothing_fwhm5mm.png` — same slice before/after 5mm FWHM smoothing.

## 7. Bundle size

- Raw DICOM subset actually needed (T1w + 1 functional run, decompressed): **138 MB** — stays local only, never shipped publicly (§2).
- Full local `derivatives/` tree (includes intermediate/debug files like the full-res `example_func2highres.nii.gz`): **340 MB**.
- **Projected public student bundle (sanitized derivatives only): ~327 MB.** Dominated by the two full 196-volume, 2mm-MNI-space 4D BOLD files — the normalized and smoothed outputs are **128 MB each**, together two-thirds of the bundle. The 2mm MNI resampling increases voxel count ~8× over the native 64×64×27 grid, which is why these dwarf the 26 MB native-resolution functional.
- **Update (website-build session, §9): implemented.** The public site ships a 30-volume excerpt (not the full 196) with every functional stage re-derived from scratch on that excerpt, plus `-odt short` applied consistently (§6a) and a defaced T1w (§9). Final public bundle: **~93 MB** (`site/data/`), down from the ~327 MB estimated here.

## 9. Website build (this session)

A working static site was built in `site/` — vanilla HTML/CSS/JS, no build step, suitable for GitHub Pages at either the repo root or a project subpath (all asset references are relative; verified under both, see test results below).

### 9a. Public BOLD excerpt

Defined as **volumes 0–29 (the first 30) of the original 196-volume `func_ses-01_task-faces_run-01` run**, TR=1.5s (0–43.5s). Extracted from the raw dcm2niix output with `fslroi sub-02_task-faces_bold.nii.gz sub-02_task-faces_bold_excerpt.nii.gz 0 30`, then **every functional-branch stage was re-run from scratch on the excerpt** (MCFLIRT → mean+BET → FLIRT func→struct → applywarp → smoothing), not just truncated from the full-run outputs — so motion parameters, the brain mask, and the registration are all self-consistent for exactly this excerpt. Mean absolute motion displacement on the excerpt: 0.15mm (vs 0.65mm on the full run — expected, less time for drift). This is the **one** functional excerpt used consistently across every step of the public exercise.

### 9b. Defacing (T1w)

The public T1w (`site/data/anat/T1w.nii.gz`) is `fsl_deface`'s output, not the original. Verified three ways:
1. **Zero overlap** between defaced (zeroed) voxels and the BET brain mask (834,535 voxels zeroed, 0 inside the mask).
2. An independently-recomputed BET mask **on the defaced image** has **Dice = 0.983** against the mask computed on the original — confirms defacing doesn't perturb brain-tissue segmentation.
3. FNIRT was **fully recomputed on the defaced image** (not reused from the original) for the public warp field — direct comparison QC (`docs/qc/08_struct2mni_fnirt_defaced.png`) shows equivalent registration quality to the original-input run.

The non-defaced original stays in `derivatives/` (gitignored, local only). See `docs/qc/07_deface_verification.png` for the voxel-level comparison figure.

### 9c. DICOM conversion exercise: an architectural note

The Zenodo-sourced DICOMs (primary subject, §1–2) cannot be published raw (real PHI, §2) and were not re-anonymized for this purpose. The DICOM→NIfTI terminal exercise therefore uses a **different, separately-sourced dataset** — `datalad/example-dicom-functional` (PDDL, already anonymized by its original authors, verified clean across all 630 files, §2) — while the rest of the pipeline (BET onward) continues with the primary subject's already-converted, defaced/sanitized NIfTI. This is disclosed explicitly in the site's Data & Attribution tab and in the Step 1 workflow notes, rather than left implicit. No gap: a real, de-identified, verified DICOM series is included (`site/data/dicom/dicom_sample.zip`, 5.2 MB) and its conversion is exercised end-to-end (headers and pixel data both inspected — see §2 and the pixel-data visual check this session; no burned-in text, no facial structure in the EPI data).

### 9d. Parameter exploration precomputed (beyond the single slide example)

- **BET fractional intensity** on the T1 (anatomical branch): `-f 0.2, 0.4, 0.5, 0.8` all precomputed (brain image + mask each). Verified monotonic trend matching slide 6's claim: mask volume 1.69L → 1.56L → 1.51L → 1.08L as `-f` increases. `-f 0.4` is the canonical/default value (slide 7's example); the others are supported for direct comparison in the terminal + viewer.
- **Smoothing kernel**: both slide-34 example widths precomputed — 1mm FWHM (sigma 0.4247) and 5mm FWHM (sigma 2.1233, FEAT's default and this exercise's default).
- Any other parameter value is explicitly rejected by the terminal simulator with a message naming the supported set (never silently faked), per the brief's "parameter changes must produce the matching result or explain which values the exercise supports."

### 9e. Testing

Playwright (Chromium) was used for headed-less interactive testing, not just a static read: full pipeline run in order (all 7 terminal-relevant steps, each succeeding and chaining into the next via vfs file discovery), a missing-prerequisite case (applywarp before its inputs exist → specific rejection → succeeds after the dependency is produced), an unsupported-parameter case, a wrong-command-for-step case, reset/retry, and `help`/`ls`/`pwd`/`cd`/`history`. Run twice: once served from root (`/index.html`) and once from a simulated GitHub Pages project subpath (`/my-repo/index.html`), confirming all relative asset paths resolve correctly either way. Checked for horizontal overflow at 320/375/768/1280px on every tab — **two real responsive bugs were found and fixed** (flexbox `min-width:auto` overflow in the terminal input row and the viewer's asset `<select>`), and a **real logic bug was found and fixed**: revealed files were initially named after the internal asset ID rather than the filename the student actually typed as the command's output argument, which broke every downstream dependency check (even the canonical slide-example pipeline). Final state: 0 console errors, 0 failed requests, 0 layout overflows, full pipeline chain works end-to-end in both deployment configurations.

### 9f. Final public bundle size

**`site/data/`: ~93 MB total** (anat ~20MB, func ~61MB [30-volume excerpt, 4 stages], standard template ~1.7MB, DICOM sample zip 5.2MB, dcm2niix-converted sample ~2.7MB). `site/vendor/niivue/`: 2.2MB (loaded lazily, only when the Viewer tab is opened). Full `site/`: **~96 MB**.

### 9g. Known limitations / not yet done

- Deployment itself (gh-pages branch / Pages settings / custom domain) — explicitly deferred per the brief.
- The FSL-GUI simulator (as opposed to the command-line terminal) — explicitly deferred per the brief.
- The lecture PPTX stays out of `site/` (not published) but is still sitting at the project root, untracked by git; whether to commit it anywhere in the repo is a separate call for the course instructor (copyright/size), not made here.
- Niivue's exact API surface was used defensively (try/catch, console warnings) since it was integrated from training-time knowledge of its ~v0.6x API against the actual vendored v0.69.0; it was verified working end-to-end in this session's Playwright tests (single-volume, overlay, 4D time-slider, and comparison-toggle all render correctly), but any future Niivue upgrade should be smoke-tested the same way.
- No automated test suite is committed (the Playwright scripts used this session live in `.devtools/`, gitignored, dev-only). Re-running them requires `cd .devtools && npm install playwright && npx playwright install chromium` (already done locally this session).

## 10. Redesign around "Exercise 1 - Preprocessing.pdf" (this session)

The site was rebuilt from a different source of truth: not the Lesson 2
lecture slides (§1–9 above), but the actual homework PDF, "Exercise 1 -
Preprocessing" (5 pages, submitted by students, due 2026-05-11). This
session replaced the dataset entirely, restructured the workflow diagram
around the homework's 5 numbered stages, and changed how the terminal
simulator resolves file dependencies. `docs/simulation-files.md` has the
full technical audit; this section covers the *data* decisions and
verification.

### 10a. New dataset: a real matched pair, replacing the two-dataset design

§1–3 above describe a design where the main pipeline used a Zenodo-sourced
participant (raw DICOMs non-public, PHI-bearing) while a *separate*,
unrelated public-domain DICOM series powered only the DICOM→NIfTI demo — a
dead end feeding nothing downstream. This was a real limitation flagged
directly in `docs/simulation-files.md` §1 of that era.

This session replaced it with **one matched, fully public pair**:

- **Source**: `sub-01`, published by its creator at
  [github.com/dfsp-spirit/sub-01](https://github.com/dfsp-spirit/sub-01),
  backed by a Zenodo record: *MR scans of a human, adult brain at 3T in BIDS
  format. Includes DICOMS, preprocessed output of FreeSurfer, fmriprep and
  qsirecon*, doi:[10.5281/zenodo.22697454](https://doi.org/10.5281/zenodo.22697454).
- **License**: **CC0 1.0** (public domain dedication) — confirmed both via the
  repository's `LICENSE` file and GitHub's own license metadata API
  (`spdx_id: CC0-1.0`). No restriction, no attribution required; we credit it
  anyway.
- **Same participant, same session**: both series used (T1w = DICOM series
  `0002`, BOLD = series `0005`) share one DICOM `StudyInstanceUID` — a direct,
  file-level fact, checked against the downloaded files, the same standard
  this project has used throughout (see §3 above for the prior dataset's
  equivalent check).
- **De-identification**: already anonymized by the publisher with
  `dicom-anonymizer` before release. Checked across sample files from both
  series (not assumed from the README): `PatientName`/`PatientID` literally
  read `ANONYMIZED`, `PatientBirthDate`/`StudyDate` are reset to
  `00010101`/`000000`, and `InstitutionName`, `ReferringPhysicianName`,
  `OperatorsName`, `StationName`, and `DeviceSerialNumber` are all empty.
  Equal to or cleaner than the PDDL-licensed source used in §2's audit.
- **Pinned**: branch `main` of the GitHub repo, files fetched individually by
  exact path (`raw/sub-01/0002_MR0000NN.dcm`, `raw/sub-01/0005_MR0000NN.dcm`);
  the Zenodo DOI above is the permanent, versioned backing record.

As before, the T1w pixel data (not header fields) can still support facial
reconstruction, so it was **defaced** with `fsl_deface` before publishing,
verified the same way as the previous dataset: zero overlap between the
zeroed voxels and the BET brain mask (541,781 voxels zeroed, 0 inside the
mask). The non-defaced original is not published.

### 10b. Full-resolution, full-length series — no excerpt this time

Unlike the previous dataset (where a 196-volume run was trimmed to a
30-volume excerpt to control bundle size), this BOLD series is used **in
full**: all 240 volumes, every stage. At this dataset's native resolution
(70×64×37, 3mm) the full run is small enough (45 MB raw) that trimming
wasn't necessary — the public bundle, including both full-size downloadable
DICOM archives, is described in §10f.

### 10c. Pipeline, run locally (FSL 6.0.7.13), matching the homework's exact stage order

See `scripts/05_run_pipeline_sub01.sh` for the literal commands. Two FSL
behaviors were verified empirically against the installed version rather than
assumed from documentation — both described in full in
`docs/simulation-files.md` §6, summarized here:

- `mcflirt -refvol` is 0-indexed (confirmed via its own `--help` text), so the
  homework's literal `-refvol 1` would select the *second* volume, not "the
  first" as the homework's own prose describes this run. **Update (latest
  session):** the site now runs `-refvol 0` instead, which is the flag that
  actually produces "the first volume" — matching the homework's stated
  intent rather than its literal flag text, with the discrepancy called out
  explicitly in the step's `slideNote` rather than silently picking one over
  the other.
- `bet`/`flirt` given a 4D input without a 4D-aware flag **silently truncate
  to the first volume** (confirmed via the actual deprecation warning FSL
  prints), not an average and not all volumes. This is why the functional BET
  stage is three explicit commands (extract first volume → BET it → apply the
  mask back to the full 4D with `fslmaths -mas`) rather than the homework's
  single-line `bet <4D> <out> -m` — run literally, that single line would
  silently produce a 3D result, not the 4D series Stage 4 needs. The
  intermediate is shown, not hidden.

Both MCFLIRT runs (default middle-volume, and `-refvol 0`, the true first
volume) were actually computed; both are shipped. All four T1w BET fractional-intensity variants
(`0.2, 0.4, 0.5, 0.8`) were computed with full brain-intensity images, not
masks only — the first audit's finding that three of these were missing from
the deployed bundle does not recur (re-verified this session, §10e).

### 10d. Storage format

`fslmaths -mas` (applying the functional brain mask to the full 4D series)
defaults to float32 output, same as the earlier-documented `fslmaths`
smoothing gotcha (§6a): the masked 4D series came out float32 until `-odt
short` was added, which brought it back to int16 matching the input
(22.6 MB vs. a larger float32 equivalent). Both this step and the smoothing
step use `-odt short` in the shipped pipeline, for the same reasons
quantified in §6a.

### 10e. Verification performed this session

- Confirmed all 432 downloaded DICOM files parse as valid DICOM (0 failures).
- Confirmed `dcm2niix` converts both series to sane dimensions matching the
  source README (T1w: 256×256×192; BOLD: 70×64×37×240, TR=2.0s).
- Re-verified the deface/BET-mask zero-overlap check on the new T1w.
- Re-ran the full-chain Playwright test suite (see `docs/simulation-files.md`
  §5) against both a root-path deployment and a simulated GitHub Pages
  project subpath: 0 console errors, 0 failed requests, 0 layout-overflow
  regressions at 320/375/768/1280px, in both configurations.
- Scripted audit: every `ASSET_MAP` URL in the new `terminal-config.js`
  resolves to a real file in `site/data/` (0 missing — the opposite of the
  first audit's finding), and every file under `site/data/` is referenced by
  something (0 orphans).

### 10f. Public bundle size (this redesign)

| Component | Size |
|---|---|
| `site/data/anat/` | 26 MB |
| `site/data/func/` | 337 MB (full 240-volume series at every stage, including both MCFLIRT runs and both normalized/smoothed outputs) |
| `site/data/standard/` | 1.7 MB |
| `site/data/dicom/` (both real, downloadable DICOM archives) | 64 MB |
| **Total `site/data/`** | **~429 MB** |

Larger than the previous bundle (~93 MB) because this one carries the full
240-volume series through every stage instead of a 30-volume excerpt, plus
two real downloadable DICOM archives that didn't exist in the previous
design. Still well within GitHub Pages' practical limits (no individual file
near the 100 MB hard cap; total repo size is a soft concern, not a hard one,
for a repo this size).

### 10g. Remaining differences from the homework

- The homework uses **3 participants**; this exercise uses **1** (data-volume
  tradeoff for a public teaching bundle — using 3 full real participants
  would roughly triple §10f's total).
- Smoothing at 3mm/7mm FWHM is presented as a calculation exercise (Question
  5's own framing), not a third precomputed, interactive pipeline branch.
- The homework's FEAT-GUI/MRIcroGL-drag-and-drop routes are not modeled —
  only the command-line route, which the homework itself documents as
  equivalent.
- `--iout` on FNIRT (used here so the Viewer has something to show for
  registration-quality comparison) is not in the homework's own FNIRT
  command; it only appears if a student adds it themselves in this exercise,
  exactly mirroring that it's optional in real FSL too.

## 11. Latest session: -refvol 0 regeneration, collapsed DICOM listings, deployment

- **MCFLIRT comparison run switched from `-refvol 1` to `-refvol 0`.**
  Previously the site ran the homework's literal `-refvol 1` and documented
  (§10c) that this is actually the second volume, not the first, due to
  0-indexing. This session re-ran MCFLIRT for real
  (`mcflirt -in BOLD.nii.gz -out BOLD_mcf_refvol0.nii.gz -refvol 0 -plots`,
  FSL 6.0.7.13, ~29s) to produce a run that actually aligns to the first
  acquired volume, matching the homework's stated intent. The old
  `BOLD_mcf_refvol1.*` derivative and public asset were deleted, not kept
  alongside the new one. `scripts/05_run_pipeline_sub01.sh`,
  `scripts/03_build_public_bundle.sh`, `site/js/{workflow-data,terminal-config,
  filesystem}.js`, and `docs/simulation-files.md` were all updated together so
  there is exactly one comparison run, consistently named and described.
- **`ls` on a large directory (the real 192/240-file DICOM folders) now
  collapses by default.** Previously `ls T1w_dicom`/`ls BOLD_dicom` printed
  every filename as one flat wall of text. Directory listings over 20 entries
  now render as a closed `<details>` block (entry count + first/last filename
  in the summary line) that expands on click — implemented generically in
  `terminal.js`'s `ls` builtin by entry count, not hardcoded to the DICOM
  folders specifically, so it also protects against any future large
  directory.
- **Deployed to GitHub Pages this session** — see the repository's own commit
  history and GitHub Pages settings for the live URL and deployed commit SHA
  (not duplicated here since both change on every future deploy).
