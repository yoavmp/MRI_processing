// Wires workflow steps to the simulated filesystem: which binary each step
// expects, what role its inputs/outputs carry, and where the real
// precomputed asset lives once a command "succeeds".

const DATA = "data"; // relative to site root

// ---- real DICOM series metadata (from dfsp-spirit/sub-01, CC0) ------------
// Filenames match the real archive exactly (site/data/dicom/*.zip).
function dicomNames(prefix, start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(`${prefix}_MR${String(i).padStart(6, "0")}.dcm`);
  return out;
}
const T1W_DICOM_FILES = dicomNames("0002", 4, 195); // 192 files
const BOLD_DICOM_FILES = dicomNames("0005", 580, 819); // 240 files

const T1W_SERIES = { fileCount: 192, dims: "256x256x192x1", convertSeconds: "2.4" };
const BOLD_SERIES = { fileCount: 240, dims: "70x64x37x240", convertSeconds: "6.2" };

// ---- asset registry ---------------------------------------------------
const ASSET_MAP = {
  t1w_nifti: { url: `${DATA}/anat/T1w.nii.gz`, label: "T1w.nii.gz", dims: "256×256×192, 1mm isotropic", kind: "nifti", siblingJson: "t1w_json" },
  t1w_json: { url: `${DATA}/anat/T1w.json`, label: "T1w.json", kind: "json" },
  bold_nifti: { url: `${DATA}/func/BOLD.nii.gz`, label: "BOLD.nii.gz", dims: "70×64×37×240, 3mm, TR=2.0s", kind: "nifti4d", siblingJson: "bold_json" },
  bold_json: { url: `${DATA}/func/BOLD.json`, label: "BOLD.json", kind: "json" },

  mni_head: { url: `${DATA}/standard/MNI152_T1_2mm.nii.gz`, label: "MNI152_T1_2mm.nii.gz", dims: "91×109×91 @ 2mm", kind: "nifti" },
  mni_brain: { url: `${DATA}/standard/MNI152_T1_2mm_brain.nii.gz`, label: "MNI152_T1_2mm_brain.nii.gz", dims: "91×109×91 @ 2mm", kind: "nifti" },

  "bet_brain_f0.2": { url: `${DATA}/anat/T1w_brain_f0.2.nii.gz`, label: "T1w_brain.nii.gz (f=0.2)", dims: "256×256×192", kind: "nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.2.png` },
  "bet_mask_f0.2": { url: `${DATA}/anat/T1w_brain_f0.2_mask.nii.gz`, label: "T1w_brain_mask.nii.gz (f=0.2)", dims: "256×256×192", kind: "mask", overlayBase: "t1w_nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.2.png` },
  "bet_brain_f0.4": { url: `${DATA}/anat/T1w_brain_f0.4.nii.gz`, label: "T1w_brain.nii.gz (f=0.4)", dims: "256×256×192", kind: "nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.4.png` },
  "bet_mask_f0.4": { url: `${DATA}/anat/T1w_brain_f0.4_mask.nii.gz`, label: "T1w_brain_mask.nii.gz (f=0.4)", dims: "256×256×192", kind: "mask", overlayBase: "t1w_nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.4.png` },
  "bet_brain_f0.5": { url: `${DATA}/anat/T1w_brain_f0.5.nii.gz`, label: "T1w_brain.nii.gz (f=0.5, designated)", dims: "256×256×192", kind: "nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.5.png` },
  "bet_mask_f0.5": { url: `${DATA}/anat/T1w_brain_f0.5_mask.nii.gz`, label: "T1w_brain_mask.nii.gz (f=0.5, designated)", dims: "256×256×192", kind: "mask", overlayBase: "t1w_nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.5.png` },
  "bet_brain_f0.8": { url: `${DATA}/anat/T1w_brain_f0.8.nii.gz`, label: "T1w_brain.nii.gz (f=0.8)", dims: "256×256×192", kind: "nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.8.png` },
  "bet_mask_f0.8": { url: `${DATA}/anat/T1w_brain_f0.8_mask.nii.gz`, label: "T1w_brain_mask.nii.gz (f=0.8)", dims: "256×256×192", kind: "mask", overlayBase: "t1w_nifti", previewUrl: `${DATA}/previews/bet_t1w_f0.8.png` },

  mcf_4d_default: { url: `${DATA}/func/BOLD_mcf_default.nii.gz`, label: "BOLD_mcf.nii.gz (Default reference)", dims: "70×64×37×240", kind: "nifti4d" },
  mcf_par_default: { url: `${DATA}/func/BOLD_mcf_default.par`, label: "BOLD_mcf.par (Default reference)", kind: "par" },
  mcf_4d_refvol0: { url: `${DATA}/func/BOLD_mcf_refvol0.nii.gz`, label: "BOLD_mcf.nii.gz (First volume)", dims: "70×64×37×240", kind: "nifti4d" },
  mcf_par_refvol0: { url: `${DATA}/func/BOLD_mcf_refvol0.par`, label: "BOLD_mcf.par (First volume)", kind: "par" },

  bold_mcf_vol0: { url: `${DATA}/func/BOLD_mcf_vol0.nii.gz`, label: "BOLD_mcf_vol0.nii.gz (representative volume)", dims: "70×64×37", kind: "nifti" },
  "funcbet_brain_f0.3": { url: `${DATA}/func/BOLD_mcf_vol0_brain_f0.3.nii.gz`, label: "BOLD_mcf_vol0_brain.nii.gz (f=0.3)", dims: "70×64×37", kind: "nifti", previewUrl: `${DATA}/previews/bet_func_f0.3.png` },
  "funcbet_mask_f0.3": { url: `${DATA}/func/BOLD_mcf_vol0_brain_f0.3_mask.nii.gz`, label: "BOLD_mcf_vol0_brain_mask.nii.gz (f=0.3)", dims: "70×64×37", kind: "mask", overlayBase: "bold_mcf_vol0", previewUrl: `${DATA}/previews/bet_func_f0.3.png` },
  "funcbet_brain_f0.5": { url: `${DATA}/func/BOLD_mcf_vol0_brain_f0.5.nii.gz`, label: "BOLD_mcf_vol0_brain.nii.gz (f=0.5, designated)", dims: "70×64×37", kind: "nifti", previewUrl: `${DATA}/previews/bet_func_f0.5.png` },
  "funcbet_mask_f0.5": { url: `${DATA}/func/BOLD_mcf_vol0_brain_f0.5_mask.nii.gz`, label: "BOLD_mcf_vol0_brain_mask.nii.gz (f=0.5, designated)", dims: "70×64×37", kind: "mask", overlayBase: "bold_mcf_vol0", previewUrl: `${DATA}/previews/bet_func_f0.5.png` },
  bold_brain_4d: { url: `${DATA}/func/BOLD_mcf_brain4d_f0.5.nii.gz`, label: "BOLD_mcf_brain.nii.gz (full 4D, masked)", dims: "70×64×37×240", kind: "nifti4d" },

  func2struct_mat: { url: `${DATA}/func/func2struct.mat`, label: "functional2struct.mat", kind: "mat", previewUrl: `${DATA}/previews/align_func2struct.png`, previewCaption: "Functional brain (hot colormap) resampled into T1w space using this matrix, overlaid on the post-BET T1w." },
  struct2standard_mat: { url: `${DATA}/anat/struct2standard.mat`, label: "struct2standard.mat", kind: "mat" },

  struct2standard_warp: { url: `${DATA}/anat/warp_struct2standard.nii.gz`, label: "warp_struct2standard.nii.gz", dims: "warp field (spline coefficients)", kind: "warp" },
  struct2standard_fnirt_result: { url: `${DATA}/anat/struct2standard_fnirt.nii.gz`, label: "T1 resampled into MNI space (--iout)", dims: "91×109×91 @ 2mm", kind: "nifti", overlayBase: "mni_brain", previewUrl: `${DATA}/previews/align_struct2standard.png` },

  bold_mni: { url: `${DATA}/func/BOLD_mni.nii.gz`, label: "BOLD_mni.nii.gz", dims: "91×109×91×240 @ 2mm (MNI grid)", kind: "nifti4d", previewUrl: `${DATA}/previews/smooth_before.png` },
  bold_smooth5mm: { url: `${DATA}/func/BOLD_mni_smooth5mm.nii.gz`, label: "BOLD_mni_smooth5mm.nii.gz", dims: "91×109×91×240 @ 2mm", kind: "nifti4d", previewUrl: `${DATA}/previews/smooth_after.png` },
};

// ---- static previews for the Viewer's no-WebGL2 fallback -----------------
// Each entry maps an asset id to a plain-language "what to look for" prompt
// shown next to its static preview image. Images themselves are precomputed
// (fsleyes render, headless) from these exact shipped files — see
// scripts/06_build_previews.sh.
const PREVIEW_PROMPTS = {
  "bet_brain_f0.2": "As -f increases the brain outline should shrink inward. At 0.2 expect extra non-brain tissue (skull/dura) left in.",
  "bet_mask_f0.2": "As -f increases the brain outline should shrink inward. At 0.2 expect extra non-brain tissue (skull/dura) left in.",
  "bet_brain_f0.4": "A middle-ground threshold — compare its outline against 0.2 and 0.8 to see the trend.",
  "bet_mask_f0.4": "A middle-ground threshold — compare its outline against 0.2 and 0.8 to see the trend.",
  "bet_brain_f0.5": "The homework's default. The red mask should hug the cortical surface without visible skull or major brain tissue cut away.",
  "bet_mask_f0.5": "The homework's default. The red mask should hug the cortical surface without visible skull or major brain tissue cut away.",
  "bet_brain_f0.8": "As -f increases expect the mask to shrink — at 0.8 look for real cortex being cut away, especially at the brain's surface.",
  "bet_mask_f0.8": "As -f increases expect the mask to shrink — at 0.8 look for real cortex being cut away, especially at the brain's surface.",
  "funcbet_brain_f0.3": "Lower resolution than the T1w — expect a blockier mask. It should still cover the whole functional brain without major gaps.",
  "funcbet_mask_f0.3": "Lower resolution than the T1w — expect a blockier mask. It should still cover the whole functional brain without major gaps.",
  "funcbet_brain_f0.5": "The designated run. Check the mask covers the whole functional brain without major gaps.",
  "funcbet_mask_f0.5": "The designated run. Check the mask covers the whole functional brain without major gaps.",
  func2struct_mat: "The hot-colormap functional brain should sit inside the grayscale T1w brain outline, tracking the same overall shape and position.",
  struct2standard_fnirt_result: "The warped T1's cortical folding and ventricle outlines should track the MNI template closely, especially near the brain's surface.",
  bold_mni: "This is the un-smoothed input — fine, grainy detail should be clearly visible slice to slice.",
  bold_smooth5mm: "Compare against the un-smoothed version: fine detail should visibly soften while the overall brain shape is unchanged.",
};

// "What to look for" prompts for the quick-comparison buttons and the
// multi-way BET/motion comparisons, keyed by the same "a,b" pair string
// used in each button's data-pair attribute (or a fixed key for the
// non-pair comparisons).
const COMPARISON_PROMPTS = {
  "bold_nifti,mcf_4d_default": "Step through the time-volume slider on both: the raw series should show small frame-to-frame jitter in the brain's position; the motion-corrected series should look steadier, volume to volume.",
  "bold_mni,bold_smooth5mm": "Fine-grained, grainy texture should visibly soften after smoothing while the overall brain shape and position stay the same.",
  "mni_brain,struct2standard_fnirt_result": "Check that the cortical outline and ventricles of the warped T1 (second volume) track the MNI template (first volume) closely, especially near the brain's surface.",
  motionCompare: "Both runs should show the same overall motion trend, but the first-volume run's curves are offset relative to the default (middle-volume) run's — because they're each measuring displacement from a different reference point.",
  betCompare: "As -f increases, the brain outline should shrink inward. Too high cuts into real cortex; too low leaves skull/dura in. Compare all revealed thresholds to judge which is \"best\" for this T1w (Question 3).",
};

// ---- per-step terminal runtime -------------------------------------------
const STEP_RUNTIME = {
  dcm2niix_t1w: {
    commands: [{ binary: "dcm2niix", validator: "dcm2niix_t1w" }],
    task: "Convert the T1w DICOM series (192 files) into a NIfTI image + JSON sidecar.",
    dicomFolderName: "T1w_dicom",
    outputRole: "t1w-nifti",
    series: T1W_SERIES,
    hints: [
      "dcm2niix takes the DICOM folder as its last (positional) argument. Run 'ls' to see it.",
      "Add -z y to gzip-compress the output, and -b y to also write the JSON sidecar.",
      "Try: dcm2niix -z y -b y -f T1w -o . T1w_dicom",
    ],
  },
  dcm2niix_bold: {
    commands: [{ binary: "dcm2niix", validator: "dcm2niix_bold" }],
    task: "Convert the BOLD DICOM series (240 files) into a 4D NIfTI image + JSON sidecar.",
    dicomFolderName: "BOLD_dicom",
    outputRole: "bold-nifti",
    series: BOLD_SERIES,
    hints: [
      "Same shape as the T1w conversion, different folder.",
      "Add -z y -b y as before.",
      "Try: dcm2niix -z y -b y -f BOLD -o . BOLD_dicom",
    ],
  },
  mcflirt: {
    commands: [{ binary: "mcflirt", validator: "mcflirt" }],
    task: "Motion-correct the 240-volume BOLD series. Run it twice: once with the Default reference, once with the First volume as reference (Question 2).",
    expectedInputRole: "bold-nifti",
    outputRole: "bold-mcf-default",
    comparisonOutputRole: "bold-mcf-refvol0",
    hints: [
      "Syntax: mcflirt -in <file> -out <file> -plots [-refvol <n>]",
      "First run with no -refvol at all (the Default reference: the middle volume). Then run again with -refvol 0 and a different -out name, to align to the First volume instead.",
      "Try: mcflirt -in BOLD.nii.gz -out BOLD_mcf.nii.gz -plots\nmcflirt -in BOLD.nii.gz -out BOLD_mcf_refvol0.nii.gz -refvol 0 -plots",
    ],
  },
  bet_t1w: {
    commands: [{ binary: "bet", validator: "bet" }],
    task: "Brain-extract the T1w image. Homework default is -f 0.5 (omit -f entirely); try other values to compare.",
    expectedInputRole: "t1w-nifti",
    inputLabel: "T1w image",
    supportedParams: { f: ["0.2", "0.4", "0.5", "0.8"] },
    defaultParam: { f: "0.5" },
    designatedParam: "0.5",
    assetPrefix: "bet",
    outputRole: "t1w-brain",
    outputRoleLabel: "post-BET T1w",
    variantRole: "t1w-brain-variant",
    maskRole: "t1w-brain-mask",
    maskVariantRole: "t1w-brain-mask-variant",
    hints: [
      "Syntax: bet <input> <output> [-f <value>] [-m]. Leave -f out entirely to get the homework's default (0.5).",
      "Add -m to also get the binary mask.",
      "Try: bet T1w.nii.gz T1w_brain.nii.gz -m    (no -f — uses the 0.5 default)",
    ],
  },
  bet_func: {
    commands: [
      { binary: "fslroi", validator: "fslroi_vol0" },
      { binary: "bet", validator: "bet" },
      { binary: "fslmaths", validator: "fslmaths_mas", match: (t) => t.includes("-mas") },
    ],
    task: "Three commands: extract a representative volume, BET it, then apply that mask back to all 240 volumes.",
    // fslroi sub-step
    fslroiInputRole: "bold-mcf-default",
    fslroiInputComparisonRole: "bold-mcf-refvol0",
    fslroiOutputRole: "bold-mcf-vol0",
    // bet sub-step
    expectedInputRole: "bold-mcf-vol0",
    inputLabel: "representative volume (from fslroi)",
    supportedParams: { f: ["0.3", "0.5"] },
    defaultParam: { f: "0.5" },
    designatedParam: "0.5",
    assetPrefix: "funcbet",
    outputRole: "bold-brain-vol0",
    outputRoleLabel: "post-BET representative volume",
    variantRole: "bold-brain-vol0-variant",
    maskRole: "bold-brain-mask",
    maskVariantRole: "bold-brain-mask-variant",
    // fslmaths -mas sub-step (distinct field names — this step shares one
    // config object across three sub-commands with different input roles)
    masInputRole: "bold-mcf-default",
    masInputComparisonRole: "bold-mcf-refvol0",
    masMaskRole: "bold-brain-mask",
    masMaskComparisonRole: "bold-brain-mask-variant",
    masOutputRole: "bold-brain-4d",
    hints: [
      "Step 1: fslroi BOLD_mcf.nii.gz BOLD_mcf_vol0.nii.gz 0 1   (first volume only)",
      "Step 2: bet BOLD_mcf_vol0.nii.gz BOLD_mcf_vol0_brain.nii.gz -m   (default -f 0.5)",
      "Step 3: fslmaths BOLD_mcf.nii.gz -mas BOLD_mcf_vol0_brain_mask.nii.gz BOLD_mcf_brain.nii.gz",
    ],
  },
  flirt_func2struct: {
    commands: [{ binary: "flirt", validator: "flirt" }],
    task: "Rigidly register the post-BET 4D fMRI to the post-BET T1w.",
    expectedInputRole: "bold-brain-4d",
    inputLabel: "post-BET 4D fMRI",
    expectedRefRole: "t1w-brain",
    refLabel: "post-BET T1w",
    refComparisonRole: "t1w-brain-variant",
    revealId: "func2struct_mat",
    outputRole: "func2struct-mat",
    hints: [
      "Syntax: flirt -in <4D fMRI after BET> -ref <T1w after BET> -omat <name>",
      "No -dof needed here — FLIRT's default (12, affine) is what the homework uses for this step.",
      "Try: flirt -in BOLD_mcf_brain.nii.gz -ref T1w_brain.nii.gz -omat functional2struct.mat",
    ],
  },
  flirt_struct2mni: {
    commands: [{ binary: "flirt", validator: "flirt" }],
    task: "Linearly register the post-BET T1w to the MNI152 2mm brain template.",
    expectedInputRole: "t1w-brain",
    inputLabel: "post-BET T1w",
    inputComparisonRole: "t1w-brain-variant",
    expectedRefRole: "mni-brain",
    refLabel: "MNI152 brain template",
    revealId: "struct2standard_mat",
    outputRole: "struct2standard-mat",
    hints: [
      "Syntax: flirt -in <T1w after BET> -ref <MNI brain template> -omat <name>",
      "Reference is MNI152_T1_2mm_brain.nii.gz — it's already in the Files panel.",
      "Try: flirt -in T1w_brain.nii.gz -ref MNI152_T1_2mm_brain.nii.gz -omat struct2standard.mat",
    ],
  },
  fnirt_struct2mni: {
    commands: [{ binary: "fnirt", validator: "fnirt" }],
    task: "Nonlinearly refine the registration, using the full (not brain-extracted) T1w and MNI images.",
    expectedInputRole: "t1w-nifti",
    expectedRefRole: "mni-head",
    expectedAffRole: "struct2standard-mat",
    outputRole: "struct2standard-warp",
    hints: [
      "Syntax uses -- and =: fnirt --in=<full T1w> --ref=<full MNI> --aff=<struct2standard.mat> --cout=<name>",
      "--in and --ref are the FULL HEAD images here — not the BET outputs.",
      "Try: fnirt --in=T1w.nii.gz --ref=MNI152_T1_2mm.nii.gz --aff=struct2standard.mat --cout=warp_struct2standard",
    ],
  },
  applywarp: {
    commands: [{ binary: "applywarp", validator: "applywarp" }],
    task: "Combine both registrations and resample the full 240-volume post-BET fMRI into MNI space.",
    expectedInputRole: "bold-brain-4d",
    inputLabel: "post-BET 4D fMRI",
    expectedRefRole: "mni-brain",
    expectedPremat: "func2struct-mat",
    expectedWarp: "struct2standard-warp",
    outputRole: "bold-mni",
    hints: [
      "Syntax: applywarp -i <post-BET 4D fMRI> -r <MNI brain> -o <out> --premat=<func2struct.mat> --warp=<warp field>",
      "-i is the full 4D masked series from Stage 3, not a single volume.",
      "Try: applywarp -i BOLD_mcf_brain.nii.gz -r MNI152_T1_2mm_brain.nii.gz -o BOLD_mni.nii.gz --premat=functional2struct.mat --warp=warp_struct2standard.nii.gz",
    ],
  },
  smoothing: {
    commands: [{ binary: "fslmaths", validator: "fslmaths_smooth" }],
    task: "Gaussian-smooth the normalized BOLD data at the homework's required 5mm FWHM (sigma 2.1233).",
    expectedInputRole: "bold-mni",
    outputRole: "bold-smoothed",
    supportedParams: { sigma: ["2.1233"] },
    hints: [
      "Syntax: fslmaths <in> -kernel gauss 2.1233 -fmean <out>",
      "2.1233 is given directly by the homework for 5mm FWHM — no need to derive it here.",
      "Try: fslmaths BOLD_mni.nii.gz -kernel gauss 2.1233 -fmean BOLD_mni_smooth5mm.nii.gz -odt short",
    ],
  },
};

// Extra validator for the fslroi sub-step of bet_func (kept here, not in
// filesystem.js, since it only needs step-config + ASSET_MAP, both local to
// this file's module scope in load order... actually VALIDATORS lives in
// filesystem.js, so this entry is merged onto it below).
VALIDATORS.fslroi_vol0 = function (tokens, vfs, step) {
  const raw = tokens.slice(1);
  const inTok = raw[0];
  const check = requireInput(vfs, inTok, step.fslroiInputRole, "-in 4D BOLD (motion-corrected)", step.fslroiInputComparisonRole);
  if (!check.ok) return check;
  const outTok = raw[1];
  if (!outTok) return { ok: false, message: "fslroi needs an output name: fslroi <in> <out> <tmin> <tsize>" };
  const tmin = raw[2];
  const tsize = raw[3];
  if (tmin !== "0" || tsize !== "1") {
    return { ok: false, message: "This step extracts exactly one representative volume: fslroi <in> <out> 0 1 (start at volume 0, take 1 volume)." };
  }
  return {
    ok: true,
    reveal: [{ id: "bold_mcf_vol0", name: ensureExt(outTok, ".nii.gz"), role: step.fslroiOutputRole, roleLabel: "representative BOLD volume" }],
    message: "Extracted volume 0 (the first volume) of the 4D series.",
  };
};

// ---- files present from the start ------------------------------------
const INITIAL_VFS_FILES = [
  { path: "~/T1w_dicom", kind: "dir", role: "t1w-dicom" },
  ...T1W_DICOM_FILES.map((n) => ({ path: `~/T1w_dicom/${n}`, kind: "file", isDicom: true })),
  { path: "~/BOLD_dicom", kind: "dir", role: "bold-dicom" },
  ...BOLD_DICOM_FILES.map((n) => ({ path: `~/BOLD_dicom/${n}`, kind: "file", isDicom: true })),
  { path: "~/MNI152_T1_2mm.nii.gz", assetId: "mni_head", role: "mni-head", size: "1.3 MB" },
  { path: "~/MNI152_T1_2mm_brain.nii.gz", assetId: "mni_brain", role: "mni-brain", size: "408 KB" },
];

const STATIC_ASSET_MAP = ASSET_MAP;
