#!/bin/bash
# Reproducible preprocessing pipeline for the teaching demo.
#
# Subject: sub-02 (Zenodo 3677090 / "greenEyes" session 0219191, ses-01)
# Anatomical branch: dcm2niix -> BET -> FLIRT (affine, 12 DOF) -> FNIRT (nonlinear)
# Functional branch: dcm2niix -> MCFLIRT -> BET (on mean functional)
#   [homework order: motion correction BEFORE BET, per Lesson 2 slide 42]
# Join: FLIRT func->struct (6 DOF) + FNIRT struct->standard warp,
#   combined in one applywarp call -> fslmaths Gaussian smoothing.
#
# BET threshold -f 0.4 -m is the slide 7 example value
# (`bet 001.nii 001_brain.nii -f 0.4 -m`). Smoothing FWHM = 5 mm is FSL/FEAT's
# own default, shown on slide 35's FEAT screenshot; sigma = FWHM / 2.3548.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/data/zenodo_3677090/sorted"
DERIV="${PROJECT_ROOT}/derivatives/sub-02"
ANAT="${DERIV}/anat"
FUNC="${DERIV}/func"
MNI_BRAIN="${FSLDIR}/data/standard/MNI152_T1_2mm_brain.nii.gz"
MNI_HEAD="${FSLDIR}/data/standard/MNI152_T1_2mm.nii.gz"

mkdir -p "${ANAT}" "${FUNC}"

# ---------- dcm2niix: DICOM -> NIfTI + JSON ----------
dcm2niix -z y -b y -f sub-02_T1w -o "${ANAT}" "${DATA_DIR}/T1w"
dcm2niix -z y -b y -f sub-02_task-faces_bold -o "${FUNC}" "${DATA_DIR}/faces"

# Public-hosting copies of the sidecars with institution/scanner/PI fields stripped
python3 "${PROJECT_ROOT}/scripts/sanitize_sidecar.py" \
    "${ANAT}/sub-02_T1w.json" "${ANAT}/sub-02_T1w.sanitized.json"
python3 "${PROJECT_ROOT}/scripts/sanitize_sidecar.py" \
    "${FUNC}/sub-02_task-faces_bold.json" "${FUNC}/sub-02_task-faces_bold.sanitized.json"

# ---------- Anatomical branch ----------
bet "${ANAT}/sub-02_T1w.nii.gz" "${ANAT}/sub-02_T1w_brain.nii.gz" -f 0.4 -m -R

flirt -in "${ANAT}/sub-02_T1w_brain.nii.gz" -ref "${MNI_BRAIN}" \
    -omat "${ANAT}/struct2standard_affine.mat" \
    -out  "${ANAT}/struct2standard_affine.nii.gz"

fnirt --in="${ANAT}/sub-02_T1w.nii.gz" --ref="${MNI_HEAD}" \
    --aff="${ANAT}/struct2standard_affine.mat" \
    --cout="${ANAT}/struct2standard_warp" \
    --iout="${ANAT}/struct2standard_fnirt.nii.gz" \
    --config=T1_2_MNI152_2mm

# ---------- Functional branch (motion correction BEFORE BET) ----------
mcflirt -in "${FUNC}/sub-02_task-faces_bold.nii.gz" \
    -out "${FUNC}/sub-02_task-faces_bold_mcf.nii.gz" \
    -mats -plots -rmsrel -rmsabs

fslmaths "${FUNC}/sub-02_task-faces_bold_mcf.nii.gz" -Tmean \
    "${FUNC}/sub-02_task-faces_bold_mcf_mean.nii.gz"

bet "${FUNC}/sub-02_task-faces_bold_mcf_mean.nii.gz" \
    "${FUNC}/sub-02_task-faces_bold_mcf_mean_brain.nii.gz" -f 0.3 -m -R

# ---------- Join: func -> struct -> standard, in one resampling step ----------
flirt -in "${FUNC}/sub-02_task-faces_bold_mcf_mean_brain.nii.gz" \
    -ref "${ANAT}/sub-02_T1w_brain.nii.gz" \
    -omat "${FUNC}/example_func2highres.mat" -dof 6 \
    -out  "${FUNC}/example_func2highres.nii.gz"

applywarp -i "${FUNC}/sub-02_task-faces_bold_mcf.nii.gz" \
    -r "${MNI_BRAIN}" \
    -o "${FUNC}/sub-02_task-faces_bold_mni.nii.gz" \
    --premat="${FUNC}/example_func2highres.mat" \
    --warp="${ANAT}/struct2standard_warp.nii.gz"

# ---------- Smoothing: Gaussian, FWHM = 5 mm (sigma = 5 / 2.3548 = 2.1233 mm) ----------
# -odt short matches the input datatype: without it fslmaths defaults to
# FLOAT32 output, which on this 196-volume series blows the file up from
# 122 MB to 487 MB for no quality benefit.
fslmaths "${FUNC}/sub-02_task-faces_bold_mni.nii.gz" \
    -kernel gauss 2.1233 -fmean \
    "${FUNC}/sub-02_task-faces_bold_mni_smooth5mm.nii.gz" -odt short

echo "Pipeline complete."
