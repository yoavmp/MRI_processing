// Workflow step definitions for the MRI preprocessing teaching site.
// Restructured around "Exercise 1 - Preprocessing.pdf" (the homework itself),
// which is the source of truth for command shape, option defaults, and the
// 5 numbered stages. Where a value is our addition rather than literally in
// the homework text, that is flagged explicitly in `slideNote`.
//
// Layout fields used by app.js's diagram renderer:
//   stage: 1-5 (homework stage number, drives the stage header)
//   stageTitle: header text shown once per stage
//   order: global row sequence
//   layout: "pair" (anat left / func right, same row) | "anat-only" | "func-only" | "full" (cross-branch)

const WORKFLOW_STEPS = [
  // ---------------- Stage 1: DICOM -> NIfTI ----------------
  {
    id: "dcm2niix_t1w",
    stage: 1,
    stageTitle: "Stage 1 — DICOM → NIfTI",
    order: 1,
    layout: "pair",
    branch: "anat",
    title: "T1w: DICOM → NIfTI",
    short: "dcm2niix (T1w)",
    purpose: "Convert the T1w DICOM series into a single NIfTI image plus a JSON metadata sidecar.",
    rationale:
      "The homework has students drag the DICOM folder onto dcm2niix (or run it from a terminal) for each modality separately, in its own folder, one at a time (“Do not drag more than one folder... It will corrupt the final .nii file”). We follow the same one-series-at-a-time shape here with the command-line form of dcm2niix.",
    inputs: ["T1w_dicom/ — 192 real DICOM files, one 3D MPRAGE series"],
    outputs: ["<name>.nii.gz — the image (256×256×192, 1mm isotropic)", "<name>.json — scan metadata"],
    command: "dcm2niix -z y -b y -f T1w -o . T1w_dicom",
    slideNote:
      "The homework's own tool is the MRIcroGL drag-and-drop GUI wrapper around dcm2niix; we use dcm2niix directly from the command line, which is the same underlying conversion (the homework itself mentions this is an equivalent route on lab machines without MRIcroGL).",
    inspect: [
      "Homework Question 1 asks for the dimensions and resolution of every modality — open this file in the Viewer or check its JSON sidecar to answer it.",
      "T1w should be close to isotropic (roughly equal voxel size in all three directions) — typical for a structural scan meant for segmentation/registration.",
    ],
  },
  {
    id: "dcm2niix_bold",
    stage: 1,
    order: 1,
    layout: "pair",
    branch: "func",
    title: "fMRI: DICOM → NIfTI",
    short: "dcm2niix (BOLD)",
    purpose: "Convert the BOLD fMRI DICOM series into a single 4D NIfTI image plus a JSON metadata sidecar.",
    rationale:
      "Same conversion, same participant, same scan session — the functional series, converted on its own exactly like the T1w was.",
    inputs: ["BOLD_dicom/ — 240 real DICOM files, one 2D EPI BOLD time series"],
    outputs: ["<name>.nii.gz — the 4D image (70×64×37×240, 3mm)", "<name>.json — scan metadata (TR, TE, …)"],
    command: "dcm2niix -z y -b y -f BOLD -o . BOLD_dicom",
    inspect: [
      "This is a 4D file — the 4th dimension (240) is the number of volumes/timepoints, not a spatial dimension.",
      "Check the JSON for RepetitionTime (TR) — needed to read the motion-parameter time axis later and to answer Question 1.",
    ],
  },

  // ---------------- Stage 2: Motion correction (func only) ----------------
  {
    id: "mcflirt",
    stage: 2,
    stageTitle: "Stage 2 — Motion correction",
    order: 2,
    layout: "func-only",
    branch: "func",
    title: "Motion Correction (MCFLIRT)",
    short: "mcflirt",
    purpose: "Register every 3D volume of the 4D BOLD series to one reference volume (rigid body, 6 DOF), correcting for small head movements over the ~8-minute scan.",
    rationale:
      "An fMRI run is acquired as many 3D volumes over time; even sub-voxel head movement between volumes can masquerade as signal change. The homework asks for this twice: once with mcflirt's default reference (the middle volume), and once aligned to the first volume instead.",
    inputs: ["BOLD.nii.gz (Stage 1 output, 240 volumes)"],
    outputs: ["<name>_mcf.nii.gz — motion-corrected 4D image", "<name>_mcf.par — 6 parameters/volume (3 rotations, radians; 3 translations, mm), with -plots"],
    command: "mcflirt -in BOLD.nii.gz -out BOLD_mcf.nii.gz -plots",
    slideNote:
      "Run both forms — see the Terminal for the second (-refvol 0). We verified -refvol's indexing directly against the installed FSL 6.0.7.13's own --help text: “-refvol <number> (default is no_vols/2) — registers to the (n+1)th volume in series.” It is 0-indexed, so -refvol 0 is what actually selects the first volume. The homework's own prose describes this run as aligning “to the first volume instead of the middle volume” but gives the literal flag -refvol 1 — that flag would actually select the <em>second</em> volume (index 1). We use -refvol 0 here to match the homework's stated intent rather than its literal flag, and say so explicitly rather than silently following either one without comment.",
    paramHelp:
      "Default run — no -refvol — registers to the middle volume (index 120 of 0–239, since the default is no_vols/2). This is the run the rest of the exercise continues from. -refvol 0 registers to the first volume instead — precomputed for Question 2b's comparison, but it's a dead end here: nothing downstream accepts it as input.",
    supportedParams: { refvol: ["default", "0"] },
    inspect: [
      "Question 2a: plot the motion parameters — look at the 3 rotations and 3 translations separately (different units/scales).",
      "Question 2b: plot the -refvol 0 run's parameters and compare — both are in the Viewer's motion-plot panel once revealed.",
    ],
  },

  // ---------------- Stage 3: BET (both modalities) ----------------
  {
    id: "bet_t1w",
    stage: 3,
    stageTitle: "Stage 3 — BET (brain extraction)",
    order: 3,
    layout: "pair",
    branch: "anat",
    title: "T1w Brain Extraction (BET)",
    short: "bet (T1w)",
    purpose: "Remove skull, scalp and non-brain tissue from the T1w image.",
    rationale: "Registration and later analysis should only care about brain tissue — non-brain voxels left in can distort both.",
    inputs: ["T1w.nii.gz (Stage 1 output)"],
    outputs: ["<name>_brain.nii.gz — brain-only image", "<name>_brain_mask.nii.gz — binary mask, with -m"],
    command: "bet T1w.nii.gz T1w_brain.nii.gz -f 0.5 -m",
    slideNote:
      "-f 0.5 is not a value we chose — it's FSL's and the homework's actual documented default (“You don't have to insert a fractional intensity threshold - the default threshold will be 0.5”), confirmed against the installed bet's own --help. -f 0.4 is kept here as a labeled comparison value (it was the <em>other</em> course's slide example, not this homework's). -R (robust centre estimation) is <strong>not</strong> in the homework's command — we added it ourselves as cheap insurance against a bad initial centre-of-gravity guess; it doesn't change what -f means.",
    paramHelp: "Try -f 0.2, 0.4, 0.5 (default/designated) or 0.8 — all four are precomputed. Only 0.5's result feeds the rest of the exercise; the others are real, comparable, but comparison-only.",
    supportedParams: { f: ["0.2", "0.4", "0.5", "0.8"] },
    inspect: [
      "Question 3 asks for the best fractional intensity threshold for participant 3's T1w, with pre- and post-BET images in the report — compare the four variants here the same way.",
    ],
  },
  {
    id: "bet_func",
    stage: 3,
    order: 3,
    layout: "pair",
    branch: "func",
    title: "fMRI Brain Extraction (BET)",
    short: "bet (fMRI)",
    purpose: "Remove skull/non-brain signal from the motion-corrected BOLD series, producing a brain-extracted 4D series (not a single 3D volume) plus a mask.",
    rationale:
      "The homework says to BET “all T1w and fMRI images,” using the _mcf data for 4D input. In practice, FSL's own bet (confirmed on the installed 6.0.7.13) truncates a 4D input to its first volume with a deprecation warning rather than processing all 240 volumes — it does not average or apply itself back across time. To get a genuine brain-extracted 4D series (what Stage 4 actually needs), we extract the first volume of the designated motion-corrected run, BET that single volume for its mask, and then explicitly apply that mask to all 240 volumes with fslmaths -mas. Both steps are shown below, not hidden.",
    inputs: ["BOLD_mcf.nii.gz (Stage 2 designated/default run, 240 volumes)"],
    outputs: [
      "BOLD_mcf_vol0.nii.gz — first volume only (fslroi), the representative 3D image BET actually works on",
      "<name>_brain.nii.gz / _brain_mask.nii.gz — BET's 3D output on that volume",
      "BOLD_mcf_brain.nii.gz — the mask applied back to the full 4D series (fslmaths -mas) — this is what Stage 4 uses",
    ],
    command: "fslroi BOLD_mcf.nii.gz BOLD_mcf_vol0.nii.gz 0 1\nbet BOLD_mcf_vol0.nii.gz BOLD_mcf_vol0_brain.nii.gz -f 0.5 -m\nfslmaths BOLD_mcf.nii.gz -mas BOLD_mcf_vol0_brain_mask.nii.gz BOLD_mcf_brain.nii.gz",
    slideNote:
      "The 3-command shape (extract one volume → BET it → mask the full 4D) is our addition — the homework's own command is just “bet <input> <output> -m -f <threshold>” on the _mcf file directly. We verified on the installed FSL that running it exactly as written would silently truncate to one 3D volume (with a warning), not produce the 4D result the homework describes using in Stage 4 (“your_input_fMRI_data_after_BET”, applied through applywarp as a 4D series). This sequence produces that real 4D result and shows the intermediate explicitly instead of hiding it behind a silent truncation.",
    paramHelp: "-f 0.5 (homework default) is designated; -f 0.3 is precomputed as a labeled comparison (not applied to the 4D series).",
    supportedParams: { f: ["0.3", "0.5"] },
    inspect: ["Check the mask covers the functional brain reasonably — much lower resolution than the T1w, expect a blockier mask."],
  },

  // ---------------- Stage 4: Registration and normalization ----------------
  {
    id: "flirt_func2struct",
    stage: 4,
    stageTitle: "Stage 4 — Registration and normalization",
    order: 4,
    layout: "full",
    branch: "join",
    title: "fMRI → T1w (FLIRT)",
    short: "flirt (func→struct)",
    purpose: "Linearly register the functional data to this participant's own T1w — the first cross-branch step.",
    rationale: "The homework performs this first, before any normalization to MNI: “First, we would like to perform linear registration between the structural image (T1w) and the functional image (fMRI).”",
    inputs: ["BOLD_mcf_brain.nii.gz (Stage 3, post-BET 4D fMRI)", "T1w_brain.nii.gz (Stage 3, post-BET T1w — the reference)"],
    outputs: ["functional2struct.mat — affine matrix, used in Stage 4's last step"],
    command: "flirt -in BOLD_mcf_brain.nii.gz -ref T1w_brain.nii.gz -omat functional2struct.mat",
    slideNote:
      "The homework's -in is the full post-BET 4D fMRI file, exactly as given here. FLIRT itself (confirmed on the installed FSL) only ever uses the <em>first</em> volume of a 4D -in — it truncates with the same deprecation warning as bet, silently. Since Stage 2's motion correction already brought every volume into one common frame, that single first-volume alignment is representative of the whole already-aligned 4D series, which is exactly why applying this one matrix to all 240 volumes later (via applywarp) is valid. The precomputed result here is numerically what FLIRT would silently produce from the full 4D file.",
    inspect: ["Overlay the registered functional's brain edges on the T1w — they should trace the cortical ribbon with no visible offset."],
  },
  {
    id: "flirt_struct2mni",
    stage: 4,
    order: 5,
    layout: "anat-only",
    branch: "anat",
    title: "T1w → MNI (FLIRT)",
    short: "flirt (struct→MNI)",
    purpose: "Linearly register the post-BET T1w to the MNI152 brain template.",
    rationale: "“Next, we will perform linear and non-linear registration, from the participant T1w image to a template T1w image in MNI space” — FLIRT always runs before FNIRT, giving the nonlinear step a good starting point.",
    inputs: ["T1w_brain.nii.gz (Stage 3, post-BET)", "MNI152_T1_2mm_brain.nii.gz (reference, ships with FSL)"],
    outputs: ["struct2standard.mat — affine matrix, used by FNIRT next"],
    command: "flirt -in T1w_brain.nii.gz -ref MNI152_T1_2mm_brain.nii.gz -omat struct2standard.mat",
    inspect: ["Sanity-check the matrix: a 4×4 with last row 0 0 0 1."],
  },
  {
    id: "fnirt_struct2mni",
    stage: 4,
    order: 6,
    layout: "anat-only",
    branch: "anat",
    title: "T1w → MNI (FNIRT)",
    short: "fnirt",
    purpose: "Refine the linear alignment with a nonlinear warp field, so individual gyri/sulci — not just overall position and size — line up with the template.",
    rationale: "“Run fnirt on the pre-BET images”, initialized from the FLIRT affine. FNIRT needs the full head (not brain-extracted) for both the moving image and the reference, per the homework.",
    inputs: ["T1w.nii.gz (Stage 1 output — full head, pre-BET)", "MNI152_T1_2mm.nii.gz (reference, full head)", "struct2standard.mat (initialization)"],
    outputs: ["warp_struct2standard.nii.gz — the warp field, used by applywarp next"],
    command: "fnirt --in=T1w.nii.gz --ref=MNI152_T1_2mm.nii.gz --aff=struct2standard.mat --cout=warp_struct2standard",
    slideNote:
      "This takes 20–30 minutes on real hardware — simulated here. Add --iout=<name> if you also want a resampled-T1-in-MNI-space preview image for Question 4's alignment check; the homework's own command doesn't include it, so it isn't produced unless you ask for it.",
    inspect: ["Overlay the warped T1 on the MNI template once --iout is used: cortical folding and ventricle outlines should track the template closely."],
  },
  {
    id: "applywarp",
    stage: 4,
    order: 7,
    layout: "full",
    branch: "join",
    title: "Apply warp to fMRI (applywarp)",
    short: "applywarp",
    purpose: "Resample the post-BET 4D fMRI series into MNI standard space, combining both registrations (func→struct and struct→MNI) in one pass.",
    rationale: "“Now, we can apply all transformations to our original image and receive the fMRI image in standard space.”",
    inputs: [
      "BOLD_mcf_brain.nii.gz (Stage 3, post-BET 4D fMRI — all 240 volumes)",
      "MNI152_T1_2mm_brain.nii.gz (reference grid)",
      "functional2struct.mat (--premat)",
      "warp_struct2standard.nii.gz (--warp)",
    ],
    outputs: ["BOLD_mni.nii.gz — normalized 4D BOLD, 91×109×91 @ 2mm, all 240 volumes"],
    command: "applywarp -i BOLD_mcf_brain.nii.gz -r MNI152_T1_2mm_brain.nii.gz -o BOLD_mni.nii.gz --premat=functional2struct.mat --warp=warp_struct2standard.nii.gz",
    inspect: [
      "Question 4: compare two participants' final images in the Viewer — here, compare before/after this step on the one participant this exercise uses.",
      "This is where the anatomical and functional branches are fully joined into one space, and the full 4D series (not a single volume) carries through.",
    ],
  },

  // ---------------- Stage 5: Smoothing (func only) ----------------
  {
    id: "smoothing",
    stage: 5,
    stageTitle: "Stage 5 — Smoothing",
    order: 8,
    layout: "func-only",
    branch: "func",
    title: "Smoothing (fslmaths)",
    short: "fslmaths",
    purpose: "Blur the normalized fMRI data with a 3D Gaussian kernel, trading spatial precision for signal-to-noise.",
    rationale: "“We will perform the FSL standard smoothing of 5mm FWHM.”",
    inputs: ["BOLD_mni.nii.gz (Stage 4 output)"],
    outputs: ["<name>.nii.gz — smoothed 4D BOLD"],
    command: "fslmaths BOLD_mni.nii.gz -kernel gauss 2.1233 -fmean BOLD_mni_smooth5mm.nii.gz",
    slideNote:
      "sigma = FWHM / 2.3548; the homework gives 2.1233 for 5mm directly. Question 5 then asks what sigma you'd use for 3mm and 7mm — that's a calculation to do by hand (3mm → 1.2739, 7mm → 2.9726), not something this exercise precomputes, since the homework itself frames it as arithmetic practice rather than another run. -odt short is our addition, not the homework's — see the Notes panel for why.",
    paramHelp: "Only sigma 2.1233 (5mm FWHM) is precomputed, matching the homework's one required run.",
    supportedParams: { sigma: ["2.1233"] },
    inspect: ["This is the last step — compare a slice before/after: fine detail should visibly soften. Ready for statistical analysis."],
  },
];

const BRANCH_LABELS = {
  anat: "T1w / Anatomical",
  func: "fMRI / Functional",
  join: "Cross-branch (both inputs)",
};
