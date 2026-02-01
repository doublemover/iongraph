import { migrate, type IonJSON, type Func, type SampleCounts } from "../src/iongraph.js";
import { must } from "../src/utils.js";
import { E } from "../src/dom.js";
import { GraphViewer } from "../src/GraphViewer.js";
import type { GraphDisplayOptions, GraphOptions } from "../src/Graph.js";

const searchParams = new URL(window.location.toString()).searchParams;

const initialFuncIndex = searchParams.has("func") ? parseInt(searchParams.get("func")!, 10) : undefined;
const initialPass = searchParams.has("pass") ? parseInt(searchParams.get("pass")!, 10) : undefined;
const displayStorageKey = "iongraph.displayOptions";

const defaultDisplayOptions: GraphDisplayOptions = {
  showInstructionIds: true,
  showTypes: true,
  showUseIds: true,
  compactMode: "default",
  collapseEmptyBlocks: false,
  liveRangesMode: false,
};

function loadDisplayOptions(): GraphDisplayOptions {
  try {
    const raw = window.localStorage.getItem(displayStorageKey);
    if (!raw) {
      return { ...defaultDisplayOptions };
    }
    const parsed = JSON.parse(raw) as Partial<GraphDisplayOptions>;
    const compactMode = parsed.compactMode;
    const normalizedCompactMode = (
      compactMode === "compact" || compactMode === "verbose" || compactMode === "default"
        ? compactMode
        : defaultDisplayOptions.compactMode
    );
    return {
      ...defaultDisplayOptions,
      ...parsed,
      compactMode: normalizedCompactMode,
    };
  } catch {
    return { ...defaultDisplayOptions };
  }
}

function saveDisplayOptions(options: GraphDisplayOptions) {
  try {
    window.localStorage.setItem(displayStorageKey, JSON.stringify(options));
  } catch {
    // Ignore persistence failures.
  }
}

interface MenuBarProps {
  browse?: boolean,
  export?: boolean,
  funcSelected: (func: Func | null) => void,
  displayOptions?: GraphDisplayOptions,
  displayOptionsChanged?: (options: GraphDisplayOptions) => void,
}

class MenuBar {
  root: HTMLElement;
  funcSelector: HTMLElement;
  funcSelectorNone: HTMLElement;
  funcName: HTMLElement;
  exportButton: HTMLButtonElement | null;
  displayOptions: GraphDisplayOptions | null;
  displayOptionsChanged: ((options: GraphDisplayOptions) => void) | null;
  displayControls: HTMLElement | null;
  displayInputs: {
    showInstructionIds: HTMLInputElement,
    showTypes: HTMLInputElement,
    showUseIds: HTMLInputElement,
    compactMode: HTMLSelectElement,
    collapseEmptyBlocks: HTMLInputElement,
    liveRangesMode: HTMLInputElement,
  } | null;

  ionjson: IonJSON | null;
  funcIndex: number;
  funcSelected: (func: Func | null) => void;

  constructor(props: MenuBarProps) {
    this.exportButton = null;
    this.displayOptions = props.displayOptions ? { ...props.displayOptions } : null;
    this.displayOptionsChanged = props.displayOptionsChanged ?? null;
    this.displayControls = null;
    this.displayInputs = null;

    this.ionjson = null;
    this.funcIndex = initialFuncIndex ?? 0;
    this.funcSelected = props.funcSelected;

    this.funcSelector = E("div", [], () => { }, [
      "Function",
      E("input", ["ig-w3"], input => {
        input.type = "number";
        input.min = "1";
        input.addEventListener("input", () => {
          this.switchFunc(parseInt(input.value, 10) - 1);
        });
      }, []),
      " / ",
      E("span", ["num-functions"]),
    ]);
    this.funcSelectorNone = E("div", [], () => { }, ["No functions to display."]);
    this.funcName = E("div");
    if (this.displayOptions && this.displayOptionsChanged) {
      const built = this.buildDisplayControls(this.displayOptions);
      this.displayControls = built.root;
      this.displayInputs = built.inputs;
    }

    this.root = E("div", ["ig-bb", "ig-flex", "ig-bg-white"], () => { }, [
      E("div", ["ig-pv2", "ig-ph3", "ig-flex", "ig-g2", "ig-items-center", "ig-br", "ig-hide-if-empty"], () => { }, [
        props.browse && E("div", [], () => { }, [
          E("input", [], input => {
            input.type = "file";
            input.addEventListener("change", e => {
              const input = e.target as HTMLInputElement;
              if (!input.files?.length) {
                return;
              }
              this.fileSelected(input.files[0]);
            });
          }),
        ]),
        this.funcSelector,
        this.funcSelectorNone,
      ]),
      E("div", ["ig-flex-grow-1", "ig-pv2", "ig-ph3", "ig-flex", "ig-g2", "ig-items-center"], () => { }, [
        this.funcName,
        E("div", ["ig-flex-grow-1"]),
        this.displayControls,
        props.export && E("div", [], () => { }, [
          E("button", [], button => {
            this.exportButton = button;
            button.addEventListener("click", () => {
              this.exportStandalone();
            });
          }, ["Export"]),
        ]),
      ]),
    ]);

    this.update();
  }

