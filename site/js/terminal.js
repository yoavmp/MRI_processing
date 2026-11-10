// Terminal UI controller: owns the virtual filesystem, renders output,
// routes typed commands to the active step's validators.

class Terminal {
  constructor(outputEl, inputEl, taskEl, promptEl) {
    this.outputEl = outputEl;
    this.inputEl = inputEl;
    this.taskEl = taskEl;
    this.promptEl = promptEl;
    this.vfs = new VFS(
      INITIAL_VFS_FILES.map((f) => ({
        path: f.path,
        assetId: f.assetId,
        size: f.size,
        kind: f.kind || "file",
        role: f.role,
        isDicom: f.isDicom,
      }))
    );
    this.assetMap = STATIC_ASSET_MAP;
    this.activeStepId = null;
    this.cmdHistory = [];
    this.histIdx = -1;
    this.hintIdx = {}; // per-step hint progress
    this.onReveal = null; // callback(assetId) when a new file is revealed, for the viewer

    this.inputEl.addEventListener("keydown", (e) => this.handleKey(e));
    this.print(
      "MRI preprocessing terminal simulator — all commands are SIMULATED (no real FSL runs here).\nType `help` for the command list, `hint` for a nudge, `ls` to look around.\n"
    );
  }

  setStep(stepId) {
    this.activeStepId = stepId;
    const step = STEP_RUNTIME[stepId];
    const def = WORKFLOW_STEPS.find((s) => s.id === stepId);
    this.promptEl.textContent = `student@mri-course:${this.vfs.cwd}$`;
    if (step && def) {
      this.taskEl.innerHTML = `<strong>Task — ${def.title}:</strong> ${step.task}`;
    }
    this.print(`\n--- switched to step: ${def ? def.title : stepId} ---`);
    this.updatePrompt();
  }

  print(text, cls) {
    const div = document.createElement("div");
    div.className = "term-line" + (cls ? " " + cls : "");
    div.textContent = text;
    this.outputEl.appendChild(div);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  printHTML(html, cls) {
    const div = document.createElement("div");
    div.className = "term-line" + (cls ? " " + cls : "");
    div.innerHTML = html;
    this.outputEl.appendChild(div);
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  updatePrompt() {
    this.promptEl.textContent = `student@mri-course:${this.vfs.cwd}$`;
  }

  handleKey(e) {
    if (e.key === "Enter") {
      const line = this.inputEl.value;
      this.inputEl.value = "";
      this.runLine(line);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.cmdHistory.length === 0) return;
      this.histIdx = Math.max(0, this.histIdx - 1);
      this.inputEl.value = this.cmdHistory[this.histIdx] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.histIdx === -1) return;
      this.histIdx = Math.min(this.cmdHistory.length, this.histIdx + 1);
      this.inputEl.value = this.cmdHistory[this.histIdx] ?? "";
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.autocomplete();
    }
  }

  autocomplete() {
    const partial = this.inputEl.value.split(" ").pop();
    if (!partial) return;
    const entries = this.vfs.listDir().map((e) => e.name);
    const match = entries.find((n) => n.startsWith(partial));
    if (match) {
      const tokens = this.inputEl.value.split(" ");
      tokens[tokens.length - 1] = match;
      this.inputEl.value = tokens.join(" ");
    }
  }

  runLine(line) {
    const trimmed = line.trim();
    this.printHTML(`<span class="term-prompt">${this.promptEl.textContent}</span> ${escapeHtml(trimmed)}`, "term-echo");
    if (!trimmed) return;
    this.cmdHistory.push(trimmed);
    this.histIdx = this.cmdHistory.length;

    const tokens = tokenize(trimmed);
    const cmd = tokens[0];

    if (BUILTINS.has(cmd)) {
      this.runBuiltin(cmd, tokens);
      return;
    }

    this.runPipelineCommand(cmd, tokens, trimmed);
  }

