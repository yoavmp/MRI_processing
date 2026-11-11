#!/bin/bash
# Assemble the public, GitHub-Pages-safe asset bundle in site/data/ from the
# validated derivatives/sub01 outputs (dfsp-spirit/sub-01, CC0). This REPLACES
# the entire previous bundle (built from a different, Zenodo-sourced
# participant whose raw DICOMs could never be published) — site/data/ is
# wiped and rebuilt from scratch every run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANAT="${ROOT}/derivatives/sub01/anat"
FUNC="${ROOT}/derivatives/sub01/func"
DICOM="${ROOT}/data/sub01_dicom"
OUT="${ROOT}/site/data"

rm -rf "${OUT}"
mkdir -p "${OUT}/anat" "${OUT}/func" "${OUT}/standard" "${OUT}/dicom"

echo "== anatomical branch (defaced) =="
cp "${ANAT}/T1w_defaced.nii.gz"       "${OUT}/anat/T1w.nii.gz"
cp "${ANAT}/T1w.json"                 "${OUT}/anat/T1w.json"
for f in 0.2 0.4 0.5 0.8; do
  cp "${ANAT}/T1w_brain_f${f}.nii.gz"      "${OUT}/anat/T1w_brain_f${f}.nii.gz"
  cp "${ANAT}/T1w_brain_f${f}_mask.nii.gz" "${OUT}/anat/T1w_brain_f${f}_mask.nii.gz"
done
cp "${ANAT}/struct2standard.mat"        "${OUT}/anat/struct2standard.mat"
cp "${ANAT}/struct2standard_warp.nii.gz" "${OUT}/anat/warp_struct2standard.nii.gz"
cp "${ANAT}/struct2standard_fnirt.nii.gz" "${OUT}/anat/struct2standard_fnirt.nii.gz"
cp "${ANAT}/warp_magnitude_overlay.png"  "${OUT}/anat/warp_magnitude_overlay.png"

echo "== functional branch (full 240-volume series) =="
cp "${FUNC}/BOLD.nii.gz"                      "${OUT}/func/BOLD.nii.gz"
cp "${FUNC}/BOLD.json"                        "${OUT}/func/BOLD.json"
cp "${FUNC}/BOLD_mcf_default.nii.gz"          "${OUT}/func/BOLD_mcf_default.nii.gz"
cp "${FUNC}/BOLD_mcf_default.nii.gz.par"      "${OUT}/func/BOLD_mcf_default.par"
cp "${FUNC}/BOLD_mcf_refvol0.nii.gz"          "${OUT}/func/BOLD_mcf_refvol0.nii.gz"
cp "${FUNC}/BOLD_mcf_refvol0.nii.gz.par"      "${OUT}/func/BOLD_mcf_refvol0.par"
for f in 0.3 0.5; do
  cp "${FUNC}/BOLD_mcf_brain_f${f}.nii.gz"      "${OUT}/func/BOLD_mcf_brain_f${f}.nii.gz"
  cp "${FUNC}/BOLD_mcf_brain_f${f}_mask.nii.gz" "${OUT}/func/BOLD_mcf_brain_f${f}_mask.nii.gz"
done
cp "${FUNC}/func2struct.mat"                  "${OUT}/func/func2struct.mat"
cp "${FUNC}/BOLD_mni.nii.gz"                  "${OUT}/func/BOLD_mni.nii.gz"
cp "${FUNC}/BOLD_mni_smooth5mm.nii.gz"        "${OUT}/func/BOLD_mni_smooth5mm.nii.gz"

echo "== standard space template (MNI152, permissively licensed, see ATTRIBUTION) =="
cp "${FSLDIR}/data/standard/MNI152_T1_2mm_brain.nii.gz" "${OUT}/standard/MNI152_T1_2mm_brain.nii.gz"
cp "${FSLDIR}/data/standard/MNI152_T1_2mm.nii.gz"        "${OUT}/standard/MNI152_T1_2mm.nii.gz"

echo "== real DICOM archives (CC0, downloadable) =="
cp "${DICOM}/T1w_dicom.zip"  "${OUT}/dicom/T1w_dicom.zip"
cp "${DICOM}/BOLD_dicom.zip" "${OUT}/dicom/BOLD_dicom.zip"

echo
echo "== sizes =="
du -sh "${OUT}"/* 2>/dev/null
echo "---"
du -sh "${OUT}"
