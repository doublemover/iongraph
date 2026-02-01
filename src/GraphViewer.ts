import { dequal } from "./dequal.js";
import { E } from "./dom.js";
import { Graph, type GraphOptions, type GraphState, type InspectTarget } from "./Graph.js";
import type { BlockPtr, Func, Pass, SampleCounts } from "./iongraph.js";

type KeyPasses = [number | null, number | null, number | null, number | null];
type PaletteMode = "search" | "block" | "instruction";

type SearchEntry = {
  kind: "block" | "instruction",
  id: number,
  ptr?: BlockPtr,
  label: string,
  searchText: string,
};

export interface GraphViewerProps {
  func: Func,
  pass?: number,

  sampleCounts?: SampleCounts,
  graphOptions?: GraphOptions,
}

export class GraphViewer {
  func: Func;
  passNumber: number;
  keyPasses: KeyPasses;
  redundantPasses: number[];
  sampleCounts: SampleCounts | undefined;
  graphOptions: GraphOptions;
  passStates: Map<number, GraphState>;
  renderedPassNumber: number | null;
  searchIndex: SearchEntry[];

  container: HTMLDivElement;
  viewport: HTMLDivElement;
  graph: Graph | null;
  sidebarLinks: HTMLAnchorElement[];
  commandPaletteRoot: HTMLDivElement;
  commandPaletteInput: HTMLInputElement;
  commandPaletteResults: HTMLDivElement;
  commandPaletteMode: PaletteMode;
  commandPaletteOpen: boolean;
  commandPaletteItems: SearchEntry[];
  commandPaletteSelectedIndex: number;
  inspectorRoot: HTMLDivElement;
  inspectorTitle: HTMLDivElement;
  inspectorBody: HTMLDivElement;
  inspectorRaw: HTMLPreElement;

  constructor(root: HTMLElement, {
    func,
    pass = 0,

    sampleCounts,
    graphOptions
  }: GraphViewerProps) {
    this.graph = null;
    this.func = func;
    this.passNumber = pass;
    this.sampleCounts = sampleCounts;
    this.graphOptions = graphOptions ?? {};
    this.passStates = new Map();
    this.renderedPassNumber = null;
    this.searchIndex = [];
    this.commandPaletteMode = "search";
    this.commandPaletteOpen = false;
    this.commandPaletteItems = [];
    this.commandPaletteSelectedIndex = -1;

    this.keyPasses = [null, null, null, null];
    {
      let lastPass: Pass | null = null;
      for (const [i, pass] of func.passes.entries()) {
        if (pass.mir.blocks.length > 0) {
          if (this.keyPasses[0] === null) {
            this.keyPasses[0] = i;
          }
          if (pass.lir.blocks.length === 0) {
            this.keyPasses[1] = i;
          }
        }
        if (pass.lir.blocks.length > 0) {
          if (lastPass?.lir.blocks.length === 0) {
            this.keyPasses[2] = i;
          }
          this.keyPasses[3] = i;
        }

        lastPass = pass;
      }
    }

    this.redundantPasses = [];
    {
      let lastPass: Pass | null = null;
      for (const [i, pass] of func.passes.entries()) {
        if (lastPass === null) {
          lastPass = pass;
          continue;
        }

        if (dequal(lastPass.mir, pass.mir) && dequal(lastPass.lir, pass.lir)) {
          this.redundantPasses.push(i);
        }

        lastPass = pass;
      }
    }

    this.viewport = E("div", ["ig-flex-grow-1", "ig-overflow-hidden"], div => {
      div.style.position = "relative";
    })

    this.inspectorTitle = E("div", ["ig-inspector-title"], () => { }, ["Inspector"]);
    this.inspectorBody = E("div", ["ig-inspector-body"]);
    this.inspectorRaw = E("pre", ["ig-inspector-raw"]);
    const inspectorDetails = E("details", ["ig-inspector-details"], () => { }, [
      E("summary", [], () => { }, ["Raw JSON"]),
      this.inspectorRaw,
    ]);
    this.inspectorRoot = E("div", ["ig-inspector", "ig-bl", "ig-bg-white"], () => { }, [
      this.inspectorTitle,
      this.inspectorBody,
      inspectorDetails,
    ]);
    this.renderInspectorEmpty();
    this.sidebarLinks = func.passes.map((pass, i) => (
      E("a", ["ig-link-normal", "ig-pv1", "ig-ph2", "ig-flex", "ig-g2"], a => {
        a.href = "#";
        a.addEventListener("click", e => {
          e.preventDefault();
          this.switchPass(i);
        });
      }, [
        E("div", ["ig-w1", "ig-tr", "ig-f6", "ig-text-dim"], div => {
          div.style.paddingTop = "0.08rem";
        }, [`${i}`]),
        E("div", [this.redundantPasses.includes(i) && "ig-text-dim"], () => { }, [pass.name]),
      ])
    ));
    this.container = E("div", ["ig-absolute", "ig-absolute-fill", "ig-flex"], () => { }, [
      E("div", ["ig-w5", "ig-br", "ig-flex-shrink-0", "ig-overflow-y-auto", "ig-bg-white"], () => { }, [
        ...this.sidebarLinks,
      ]),
      this.viewport,
      this.inspectorRoot,
    ]);
    root.appendChild(this.container);

    this.commandPaletteInput = E("input", ["ig-command-input"], input => {
      input.type = "text";
      input.addEventListener("input", () => {
        this.updateCommandPaletteResults();
      });
    });
    this.commandPaletteResults = E("div", ["ig-command-results"]);
    const commandPanel = E("div", ["ig-command-panel"], () => { }, [
      this.commandPaletteInput,
      this.commandPaletteResults,
    ]);
    this.commandPaletteRoot = E("div", ["ig-command-palette"], div => {
      div.hidden = true;
    }, [commandPanel]);
    this.container.appendChild(this.commandPaletteRoot);

    this.keydownHandler = this.keydownHandler.bind(this);
    this.tweakHandler = this.tweakHandler.bind(this);
    window.addEventListener("keydown", this.keydownHandler);
    window.addEventListener("tweak", this.tweakHandler);

    this.update();
  }