  runBuiltin(cmd, tokens) {
    switch (cmd) {
      case "pwd":
        this.print(this.vfs.cwd);
        break;
      case "ls": {
        const entries = this.vfs.listDir(tokens[1]);
        if (entries.length === 0) {
          this.print("(empty)");
        } else if (entries.length > 20) {
          // Long directory listings (the real 192/240-file DICOM folders) are
          // collapsed by default so they don't flood the terminal scroll —
          // click to expand and see every real filename.
          const names = entries.map((e) => e.name);
          const html =
            `<details class="term-ls-collapse"><summary>${names.length} entries — click to expand (${escapeHtml(names[0])} … ${escapeHtml(names[names.length - 1])})</summary>` +
            `<div class="term-ls-list">${escapeHtml(names.join("  "))}</div></details>`;
          this.printHTML(html, "term-ls");
        } else {
          this.print(entries.map((e) => e.name).join("  "));
        }
        break;
      }
      case "cd": {
        const ok = this.vfs.cd(tokens[1]);
        if (!ok) this.print(`cd: no such directory: ${tokens[1]}`, "term-error");
        this.updatePrompt();
        break;
      }
      case "clear":
        this.outputEl.innerHTML = "";
        break;
      case "history":
        this.print(this.cmdHistory.map((c, i) => `${i + 1}  ${c}`).join("\n") || "(empty)");
        break;
      case "reset":
        this.resetStep();
        break;
      case "help":
        this.printHelp(tokens[1]);
        break;
      case "hint":
        this.printHint();
        break;
    }
  }

  printHelp(topic) {
    if (!topic) {
      this.print(
        [
          "Built-in commands: ls, pwd, cd <dir>, help [command], hint, history, clear, reset",
          "Pipeline commands available in this step: " + (STEP_RUNTIME[this.activeStepId]?.commands || []).map((c) => c.binary).join(", "),
          "Use the Workflow diagram above to switch steps.",
        ].join("\n")
      );
      return;
    }
    const step = STEP_RUNTIME[this.activeStepId];
    if (step && step.commands.some((c) => c.binary === topic)) {
      this.print(step.hints[step.hints.length - 1]);
    } else {
      this.print(`No detailed help for "${topic}" in this step. Try 'help' with no arguments.`);
    }
  }

  printHint() {
    const step = STEP_RUNTIME[this.activeStepId];
    if (!step) return;
    const idx = this.hintIdx[this.activeStepId] ?? 0;
    const hint = step.hints[Math.min(idx, step.hints.length - 1)];
    this.print("hint: " + hint, "term-hint");
    this.hintIdx[this.activeStepId] = Math.min(idx + 1, step.hints.length - 1);
  }

  resetStep() {
    // Remove any files this step could have produced (by asset-prefix / known reveal ids)
    const step = STEP_RUNTIME[this.activeStepId];
    if (!step) return;
    for (const [p, f] of [...this.vfs.files]) {
      if (f.producedByStep === this.activeStepId) this.vfs.files.delete(p);
    }
    this.print("(step outputs cleared — inputs are untouched)");
    if (this.onReveal) this.onReveal();
  }

  runPipelineCommand(cmd, tokens, raw) {
    const step = STEP_RUNTIME[this.activeStepId];
    if (!step) {
      this.print(`No active step selected.`, "term-error");
      return;
    }
    const candidates = step.commands.filter((c) => c.binary === cmd);
    if (candidates.length === 0) {
      const expected = step.commands.map((c) => c.binary).join(", ");
      this.print(`"${cmd}" isn't used in this step. This step expects: ${expected}. Type 'help' or 'hint' if you're stuck.`, "term-error");
      return;
    }
    const match = candidates.length === 1 ? candidates[0] : candidates.find((c) => !c.match || c.match(tokens));
    if (!match) {
      this.print(`"${raw}" doesn't match an expected form for this step. Try 'hint'.`, "term-error");
      return;
    }
    const validator = VALIDATORS[match.validator];
    const result = validator(tokens, this.vfs, step);
    if (!result.ok) {
      this.print(result.message, "term-error");
      return;
    }
    this.print(result.message || "done.", "term-success");
    for (const entry of result.reveal || []) {
      const assetId = typeof entry === "string" ? entry : entry.id;
      const asset = this.assetMap[assetId];
      if (!asset) continue;
      const fileName = (typeof entry === "object" && entry.name) || basename(asset.url);
      const path = this.vfs.cwd + "/" + fileName;
      this.vfs.addFile(path, {
        assetId,
        size: asset.size || "",
        producedByStep: this.activeStepId,
        role: typeof entry === "object" ? entry.role : undefined,
        roleLabel: typeof entry === "object" ? entry.roleLabel : undefined,
        comparisonNote: typeof entry === "object" ? entry.comparisonNote : undefined,
      });
      this.printHTML(`✓ revealed: <span class="term-file">${fileName}</span> ${asset.dims ? `<span class="term-dim">(${asset.dims})</span>` : ""}`, "term-reveal");
      if (this.onReveal) this.onReveal(assetId, asset);
    }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
