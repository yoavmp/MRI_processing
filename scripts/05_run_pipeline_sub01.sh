#!/bin/bash
# Full homework-faithful pipeline for the matched sub-01 T1w+BOLD pair,
# following "Exercise 1 - Preprocessing.pdf" stage by stage. This is what
# scripts/03_build_public_bundle.sh's inputs are derived from. See
# docs/manifest.md for the per-command rationale and the two verified
# FSL-behavior findings this script's shape depends on:
#   - bet/flirt silently truncate a 4D input to its first volume (confirmed
#     on the installed FSL 6.0.7.13 — not an average, not all volumes).
#   - mcflirt's -refvol is 0-indexed ("registers to the (n+1)th volume").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DICOM="${ROOT}/data/sub01_dicom"
ANAT="${ROOT}/derivatives/sub01/anat"
FUNC="${ROOT}/derivatives/sub01/func"
MNI_brain="${FSLDIR}/data/standard/MNI152_T1_2mm_brain.nii.gz"
MNI_head="${FSLDIR}/data/standard/MNI152_T1_2mm.nii.gz"

mkdir -p "${ANAT}" "${FUNC}"

# ---------- Stage 1: DICOM -> NIfTI ----------
dcm2niix -z y -b y -f T1w -o "${ANAT}" "${DICOM}/T1w"
dcm2niix -z y -b y -f BOLD -o "${FUNC}" "${DICOM}/BOLD"

# ---------- Deface (not in the homework — our addition for public hosting) ----------
cd "${ANAT}"
fsl_deface T1w.nii.gz T1w_defaced.nii.gz

# ---------- Stage 3 (anatomical): BET, -f 0.5 default + 0.2/0.4/0.8 comparison ----------
for f in 0.2 0.4 0.5 0.8; do
  bet T1w_defaced.nii.gz "T1w_brain_f${f}.nii.gz" -f "${f}" -m -R
done

# ---------- Stage 4 (anatomical-only rows): T1w -> MNI, FLIRT then FNIRT ----------
flirt -in T1w_brain_f0.5.nii.gz -ref "${MNI_brain}" -omat struct2standard.mat
fnirt --in=T1w_defaced.nii.gz --ref="${MNI_head}" --aff=struct2standard.mat \
    --cout=struct2standard_warp --iout=struct2standard_fnirt.nii.gz --config=T1_2_MNI152_2mm

# Warp-field magnitude visualization (for the Viewer's warp-description panel)
fnirtfileutils --in=struct2standard_warp.nii.gz --ref="${MNI_head}" --out=warp_field_mm.nii.gz --outformat=field
fslroi warp_field_mm.nii.gz wx.nii.gz 0 1
fslroi warp_field_mm.nii.gz wy.nii.gz 1 1
fslroi warp_field_mm.nii.gz wz.nii.gz 2 1
fslmaths wx.nii.gz -sqr -add <(fslmaths wy.nii.gz -sqr -) -add <(fslmaths wz.nii.gz -sqr -) -sqrt warp_magnitude_mm.nii.gz 2>/dev/null \
  || { fslmaths wx.nii.gz -sqr wx2.nii.gz; fslmaths wy.nii.gz -sqr wy2.nii.gz; fslmaths wz.nii.gz -sqr wz2.nii.gz; \
       fslmaths wx2.nii.gz -add wy2.nii.gz -add wz2.nii.gz -sqrt warp_magnitude_mm.nii.gz; rm -f wx2.nii.gz wy2.nii.gz wz2.nii.gz; }
overlay 1 0 "${MNI_brain}" 0 9000 warp_magnitude_mm.nii.gz 0.5 12.5 /tmp/warp_overlay.nii.gz
slicer /tmp/warp_overlay.nii.gz -a warp_magnitude_overlay.png
rm -f wx.nii.gz wy.nii.gz wz.nii.gz warp_field_mm.nii.gz /tmp/warp_overlay.nii.gz

# ---------- Stage 2 (functional): MCFLIRT, default + -refvol 0 ----------
# -refvol 0 (not the homework's literal "-refvol 1") is used deliberately: the
# homework's own prose says this run aligns "to the first volume instead of
# the middle volume", and mcflirt's -refvol is 0-indexed (confirmed via its
# own --help: "registers to the (n+1)th volume in series"), so -refvol 0 is
# the flag that actually produces "the first volume" — -refvol 1 would have
# registered to the *second* volume instead. See docs/manifest.md §10c/§10g.
cd "${FUNC}"
mcflirt -in BOLD.nii.gz -out BOLD_mcf_default.nii.gz -plots
mcflirt -in BOLD.nii.gz -out BOLD_mcf_refvol0.nii.gz -refvol 0 -plots

# ---------- Stage 3 (functional): one BET command, fMRI mode (-F), directly
# on the full 4D motion-corrected series. -F is bet's own documented mode for
# 4D fMRI data (confirmed on the installed bet's --help: "apply to 4D FMRI
# data (uses -f 0.3 and dilates brain mask slightly)") — it genuinely brain-
# extracts every volume and produces a real 4D result plus one 3D mask, no
# fslroi/fslmaths workaround needed. -F and -R are mutually exclusive, so -R
# is dropped here (it's still used for the T1w BET above).
bet BOLD_mcf_default.nii.gz BOLD_mcf_brain_f0.5.nii.gz -F -f 0.5 -m   # designated
bet BOLD_mcf_default.nii.gz BOLD_mcf_brain_f0.3.nii.gz -F -f 0.3 -m   # comparison only (-F's own default f)

# ---------- Stage 4 (join): func->struct FLIRT, then applywarp on the full 4D ----------
# -in is the real masked 4D series from Stage 3 (FLIRT truncates a 4D -in to
# its first volume internally, same verified behavior as the T1w/BET case;
# since Stage 2 already brought every volume into one common frame, that
# first-volume alignment is representative of the whole series).
flirt -in BOLD_mcf_brain_f0.5.nii.gz -ref "${ANAT}/T1w_brain_f0.5.nii.gz" -omat func2struct.mat -dof 6
applywarp -i BOLD_mcf_brain_f0.5.nii.gz -r "${MNI_brain}" -o BOLD_mni.nii.gz \
    --premat=func2struct.mat --warp="${ANAT}/struct2standard_warp.nii.gz" -d short

# ---------- Stage 5: smoothing, 5mm FWHM (sigma 2.1233) ----------
fslmaths BOLD_mni.nii.gz -kernel gauss 2.1233 -fmean BOLD_mni_smooth5mm.nii.gz -odt short

echo "Pipeline complete. Run scripts/03_build_public_bundle.sh next."
