#!/bin/bash
# Fetch and verify the teaching dataset for the MRI preprocessing demo.
#
# Primary source: Zenodo 3677090 (Princeton Handbook for Reproducible
# Neuroimaging: Sample Data), CC-BY-4.0, DOI 10.5281/zenodo.3677090, v1.0.0.
# Single scan session, single subject: T1w anatomical + 5 functional runs.
# We only need the anat_ses-01_T1w series (5) and the
# func_ses-01_task-faces_run-01 series (13) out of the full archive.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/data/zenodo_3677090"
ARCHIVE="${DATA_DIR}/0219191_mystudy-0219-1114.tar.gz"
EXPECTED_MD5="cec6bb90a60a41b75028261387a6ede5"
EXPECTED_SIZE=405671662

mkdir -p "${DATA_DIR}"

if [ ! -f "${ARCHIVE}" ]; then
    echo "Downloading archive (~405 MB)..."
    curl -L -o "${ARCHIVE}" \
        "https://zenodo.org/records/3677090/files/0219191_mystudy-0219-1114.tar.gz?download=1"
fi

actual_size=$(stat -f%z "${ARCHIVE}" 2>/dev/null || stat -c%s "${ARCHIVE}")
actual_md5=$(md5 -q "${ARCHIVE}" 2>/dev/null || md5sum "${ARCHIVE}" | cut -d' ' -f1)

if [ "${actual_size}" != "${EXPECTED_SIZE}" ] || [ "${actual_md5}" != "${EXPECTED_MD5}" ]; then
    echo "ERROR: checksum/size mismatch. Expected ${EXPECTED_SIZE} bytes / md5 ${EXPECTED_MD5}," \
         "got ${actual_size} bytes / md5 ${actual_md5}." >&2
    exit 1
fi
echo "Archive verified: size and md5 match Zenodo record."

tar -xzf "${ARCHIVE}" -C "${DATA_DIR}"

DICOM_DIR="${DATA_DIR}/0219191_mystudy-0219-1114/dcm"
SORT_DIR="${DATA_DIR}/sorted"
mkdir -p "${SORT_DIR}/T1w" "${SORT_DIR}/faces"

# Series 5 = anat_ses-01_T1w (192 files); series 13 = func_ses-01_task-faces_run-01 (196 files)
for f in "${DICOM_DIR}"/5-*.dcm.gz; do gunzip -c "$f" > "${SORT_DIR}/T1w/$(basename "${f%.gz}")"; done
for f in "${DICOM_DIR}"/13-*.dcm.gz; do gunzip -c "$f" > "${SORT_DIR}/faces/$(basename "${f%.gz}")"; done

echo "Sorted DICOM series ready at: ${SORT_DIR}"
echo "  T1w:   $(ls "${SORT_DIR}/T1w" | wc -l) files"
echo "  faces: $(ls "${SORT_DIR}/faces" | wc -l) files"
echo
echo "NOTE: These raw DICOMs carry real patient identifiers (DOB, weight,"
echo "exact scan date/time, institution name+address, scanner serial number)."
echo "They are explicitly authorized for non-anonymized distribution by the"
echo "Zenodo record's own license, but must NOT be copied into the public"
echo "student bundle. Only de-identified derivatives (see 02_run_pipeline.sh"
echo "and sanitize_sidecar.py) are meant for public hosting."