  private buildDisplayControls(options: GraphDisplayOptions) {
    const update = (next: GraphDisplayOptions) => {
      this.displayOptions = { ...next };
      this.displayOptionsChanged?.(this.displayOptions);
    };

    const makeCheckbox = (labelText: string, attr: keyof GraphDisplayOptions, dataId: string) => {
      const input = E("input", [], input => {
        input.type = "checkbox";
        input.checked = options[attr] as boolean;
        input.setAttribute("data-ig-display", dataId);
        input.addEventListener("change", () => {
          update({ ...must(this.displayOptions), [attr]: input.checked });
        });
      });
      const label = E("label", ["ig-flex", "ig-items-center", "ig-g1", "ig-f6"], () => { }, [
        input,
        labelText,
      ]);
      return { label, input };
    };

    const showInstructionIds = makeCheckbox("IDs", "showInstructionIds", "show-instruction-ids");
    const showTypes = makeCheckbox("Types", "showTypes", "show-types");
    const showUseIds = makeCheckbox("Use IDs", "showUseIds", "show-use-ids");
    const collapseEmptyBlocks = makeCheckbox("Collapse empty", "collapseEmptyBlocks", "collapse-empty-blocks");
    const liveRangesMode = makeCheckbox("Live ranges", "liveRangesMode", "live-ranges-mode");

    const compactMode = E("select", ["ig-f6"], select => {
      select.setAttribute("data-ig-display", "compact-mode");
      for (const mode of ["default", "compact", "verbose"]) {
        select.appendChild(E("option", [], option => {
          option.value = mode;
          option.innerText = mode;
        }));
      }
      select.value = options.compactMode;
      select.addEventListener("change", () => {
        update({ ...must(this.displayOptions), compactMode: select.value as GraphDisplayOptions["compactMode"] });
      });
    });

    const root = E("div", ["ig-flex", "ig-items-center", "ig-g2"], () => { }, [
      E("div", ["ig-f6", "ig-text-dim"], () => { }, ["Display"]),
      showInstructionIds.label,
      showTypes.label,
      showUseIds.label,
      E("label", ["ig-flex", "ig-items-center", "ig-g1", "ig-f6"], () => { }, [
        E("span", ["ig-text-dim"], () => { }, ["Mode"]),
        compactMode,
      ]),
      collapseEmptyBlocks.label,
      liveRangesMode.label,
    ]);

    return {
      root,
      inputs: {
        showInstructionIds: showInstructionIds.input,
        showTypes: showTypes.input,
        showUseIds: showUseIds.input,
        compactMode,
        collapseEmptyBlocks: collapseEmptyBlocks.input,
        liveRangesMode: liveRangesMode.input,
      },
    };
  }

  setDisplayOptions(options: GraphDisplayOptions) {
    if (!this.displayInputs) {
      return;
    }
    this.displayOptions = { ...options };
    this.displayInputs.showInstructionIds.checked = options.showInstructionIds;
    this.displayInputs.showTypes.checked = options.showTypes;
    this.displayInputs.showUseIds.checked = options.showUseIds;
    this.displayInputs.compactMode.value = options.compactMode;
    this.displayInputs.collapseEmptyBlocks.checked = options.collapseEmptyBlocks;
    this.displayInputs.liveRangesMode.checked = options.liveRangesMode;
  }

  async fileSelected(file: File) {
    const newJSON = JSON.parse(await file.text());
    this.ionjson = migrate(newJSON);
    this.switchFunc(0);
    this.update();
  }

  switchIonJSON(ionjson: IonJSON) {
    this.ionjson = ionjson;
    this.switchFunc(this.funcIndex);
  }

  switchFunc(funcIndex: number) {
    funcIndex = Math.max(0, Math.min(this.numFunctions() - 1, funcIndex));
    this.funcIndex = isNaN(funcIndex) ? 0 : funcIndex;
    this.funcSelected(this.ionjson?.functions[this.funcIndex] ?? null);
    this.update();
  }

  numFunctions() {
    return this.ionjson?.functions.length ?? 0;
  }

  update() {
    const funcIndexValid = 0 <= this.funcIndex && this.funcIndex < this.numFunctions();

    this.funcSelector.hidden = this.numFunctions() <= 1;
    this.funcSelectorNone.hidden = !(this.ionjson && this.numFunctions() === 0);

    const funcInput = this.funcSelector.querySelector("input")!;
    funcInput.max = `${this.numFunctions()}`;
    funcInput.value = `${this.funcIndex + 1}`;
    this.funcSelector.querySelector(".num-functions")!.innerHTML = `${this.numFunctions()}`;

    this.funcName.hidden = !funcIndexValid;
    this.funcName.innerText = `${this.ionjson?.functions[this.funcIndex].name ?? ""}`;

    if (this.exportButton) {
      this.exportButton.disabled = !this.ionjson || !funcIndexValid;
    }
  }

