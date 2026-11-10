#!/usr/bin/env python3
"""Strip identifying fields from a dcm2niix BIDS JSON sidecar before public hosting.

Usage: sanitize_sidecar.py <in.json> <out.json>
"""
import json
import sys

# Fields that can carry institution, scanner-serial, or operator/PI identity
# even though dcm2niix already excludes PatientName/PatientID/PatientBirthDate
# from its default BIDS sidecar.
DROP_FIELDS = [
    "InstitutionName",
    "InstitutionAddress",
    "InstitutionalDepartmentName",
    "DeviceSerialNumber",
    "StationName",
    "ProcedureStepDescription",
    "ReferringPhysicianName",
    "PerformingPhysicianName",
    "OperatorsName",
    "AcquisitionDateTime",
    "AcquisitionTime",
    "ConsistencyInfo",
]


def sanitize(in_path, out_path):
    with open(in_path) as f:
        data = json.load(f)
    removed = [k for k in DROP_FIELDS if k in data]
    for k in DROP_FIELDS:
        data.pop(k, None)
    with open(out_path, "w") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")
    return removed


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: sanitize_sidecar.py <in.json> <out.json>")
    removed = sanitize(sys.argv[1], sys.argv[2])
    print(f"removed fields: {removed}")
