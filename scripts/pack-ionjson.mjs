import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/pack-ionjson.mjs <input.json> <output.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(inputPath, "utf8"));
if (!data || typeof data !== "object") {
  console.error("Invalid input JSON.");
  process.exit(1);
}

const strings = [];
const stringIndex = new Map();
const intern = value => {
  const str = String(value ?? "");
  const existing = stringIndex.get(str);
  if (existing !== undefined) {
    return existing;
  }
  const index = strings.length;
  strings.push(str);
  stringIndex.set(str, index);
  return index;
};

const packMirInstruction = ins => ([
  ins.ptr,
  ins.id,
  intern(ins.opcode),
  (ins.attributes ?? []).map(intern),
  ins.inputs ?? [],
  ins.uses ?? [],
  ins.memInputs ?? [],
  intern(ins.type ?? ""),
]);

const packMirBlock = block => ([
  block.ptr,
  block.id,
  block.loopDepth ?? 0,
  (block.attributes ?? []).map(intern),
  block.predecessors ?? [],
  block.successors ?? [],
  (block.instructions ?? []).map(packMirInstruction),
]);

const packLirInstruction = ins => ([
  ins.ptr,
  ins.id,
  ins.mirPtr ?? null,
  intern(ins.opcode),
  ins.defs ?? [],
]);

const packLirBlock = block => ([
  block.ptr,
  block.id,
  (block.instructions ?? []).map(packLirInstruction),
]);

const packPass = pass => ([
  intern(pass.name),
  (pass.mir?.blocks ?? []).map(packMirBlock),
  (pass.lir?.blocks ?? []).map(packLirBlock),
  pass.liveRanges ?? null,
]);

const packFunc = func => ([
  intern(func.name),
  (func.passes ?? []).map(packPass),
]);

const packed = {
  version: 2,
  strings,
  functions: (data.functions ?? []).map(packFunc),
};

writeFileSync(outputPath, JSON.stringify(packed, null, 2));