  destroy() {
    this.container.remove();
    window.removeEventListener("keydown", this.keydownHandler);
    window.removeEventListener("tweak", this.tweakHandler);
  }

  setGraphOptions(graphOptions: GraphOptions) {
    this.graphOptions = graphOptions;
    this.update();
  }

  update() {
    // Update sidebar
    for (const [i, link] of this.sidebarLinks.entries()) {
      link.classList.toggle("ig-bg-primary", this.passNumber === i);
    }

    if (this.commandPaletteOpen) {
      this.closeCommandPalette();
    }
    this.renderInspectorEmpty();

    // Update graph
    const previousState = this.graph?.exportState();
    const previousPass = this.renderedPassNumber;
    if (previousState && previousPass !== null) {
      this.passStates.set(previousPass, previousState);
    }
    this.viewport.innerHTML = "";
    this.graph = null;
    this.renderedPassNumber = null;
    const pass: Pass | undefined = this.func.passes[this.passNumber];
    if (pass) {
      try {
        this.graph = new Graph(this.viewport, pass, {
          ...this.graphOptions,
          sampleCounts: this.sampleCounts,
          onInspect: target => this.showInspector(target),
        });
        this.renderedPassNumber = this.passNumber;
        const storedState = this.passStates.get(this.passNumber);
        const stateToRestore = storedState ?? previousState;
        if (stateToRestore) {
          const hasSelected = Boolean(
            storedState
              && storedState.lastSelectedBlockPtr
              && this.graph.blocksByPtr.has(storedState.lastSelectedBlockPtr)
          );
          this.graph.restoreState(stateToRestore, { preserveSelectedBlockPosition: hasSelected });
        }
        this.buildSearchIndex();
      } catch (e) {
        this.viewport.innerHTML = "An error occurred while laying out the graph. See console.";
        console.error(e);
      }
    } else {
      this.searchIndex = [];
    }
  }

  private renderInspectorEmpty() {
    this.inspectorTitle.innerText = "Inspector";
    this.inspectorBody.innerHTML = "";
    this.inspectorBody.appendChild(E("div", ["ig-text-dim", "ig-f6"], () => { }, [
      "Select a block or instruction.",
    ]));
    this.inspectorRaw.textContent = "";
  }

