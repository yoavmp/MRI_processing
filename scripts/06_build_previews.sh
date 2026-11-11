#!/bin/bash
# Builds the static preview PNGs used by the Viewer's no-WebGL2 fallback
# (site/js/viewer.js) and by the BET workflow cards. Generated headlessly
# with `fsleyes render` directly from the exact files shipped in
# site/data/ — not from a different/non-public copy — so what a student
# sees in the fallback matches what the interactive viewer would have shown.
# Re-run this after 03_build_public_bundle.sh if the underlying pipeline
# outputs ever change.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}/site/data"
OUT=previews
mkdir -p "${OUT}"

echo "== representative functional volume (first volume of the default motion-corrected run) =="
# Not a shipped site asset — single-volume background purely for rendering
# the BET-mask preview images below, now that the student's BET command
# (-F, fMRI mode) takes the 4D series directly and never produces this
# single-volume intermediate itself.
TMP="$(mktemp -d)"
fslroi func/BOLD_mcf_default.nii.gz "${TMP}/BOLD_mcf_vol0.nii.gz" 0 1

echo "== display ranges (robust 2nd-98th percentile) =="
t1w_dr=$(fslstats anat/T1w.nii.gz -P 2 -P 98)
func_dr=$(fslstats "${TMP}/BOLD_mcf_vol0.nii.gz" -P 2 -P 98)
mni_dr=$(fslstats standard/MNI152_T1_2mm_brain.nii.gz -P 2 -P 98)
bold_mni_dr=$(fslstats func/BOLD_mni.nii.gz -P 2 -P 98)
echo "T1w: ${t1w_dr} | func: ${func_dr} | MNI: ${mni_dr} | BOLD_mni: ${bold_mni_dr}"

echo "== BET T1w overlays (4 fractional-intensity variants) =="
for f in 0.2 0.4 0.5 0.8; do
  fsleyes render -hc --scene ortho --size 800 500 --outfile "${OUT}/bet_t1w_f${f}.png" \
    anat/T1w.nii.gz -dr ${t1w_dr} \
    "anat/T1w_brain_f${f}_mask.nii.gz" -cm red -a 45
done

echo "== BET functional overlays (2 variants, bet -F masks over the first functional volume) =="
for f in 0.3 0.5; do
  fsleyes render -hc --scene ortho --size 800 500 --outfile "${OUT}/bet_func_f${f}.png" \
    "${TMP}/BOLD_mcf_vol0.nii.gz" -dr ${func_dr} \
    "func/BOLD_mcf_brain_f${f}_mask.nii.gz" -cm red -a 45
done

echo "== registration alignment: func -> struct =="
# Resample the first volume of the real post-BET 4D series into T1w space
# using the real func2struct.mat, purely to generate this illustrative
# preview (this intermediate is not itself a shipped pipeline asset).
fslroi func/BOLD_mcf_brain_f0.5.nii.gz "${TMP}/func_brain_vol0.nii.gz" 0 1
flirt -in "${TMP}/func_brain_vol0.nii.gz" -ref anat/T1w_brain_f0.5.nii.gz \
  -applyxfm -init func/func2struct.mat -out "${TMP}/func_in_struct.nii.gz"
func_in_struct_dr=$(fslstats "${TMP}/func_in_struct.nii.gz" -P 2 -P 98)
fsleyes render -hc --scene ortho --size 800 500 --outfile "${OUT}/align_func2struct.png" \
  anat/T1w_brain_f0.5.nii.gz -dr ${t1w_dr} -cm greyscale \
  "${TMP}/func_in_struct.nii.gz" -cm red-yellow -a 65 -dr ${func_in_struct_dr}
rm -rf "${TMP}"

echo "== registration alignment: struct -> MNI (FNIRT) =="
fsleyes render -hc --scene ortho --size 800 500 --outfile "${OUT}/align_struct2standard.png" \
  standard/MNI152_T1_2mm_brain.nii.gz -dr ${mni_dr} \
  anat/struct2standard_fnirt.nii.gz -cm green -a 55

echo "== smoothing before/after =="
fsleyes render -hc --scene ortho --size 800 500 --outfile "${OUT}/smooth_before.png" \
  func/BOLD_mni.nii.gz -dr ${bold_mni_dr}
fsleyes render -hc --scene ortho --size 800 500 --outfile "${OUT}/smooth_after.png" \
  func/BOLD_mni_smooth5mm.nii.gz -dr ${bold_mni_dr}

echo
du -sh "${OUT}"
