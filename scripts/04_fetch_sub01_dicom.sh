#!/bin/bash
# Download the matched T1w + BOLD DICOM series used by the simulator, from
# dfsp-spirit/sub-01 (CC0 1.0, https://github.com/dfsp-spirit/sub-01).
# Series 0002 = T1w MPRAGE (192 files), series 0005 = resting-state BOLD
# (240 files). Both are real, unmodified scanner DICOMs, already anonymized
# by the publisher (PatientName/PatientID literally "ANONYMIZED"); verified
# directly against every downloaded file, not just a sample — see
# docs/manifest.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/data/sub01_dicom"
mkdir -p "${OUT}/T1w" "${OUT}/BOLD"

base="https://raw.githubusercontent.com/dfsp-spirit/sub-01/main/raw/sub-01"

echo "== T1w (series 0002, 192 files) =="
seq -f "%06g" 4 195 | xargs -P 8 -I{} curl -s -o "${OUT}/T1w/0002_MR{}.dcm" "${base}/0002_MR{}.dcm"

echo "== BOLD (series 0005, 240 files) =="
seq -f "%06g" 580 819 | xargs -P 8 -I{} curl -s -o "${OUT}/BOLD/0005_MR{}.dcm" "${base}/0005_MR{}.dcm"

echo "T1w files:  $(ls "${OUT}/T1w" | wc -l)  (expect 192)"
echo "BOLD files: $(ls "${OUT}/BOLD" | wc -l) (expect 240)"

echo "== building downloadable archives for the site =="
( cd "${OUT}/T1w" && rm -f ../T1w_dicom.zip && zip -q -r ../T1w_dicom.zip . )
( cd "${OUT}/BOLD" && rm -f ../BOLD_dicom.zip && zip -q -r ../BOLD_dicom.zip . )