  private showInspector(target: InspectTarget) {
    const rows: [string, string][] = [];
    let raw: unknown = target;

    const formatSource = (source?: { script?: string, line?: number, column?: number, bytecodeOffset?: number }) => {
      if (!source) {
        return null;
      }
      const parts: string[] = [];
      if (source.script) {
        parts.push(source.script);
      }
      if (source.line !== undefined) {
        parts.push(`${source.line}${source.column !== undefined ? `:${source.column}` : ""}`);
      }
      if (source.bytecodeOffset !== undefined) {
        parts.push(`bc:${source.bytecodeOffset}`);
      }
      return parts.join(" ");
    };

    if (target.kind === "block") {
      this.inspectorTitle.innerText = `Block ${target.block.id}`;
      rows.push(["Loop depth", String(target.block.loopDepth)]);
      if (target.block.attributes.length > 0) {
        rows.push(["Attributes", target.block.attributes.join(", ")]);
      }
      const source = formatSource(target.block.source);
      if (source) {
        rows.push(["Source", source]);
      }
      raw = { kind: target.kind, block: target.block, lir: target.lir ?? null };
    } else if (target.kind === "mir-instruction") {
      this.inspectorTitle.innerText = `MIR #${target.instruction.id}`;
      rows.push(["Opcode", target.instruction.opcode]);
      if (target.instruction.type) {
        rows.push(["Type", target.instruction.type]);
      }
      const source = formatSource(target.instruction.source);
      if (source) {
        rows.push(["Source", source]);
      }
      raw = { kind: target.kind, instruction: target.instruction };
    } else if (target.kind === "lir-instruction") {
      this.inspectorTitle.innerText = `LIR #${target.instruction.id}`;
      rows.push(["Opcode", target.instruction.opcode]);
      if (target.instruction.mirPtr !== null) {
        rows.push(["MIR ptr", String(target.instruction.mirPtr)]);
      }
      const source = formatSource(target.instruction.source);
      if (source) {
        rows.push(["Source", source]);
      }
      raw = { kind: target.kind, instruction: target.instruction };
    } else {
      this.inspectorTitle.innerText = `Vreg ${target.liveRange.vreg}`;
      if (target.liveRange.reg) {
        rows.push(["Register", target.liveRange.reg]);
      }
      if (target.liveRange.intervals.length > 0) {
        const intervals = target.liveRange.intervals.map(interval => `${interval.start}–${interval.end}`).join(", ");
        rows.push(["Intervals", intervals]);
      }
      raw = { kind: target.kind, liveRange: target.liveRange };
    }

    this.inspectorBody.innerHTML = "";
    if (rows.length > 0) {
      const list = E("dl", ["ig-inspector-list"]);
      for (const [label, value] of rows) {
        list.appendChild(E("dt", ["ig-text-dim"], () => { }, [label]));
        list.appendChild(E("dd", [], () => { }, [value]));
      }
      this.inspectorBody.appendChild(list);
    }
    this.inspectorRaw.textContent = JSON.stringify(raw, null, 2);
  }

  switchPass(pass: number) {
    this.passNumber = pass;
    this.update();
  }

  private buildSearchIndex() {
    this.searchIndex = [];
    if (!this.graph) {
      return;
    }

    for (const block of this.graph.blocks) {
      let desc = "";
      if (block.mir.attributes.includes("loopheader")) {
        desc = " (loop header)";
      } else if (block.mir.attributes.includes("backedge")) {
        desc = " (backedge)";
      } else if (block.mir.attributes.includes("splitedge")) {
        desc = " (split edge)";
      }
      const blockLabel = `Block ${block.id}${desc}`;
      this.searchIndex.push({
        kind: "block",
        id: block.id,
        ptr: block.ptr,
        label: blockLabel,
        searchText: blockLabel.toLowerCase(),
      });

      const instructions = block.lir ? block.lir.instructions : block.mir.instructions;
      const prefix = block.lir ? "LIR" : "MIR";
      for (const ins of instructions) {
        const label = `${prefix} #${ins.id} ${ins.opcode}`;
        this.searchIndex.push({
          kind: "instruction",
          id: ins.id,
          label,
          searchText: label.toLowerCase(),
        });
      }
    }
  }

  private openCommandPalette(mode: PaletteMode) {
    this.commandPaletteMode = mode;
    this.commandPaletteOpen = true;
    this.commandPaletteRoot.hidden = false;
    this.commandPaletteRoot.style.display = "flex";
    this.commandPaletteInput.value = "";
    this.commandPaletteInput.placeholder = (
      mode === "search"
        ? "Search blocks and instructions"
        : mode === "block"
          ? "Go to block id"
          : "Go to instruction id"
    );
    this.updateCommandPaletteResults();
    this.commandPaletteInput.focus();
  }

  private closeCommandPalette() {
    this.commandPaletteOpen = false;
    this.commandPaletteRoot.hidden = true;
    this.commandPaletteRoot.style.display = "none";
    this.commandPaletteItems = [];
    this.commandPaletteSelectedIndex = -1;
    this.commandPaletteResults.innerHTML = "";
  }

