// Virtual filesystem + command-validation engine for the terminal simulator.
// Everything here is simulated: no real command ever executes. A command is
// accepted when it matches the shape of the real FSL/dcm2niix invocation
// closely enough (see each step's validator), and "succeeding" reveals a
// precomputed, real output file from site/data/.
//
// Inputs are resolved by ROLE + PROVENANCE, not by a fixed filename stem.
// Every VFS entry carries a `role` tag assigned by the command that produced
// it (or "provided at start" for initial files) — a student can rename any
// file to anything and later steps still find it correctly, as long as it
// really is the right kind of file. Only the typed filename is used to look
// the file up (so "no such file" errors are still meaningful); the role
// decides whether what was found is acceptable for this slot.

// ---- generic argument parsing -------------------------------------------

function tokenize(line) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

function parseArgs(tokens) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      if (eq !== -1) {
        flags[t.slice(2, eq)] = t.slice(eq + 1);
      } else {
        const name = t.slice(2);
        const next = tokens[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else if (t.startsWith("-") && t.length > 1 && isNaN(Number(t))) {
      const eq = t.indexOf("=");
      if (eq !== -1) {
        flags[t.slice(1, eq)] = t.slice(eq + 1);
      } else {
        const name = t.slice(1);
        const next = tokens[i + 1];
        if (next !== undefined && !(next.startsWith("-") && isNaN(Number(next)))) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else {
      positionals.push(t);
    }
  }
  return { flags, positionals };
}

function basename(p) {
  return p.split("/").pop();
}
function stem(p) {
  return basename(p).replace(/\.(nii\.gz|nii|json|par|mat)$/i, "");
}

// ---- virtual filesystem ---------------------------------------------------

class VFS {
  constructor(initialFiles) {
    this.files = new Map();
    this.cwd = "~";
    for (const f of initialFiles) this.addFile(f.path, f);
    this.history = [];
  }

  addFile(path, meta) {
    this.files.set(path, { path, kind: "file", ...meta });
  }

  resolve(path) {
    if (path.startsWith("~")) return path;
    if (path.startsWith("/")) return "~" + path;
    const base = this.cwd === "~" ? "~" : this.cwd;
    return base + "/" + path;
  }

  // Find a file matching basename (extension-flexible), cwd first, then anywhere.
  findByName(name) {
    if (!name) return null;
    const target = stem(name);
    for (const [p, f] of this.files) {
      if (f.kind !== "file") continue;
      const dir = p.slice(0, p.lastIndexOf("/"));
      if (dir === this.cwd && stem(p).toLowerCase() === target.toLowerCase()) return f;
    }
    for (const [p, f] of this.files) {
      if (f.kind === "file" && stem(p).toLowerCase() === target.toLowerCase()) return f;
    }
    return null;
  }

  listDir(path) {
    const dir = path ? this.resolve(path) : this.cwd;
    const entries = [];
    const seenDirs = new Set();
    for (const [p, meta] of this.files) {
      if (p === dir) continue;
      if (!p.startsWith(dir + "/")) continue;
      const rest = p.slice(dir.length + 1);
      const sub = rest.split("/")[0];
      // Any path under this dir whose first segment isn't the whole rest is
      // itself a subdirectory — same as a dir's own marker entry (meta.kind
      // === "dir") when rest has no further "/". Either way it's one
      // directory entry, shown once, with a trailing slash.
      if (rest.includes("/") || meta.kind === "dir") {
        if (!seenDirs.has(sub)) {
          seenDirs.add(sub);
          entries.push({ name: sub + "/", kind: "dir" });
        }
      } else {
        entries.push({ name: rest, kind: "file", meta });
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  cd(path) {
    if (path === undefined || path === "~") {
      this.cwd = "~";
      return true;
    }
    if (path === "..") {
      if (this.cwd === "~") return true;
      const parts = this.cwd.split("/");
      parts.pop();
      this.cwd = parts.join("/") || "~";
      return true;
    }
    const target = this.resolve(path.replace(/\/$/, ""));
    const isDir = [...this.files.keys()].some((p) => p === target || p.startsWith(target + "/"));
    if (isDir) {
      this.cwd = target;
      return true;
    }
    return false;
  }
}

// ---- role-based input resolution -------------------------------------------

// acceptRoles: a role string, or an array of role strings that are all okay.
// comparisonRoles (optional): roles that DO exist and ARE the right kind of
// thing, but are flagged as parameter-exploration dead ends not wired into
// the rest of this pipeline — gives a specific, honest explanation instead
// of a generic rejection.
function requireInput(vfs, token, acceptRoles, label, comparisonRoles) {
  if (!token) return { ok: false, message: `Missing ${label}.` };
  const f = vfs.findByName(token);
  if (!f) {
    return { ok: false, message: `No such file: "${token}". Run 'ls' to see what's available in this directory.` };
  }
  const accept = Array.isArray(acceptRoles) ? acceptRoles : [acceptRoles];
  if (accept.includes(f.role)) return { ok: true, file: f };
  const compare = comparisonRoles ? (Array.isArray(comparisonRoles) ? comparisonRoles : [comparisonRoles]) : [];
  if (compare.includes(f.role)) {
    return {
      ok: false,
      message: `"${token}" is a real result, but a comparison-only one — it isn't wired into the rest of this exercise's pipeline. ${f.comparisonNote || ""} To continue the supported chain, use the designated result for this role instead (check the Task panel or run 'hint').`,
    };
  }
  const whatItIs = f.role ? "a " + (f.roleLabel || f.role) : "not the right kind of file";
  return {
    ok: false,
    message: `"${token}" exists, but isn't the ${label} this step needs (it's ${whatItIs}). Check the Task panel for what input this step needs.`,
  };
}

function ensureExt(name, ext) {
  if (!name) return name;
  if (/\.(nii\.gz|nii|json|par|mat)$/i.test(name)) return name;
  return name + ext;
}

// ---- step-specific validators ---------------------------------------------
// Each returns {ok:true, reveal:[{id,name,role,roleLabel,producedByStep?,comparisonNote?}], message}
// or {ok:false, message}.

const VALIDATORS = {
  // ---- Stage 1: DICOM -> NIfTI (one validator per modality, same shape) ----
  dcm2niix_t1w(tokens, vfs, step) {
    return runDcm2niix(tokens, vfs, step, {
      dicomRole: "t1w-dicom",
      dicomLabel: "T1w DICOM folder",
      outRole: "t1w-nifti",
      outRoleLabel: "converted T1w",
      niiAssetId: "t1w_nifti",
      jsonAssetId: "t1w_json",
      defaultName: "T1w",
      series: step.series,
    });
  },
  dcm2niix_bold(tokens, vfs, step) {
    return runDcm2niix(tokens, vfs, step, {
      dicomRole: "bold-dicom",
      dicomLabel: "BOLD DICOM folder",
      outRole: "bold-nifti",
      outRoleLabel: "converted BOLD",
      niiAssetId: "bold_nifti",
      jsonAssetId: "bold_json",
      defaultName: "BOLD",
      series: step.series,
    });
  },

  bet(tokens, vfs, step) {
    const { flags, positionals } = parseArgs(tokens.slice(1));
    const inTok = positionals[0];
    const outTok = positionals[1];
    const check = requireInput(vfs, inTok, step.expectedInputRole, step.inputLabel, step.inputComparisonRole);
    if (!check.ok) return check;
    if (!outTok) return { ok: false, message: "bet needs an output name too: bet <input> <output> [-f <value>] [-m]" };
    const usesF = !!flags.F;
    // -F (fMRI mode) itself defaults to -f 0.3 on the real, installed bet —
    // different from this exercise's homework default (0.5) — so which
    // threshold "omitting -f" means depends on whether -F was given.
    const impliedDefault = step.fmriMode && usesF ? "0.3" : step.defaultParam.f;
    const fVal = flags.f === true ? null : flags.f;
    const supported = step.supportedParams.f;
    const chosen = fVal ?? impliedDefault;
    if (!supported.includes(String(chosen))) {
      return {
        ok: false,
        message: `-f ${chosen} wasn't precomputed for this exercise. Supported values here: ${supported.join(", ")} (the homework's own default, when -f is omitted, is ${step.defaultParam.f} — try 'hint' for the exact command).`,
      };
    }
    const wantMask = !!flags.m;
    const outName = ensureExt(outTok, ".nii.gz");
    const isDesignated = String(chosen) === String(step.designatedParam ?? step.defaultParam.f);
    const brainRole = isDesignated ? step.outputRole : step.variantRole;
    const maskRole = isDesignated ? step.maskRole : step.maskVariantRole;

    // Collision guard: this exact output name already holds a DIFFERENT
    // threshold's result — reusing it would silently overwrite that variant.
    const suggest = (suffix) => `${step.suggestedBaseName || "output"}_f${chosen}${suffix}`;
    const brainPath = vfs.cwd + "/" + outName;
    const existingBrain = vfs.files.get(brainPath);
    if (existingBrain && [step.outputRole, step.variantRole].includes(existingBrain.role) && String(existingBrain.paramVariant) !== String(chosen)) {
      return {
        ok: false,
        message: `"${outName}" is already this step's -f ${existingBrain.paramVariant} result. Reusing that name for -f ${chosen} would overwrite it — pick a distinct name, e.g. ${suggest(".nii.gz")}.`,
      };
    }
    let maskName;
    if (wantMask) {
      maskName = ensureExt(stem(outName) + "_mask", ".nii.gz");
      const maskPath = vfs.cwd + "/" + maskName;
      const existingMask = vfs.files.get(maskPath);
      if (existingMask && [step.maskRole, step.maskVariantRole].includes(existingMask.role) && String(existingMask.paramVariant) !== String(chosen)) {
        return {
          ok: false,
          message: `"${maskName}" is already this step's -f ${existingMask.paramVariant} mask. Reusing that name for -f ${chosen} would overwrite it — pick a distinct name, e.g. ${suggest("_mask.nii.gz")}.`,
        };
      }
    }

    const variantSuffix = isDesignated ? "" : ` (comparison-only, -f ${chosen})`;
    const reveal = [
      { id: `${step.assetPrefix}_brain_f${chosen}`, name: outName, role: brainRole, roleLabel: step.outputRoleLabel + variantSuffix, paramVariant: chosen },
    ];
    if (wantMask) {
      reveal.push({
        id: `${step.assetPrefix}_mask_f${chosen}`,
        name: maskName,
        role: maskRole,
        roleLabel: step.outputRoleLabel + " mask" + variantSuffix,
        paramVariant: chosen,
      });
    }
    let message = `fractional intensity threshold: ${chosen}`;
    if (step.fmriMode) {
      message += usesF
        ? "\n-F: fMRI mode — bet applies directly to every volume of the 4D series (and dilates the mask slightly), confirmed against the installed FSL."
        : "\nNote: this exercise accepts bet's plain syntax (no -F) here too, as a shortcut matching the homework's own literal command text. On the installed FSL, -F is what actually makes bet process a whole 4D series instead of silently truncating to its first volume — see 'help bet'.";
    }
    if (!wantMask) message += "\n(no -m given — only the brain image was produced, no mask. Add -m to also get the binary mask.)";
    if (!isDesignated) {
      message += `\nNote: -f ${chosen} is a comparison-only variant here — the rest of this exercise continues from -f ${step.defaultParam.f} (the homework's default). Both are real, independently computed results.`;
    }
    return { ok: true, reveal, message, paramVariant: chosen };
  },

  mcflirt(tokens, vfs, step) {
    const { flags } = parseArgs(tokens.slice(1));
    const inTok = flags.in;
    const outTok = flags.out;
    const check = requireInput(vfs, inTok, step.expectedInputRole, "-in image");
    if (!check.ok) return check;
    const usesRefvol0 = String(flags.refvol) === "0";
    const usesDefault = flags.refvol === undefined;
    if (!usesDefault && !usesRefvol0) {
      return {
        ok: false,
        message: `-refvol ${flags.refvol} wasn't precomputed. This exercise supports the default reference (no -refvol, the middle volume) and -refvol 0, the first acquired volume (Question 2b's comparison).`,
      };
    }
    if (!outTok) return { ok: false, message: "mcflirt needs -out <name> for the motion-corrected output." };
    const outName = ensureExt(outTok, ".nii.gz");
    const variant = usesRefvol0 ? "refvol0" : "default";
    const role = usesRefvol0 ? step.comparisonOutputRole : step.outputRole;
    const otherRole = usesRefvol0 ? step.outputRole : step.comparisonOutputRole;
    const parId = usesRefvol0 ? "mcf_par_refvol0" : "mcf_par_default";
    const runLabel = variant === "default" ? "Default reference" : "First volume";
    const otherLabel = usesRefvol0 ? "Default reference" : "First volume";
    const ndesc = variant === "default" ? "the middle volume" : "the first acquired volume";

    // Collision guard: this exact output name already holds the OTHER run's result.
    const outPath = vfs.cwd + "/" + outName;
    const existingOut = vfs.files.get(outPath);
    if (existingOut && existingOut.role === otherRole) {
      const suggestion = usesRefvol0 ? "BOLD_mcf_firstvol.nii.gz" : "BOLD_mcf.nii.gz";
      return {
        ok: false,
        message: `"${outName}" is already the "${otherLabel}" run's output. Reusing that name for the "${runLabel}" run would overwrite it — pick a distinct name, e.g. ${suggestion}.`,
      };
    }

    const reveal = [{ id: usesRefvol0 ? "mcf_4d_refvol0" : "mcf_4d_default", name: outName, role, roleLabel: "motion-corrected BOLD", tag: runLabel }];
    const notes = [];
    if (flags.plots) {
      reveal.push({ id: parId, name: ensureExt(stem(outName), ".par"), role: role + "-par", roleLabel: "motion parameters", tag: runLabel });
    } else {
      notes.push("tip: add -plots to save the .par motion-parameter file.");
    }
    if (variant === "refvol0") {
      notes.push(`This is the "${runLabel}" run — kept for comparison (Question 2b). The rest of the exercise continues from the "Default reference" run.`);
    } else {
      notes.push(`This is the "${runLabel}" run — the rest of the exercise continues from this one.`);
    }
    return {
      ok: true,
      reveal,
      message: "McFLIRT v2.0\nRegistering 240 volumes to " + ndesc + "...\ndone.\n" + notes.join("\n"),
    };
  },

  flirt(tokens, vfs, step) {
    const { flags } = parseArgs(tokens.slice(1));
    const inCheck = requireInput(vfs, flags.in, step.expectedInputRole, step.inputLabel || "-in image", step.inputComparisonRole);
    if (!inCheck.ok) return inCheck;
    const refCheck = requireInput(vfs, flags.ref, step.expectedRefRole, step.refLabel || "-ref image", step.refComparisonRole);
    if (!refCheck.ok) return refCheck;
    if (!flags.omat) return { ok: false, message: "flirt needs -omat <name> to save the transform matrix." };
    if (step.requireDof) {
      const dof = flags.dof;
      if (String(dof) !== String(step.requireDof)) {
        return {
          ok: false,
          message: `This registration needs -dof ${step.requireDof} (rigid-body — same physical head, different scan). You gave ${dof ? "-dof " + dof : "no -dof (defaults to 12, affine)"}.`,
        };
      }
    }
    return {
      ok: true,
      reveal: [{ id: step.revealId, name: ensureExt(flags.omat, ".mat"), role: step.outputRole, roleLabel: "affine matrix" }],
      message: `Final result: ${step.requireDof ?? 12} DOF transform written.`,
    };
  },

  fnirt(tokens, vfs, step) {
    const { flags } = parseArgs(tokens.slice(1));
    const inCheck = requireInput(vfs, flags.in, step.expectedInputRole, "--in image (full head)");
    if (!inCheck.ok) return inCheck;
    const refCheck = requireInput(vfs, flags.ref, step.expectedRefRole, "--ref image (full head)");
    if (!refCheck.ok) return refCheck;
    const affCheck = requireInput(vfs, flags.aff, step.expectedAffRole, "--aff matrix (the FLIRT result)");
    if (!affCheck.ok) return affCheck;
    if (!flags.cout) return { ok: false, message: "fnirt needs --cout=<name> to save the warp field." };
    const reveal = [{ id: "struct2standard_warp", name: ensureExt(flags.cout, ".nii.gz"), role: step.outputRole, roleLabel: "nonlinear warp field" }];
    let message = "fnirt (config=T1_2_MNI152_2mm)\n[this step took about 20 minutes to actually compute — simulated here]\ndone.";
    if (flags.iout) {
      reveal.push({
        id: "struct2standard_fnirt_result",
        name: ensureExt(flags.iout, ".nii.gz"),
        role: "struct2standard-fnirt-result",
        roleLabel: "T1 resampled into MNI space",
      });
      message += "\n--iout saved the resampled T1 (useful for checking registration quality — not required by the homework's own command).";
    } else {
      message += "\ntip: add --iout=<name> to also save the resampled T1 in MNI space, handy for checking registration quality.";
    }
    return { ok: true, reveal, message };
  },

  applywarp(tokens, vfs, step) {
    const { flags } = parseArgs(tokens.slice(1));
    const inCheck = requireInput(vfs, flags.i, step.expectedInputRole, step.inputLabel || "-i image", step.inputComparisonRole);
    if (!inCheck.ok) return inCheck;
    const refCheck = requireInput(vfs, flags.r, step.expectedRefRole, "-r reference");
    if (!refCheck.ok) return refCheck;
    const preCheck = requireInput(vfs, flags.premat, step.expectedPremat, "--premat (func→struct matrix)");
    if (!preCheck.ok) return preCheck;
    const warpCheck = requireInput(vfs, flags.warp, step.expectedWarp, "--warp (struct→standard warp)");
    if (!warpCheck.ok) return warpCheck;
    if (!flags.o) return { ok: false, message: "applywarp needs -o <name> for the output." };
    return {
      ok: true,
      reveal: [{ id: "bold_mni", name: ensureExt(flags.o, ".nii.gz"), role: step.outputRole, roleLabel: "normalized 4D BOLD" }],
      message: "Output resampled onto the reference grid, full 240-volume series: 91x109x91x240 @ 2mm.",
    };
  },

  fslmaths_smooth(tokens, vfs, step) {
    const raw = tokens.slice(1);
    const inTok = raw[0];
    const check = requireInput(vfs, inTok, step.expectedInputRole, "input image");
    if (!check.ok) return check;
    const kernelIdx = raw.indexOf("-kernel");
    if (kernelIdx === -1 || raw[kernelIdx + 1] !== "gauss" || !raw[kernelIdx + 2]) {
      return { ok: false, message: "Expected: ... -kernel gauss <sigma> -fmean <output>" };
    }
    const sigma = raw[kernelIdx + 2];
    const supported = step.supportedParams.sigma;
    if (!supported.includes(sigma)) {
      const asFwhm = (Number(sigma) * 2.3548).toFixed(2);
      return {
        ok: false,
        message: `sigma ${sigma} (≈${asFwhm}mm FWHM) wasn't precomputed — this exercise only runs the homework's 5mm FWHM (sigma 2.1233). 3mm and 7mm are Question 5's pencil-and-paper calculation, not something to run here: sigma = FWHM / 2.3548.`,
      };
    }
    const fmeanIdx = raw.indexOf("-fmean");
    if (fmeanIdx === -1) return { ok: false, message: "Missing -fmean." };
    const outTok = raw[fmeanIdx + 1];
    if (!outTok || outTok.startsWith("-")) return { ok: false, message: "Missing output filename after -fmean." };
    const odt = raw.indexOf("-odt");
    const usedOdt = odt !== -1 && raw[odt + 1] === "short";
    const reveal = [{ id: "bold_smooth5mm", name: ensureExt(outTok, ".nii.gz"), role: step.outputRole, roleLabel: "smoothed 4D BOLD" }];
    let message = "Gaussian kernel, sigma=2.1233mm (5mm FWHM) applied to all 240 volumes.";
    if (!usedOdt) {
      message += "\nNote: without -odt short, fslmaths outputs float32 here, ~4x the file size with no visible quality gain (see docs/manifest.md §6a for the measured rounding error). The revealed file uses -odt short either way.";
    }
    return { ok: true, reveal, message };
  },
};

function runDcm2niix(tokens, vfs, step, cfg) {
  const { flags, positionals } = parseArgs(tokens.slice(1));
  const folderArg = positionals[positionals.length - 1];
  if (!folderArg) {
    return { ok: false, message: `dcm2niix needs the ${cfg.dicomLabel} as its last (positional) argument, e.g.: dcm2niix -z y -b y -f ${cfg.defaultName} -o . ${step.dicomFolderName}` };
  }
  const folderName = folderArg.replace(/\/$/, "").split("/").pop();
  const folderFile = vfs.findByName(folderName) || [...vfs.files.values()].find((f) => f.kind === "dir" && basename(f.path) === folderName);
  const folderOk = folderFile && folderFile.role === cfg.dicomRole;
  if (!folderOk) {
    return { ok: false, message: `"${folderArg}" isn't the ${cfg.dicomLabel} for this step. Run 'ls' — you're looking for '${step.dicomFolderName}/'.` };
  }
  // This exercise requires both flags explicitly, every run, regardless of
  // dcm2niix's own upstream defaults (which already enable -b and disable
  // -z) — see the Task panel / hints for why.
  const missing = [];
  if (String(flags.z) !== "y") missing.push("-z y");
  if (String(flags.b) !== "y") missing.push("-b y");
  if (missing.length) {
    return {
      ok: false,
      message:
        `This exercise requires both -z y (gzip-compress) and -b y (write the JSON sidecar) on every dcm2niix run — missing: ${missing.join(", ")}. Nothing was created; add the missing flag(s) and try again.\n` +
        `Try: dcm2niix -z y -b y -f ${cfg.defaultName} -o . ${step.dicomFolderName}`,
    };
  }
  const outName = flags.f && flags.f !== true ? flags.f : cfg.defaultName;
  const outDir = flags.o && flags.o !== true ? flags.o.replace(/\/+$/, "") || "." : ".";
  const niiFileName = ensureExt(outName, ".nii.gz");
  const s = cfg.series;
  return {
    ok: true,
    reveal: [
      { id: cfg.niiAssetId, name: niiFileName, role: cfg.outRole, roleLabel: cfg.outRoleLabel },
      { id: cfg.jsonAssetId, name: ensureExt(outName, ".json").replace(/\.nii\.gz\.json$/, ".json"), role: cfg.outRole + "-json", roleLabel: cfg.outRoleLabel + " metadata" },
    ],
    message:
      `Found ${s.fileCount} DICOM file(s) in ${step.dicomFolderName}/\n` +
      `Convert as ${outDir}/${niiFileName} (${s.dims})\n` +
      `Conversion required ${s.convertSeconds}s.`,
  };
}

const BUILTINS = new Set(["ls", "pwd", "cd", "help", "hint", "history", "clear", "reset"]);