  async exportStandalone() {
    const ion = must(this.ionjson);
    const name = ion.functions[this.funcIndex].name;
    const result: IonJSON = { version: 1, functions: [ion.functions[this.funcIndex]] };

    const template = await (await fetch("./standalone.html")).text();
    const output = template.replace(/\{\{\s*IONJSON\s*\}\}/, JSON.stringify(result));
    const url = URL.createObjectURL(new Blob([output], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `iongraph-${name}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

export class WebUI {
  root: HTMLElement;
  menuBar: MenuBar;
  graphContainer: HTMLElement;

  func: Func | null;
  sampleCountsFromFile: SampleCounts | undefined;
  graph: GraphViewer | null;
  graphOptions: GraphOptions;
  displayOptions: GraphDisplayOptions;

  constructor() {
    this.displayOptions = loadDisplayOptions();
    const collapseParam = searchParams.get("collapseEmptyBlocks");
    if (collapseParam === "1" || collapseParam === "true") {
      this.displayOptions.collapseEmptyBlocks = true;
    }

    this.graphOptions = { display: this.displayOptions };

    this.menuBar = new MenuBar({
      browse: true,
      export: true,
      funcSelected: f => this.switchFunc(f),
      displayOptions: this.displayOptions,
      displayOptionsChanged: options => this.updateDisplayOptions(options),
    });

    this.func = null;
    this.sampleCountsFromFile = undefined;
    this.graph = null;
    this.menuBar.setDisplayOptions(this.displayOptions);

    this.loadStuffFromQueryParams();

    this.graphContainer = E("div", ["ig-relative", "ig-flex-basis-0", "ig-flex-grow-1", "ig-overflow-hidden"]);
    this.root = E("div", ["ig-absolute", "ig-absolute-fill", "ig-flex", "ig-flex-column"], () => { }, [
      this.menuBar.root,
      this.graphContainer,
    ]);

    this.update();
  }

  update() {
    if (this.graph) {
      this.graph.destroy();
    }
    if (this.func) {
      this.graph = new GraphViewer(this.graphContainer, {
        func: this.func,
        pass: initialPass,
        sampleCounts: this.sampleCountsFromFile,
        graphOptions: this.graphOptions,
      });
    }
  }

  loadStuffFromQueryParams() {
    (async () => {
      const searchFile = searchParams.get("file");
      if (searchFile) {
        const res = await fetch(searchFile);
        const json = await res.json();

        const migrated = migrate(json);
        this.menuBar.switchIonJSON(migrated); // will call funcSelected
      }
    })();
    (async () => {
      const sampleCountsFile = searchParams.get("sampleCounts");
      if (sampleCountsFile) {
        const res = await fetch(sampleCountsFile);
        const json = await res.json();
        this.sampleCountsFromFile = {
          selfLineHits: new Map(json["selfLineHits"]),
          totalLineHits: new Map(json["totalLineHits"]),
        };
        this.update();
      }
    })();
  }

  switchFunc(func: Func | null) {
    this.func = func;
    this.update();
  }

  updateDisplayOptions(options: GraphDisplayOptions) {
    this.displayOptions = { ...options };
    this.graphOptions = { display: this.displayOptions };
    saveDisplayOptions(this.displayOptions);
    if (this.graph) {
      this.graph.setGraphOptions(this.graphOptions);
    } else {
      this.update();
    }
  }
}

export class StandaloneUI {
  root: HTMLElement;
  menuBar: MenuBar;
  graphContainer: HTMLElement;

  func: Func | null;
  graph: GraphViewer | null;
  graphOptions: GraphOptions;
  displayOptions: GraphDisplayOptions;

  constructor() {
    this.menuBar = new MenuBar({
      funcSelected: f => this.switchFunc(f),
    });

    this.func = null;
    this.graph = null;
    this.displayOptions = { ...defaultDisplayOptions };
    this.graphOptions = { display: this.displayOptions };

    this.graphContainer = E("div", ["ig-relative", "ig-flex-basis-0", "ig-flex-grow-1", "ig-overflow-hidden"]);
    this.root = E("div", ["ig-absolute", "ig-absolute-fill", "ig-flex", "ig-flex-column"], () => { }, [
      this.menuBar.root,
      this.graphContainer,
    ]);
  }

  update() {
    if (this.graph) {
      this.graph.destroy();
    }
    if (this.func) {
      this.graph = new GraphViewer(this.graphContainer, {
        func: this.func,
        pass: initialPass,
        graphOptions: this.graphOptions,
      });
    }
  }

  setIonJSON(ion: IonJSON) {
    this.menuBar.switchIonJSON(ion)
  }

  switchFunc(func: Func | null) {
    this.func = func;
    this.update();
  }
}