  private updateCommandPaletteResults() {
    const query = this.commandPaletteInput.value.trim();
    const queryLower = query.toLowerCase();
    let results: SearchEntry[] = [];

    if (this.commandPaletteMode === "search") {
      if (queryLower.length > 0) {
        results = this.searchIndex.filter(entry => entry.searchText.includes(queryLower)).slice(0, 20);
      }
    } else if (this.commandPaletteMode === "block") {
      const id = Number.parseInt(query, 10);
      if (!Number.isNaN(id)) {
        results = this.searchIndex.filter(entry => entry.kind === "block" && entry.id === id);
      }
    } else {
      const id = Number.parseInt(query, 10);
      if (!Number.isNaN(id)) {
        results = this.searchIndex.filter(entry => entry.kind === "instruction" && entry.id === id);
      }
    }

    this.commandPaletteItems = results;
    this.commandPaletteSelectedIndex = results.length > 0 ? 0 : -1;
    this.renderCommandPaletteResults(query.length > 0);
  }

  private renderCommandPaletteResults(hasQuery: boolean) {
    this.commandPaletteResults.innerHTML = "";
    if (this.commandPaletteItems.length === 0) {
      if (!hasQuery) {
        return;
      }
      this.commandPaletteResults.appendChild(E("div", ["ig-command-result", "ig-command-result-empty"], () => { }, [
        "No matches",
      ]));
      return;
    }

    this.commandPaletteItems.forEach((item, index) => {
      const row = E("div", ["ig-command-result", index === this.commandPaletteSelectedIndex && "ig-command-result-selected"], div => {
        div.addEventListener("click", () => {
          this.commandPaletteSelectedIndex = index;
          this.executeCommandPaletteSelection();
        });
      }, [item.label]);
      this.commandPaletteResults.appendChild(row);
    });
  }

  private moveCommandPaletteSelection(delta: number) {
    if (this.commandPaletteItems.length === 0) {
      return;
    }
    const next = this.commandPaletteSelectedIndex + delta;
    if (next < 0 || next >= this.commandPaletteItems.length) {
      return;
    }
    this.commandPaletteSelectedIndex = next;
    this.renderCommandPaletteResults(true);
  }

  private executeCommandPaletteSelection() {
    const item = this.commandPaletteItems[this.commandPaletteSelectedIndex];
    if (!item || !this.graph) {
      return;
    }
    if (item.kind === "block" && item.ptr !== undefined) {
      this.graph.setSelection([], item.ptr);
      void this.graph.jumpToBlock(item.ptr);
    } else if (item.kind === "instruction") {
      void this.graph.jumpToInstruction(item.id, { zoom: 1 });
    }
    this.closeCommandPalette();
  }

  keydownHandler(e: KeyboardEvent) {
    if (this.commandPaletteOpen) {
      switch (e.key) {
        case "Escape": {
          e.preventDefault();
          this.closeCommandPalette();
        } break;
        case "Enter": {
          e.preventDefault();
          this.executeCommandPaletteSelection();
        } break;
        case "ArrowDown": {
          e.preventDefault();
          this.moveCommandPaletteSelection(1);
        } break;
        case "ArrowUp": {
          e.preventDefault();
          this.moveCommandPaletteSelection(-1);
        } break;
      }
      return;
    }

    switch (e.key) {
      case "/": {
        e.preventDefault();
        this.openCommandPalette("search");
      } break;
      case "g": {
        e.preventDefault();
        this.openCommandPalette("block");
      } break;
      case "i": {
        e.preventDefault();
        this.openCommandPalette("instruction");
      } break;
      case "w":
      case "s": {
        this.graph?.navigate(e.key === "s" ? "down" : "up");
        this.graph?.jumpToBlock(this.graph.lastSelectedBlockPtr);
      } break;
      case "a":
      case "d": {
        this.graph?.navigate(e.key === "d" ? "right" : "left");
        this.graph?.jumpToBlock(this.graph.lastSelectedBlockPtr);
      } break;

      case "f": {
        for (let i = this.passNumber + 1; i < this.func.passes.length; i++) {
          if (!this.redundantPasses.includes(i)) {
            this.switchPass(i);
            break;
          }
        }
      } break;
      case "r": {
        for (let i = this.passNumber - 1; i >= 0; i--) {
          if (!this.redundantPasses.includes(i)) {
            this.switchPass(i);
            break;
          }
        }
      } break;
      case "1":
      case "2":
      case "3":
      case "4": {
        const keyPassIndex = ["1", "2", "3", "4"].indexOf(e.key);
        const keyPass = this.keyPasses[keyPassIndex];
        if (typeof keyPass === "number") {
          this.switchPass(keyPass);
        }
      } break;

      case "c": {
        const selected = this.graph?.blocksByPtr.get(this.graph?.lastSelectedBlockPtr ?? -1 as BlockPtr);
        if (selected) {
          this.graph?.jumpToBlock(selected.ptr, { zoom: 1 });
        }
      } break;
    };
  }

  tweakHandler() {
    this.update();
  }
}
