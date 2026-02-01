export const currentVersion = 1 as const;

export interface IonJSON {
  version: number,
  normalizedVersion?: typeof currentVersion,
  functions: Func[],
}

export interface IonJSONv1 extends IonJSON {
  version: 1,
}

export type StringIndex = number;

export type MIRInstructionV2 = [
  InsPtr,
  InsID,
  StringIndex,
  StringIndex[],
  number[],
  number[],
  unknown[],
  StringIndex,
];

export type MIRBlockV2 = [
  BlockPtr,
  BlockID,
  number,
  StringIndex[],
  BlockID[],
  BlockID[],
  MIRInstructionV2[],
];

export type LIRInstructionV2 = [
  InsPtr,
  InsID,
  InsPtr | null,
  StringIndex,
  number[],
];

export type LIRBlockV2 = [
  BlockPtr,
  BlockID,
  LIRInstructionV2[],
];

export type PassV2 = [
  StringIndex,
  MIRBlockV2[],
  LIRBlockV2[],
  (LiveRanges | null)?,
];

export type FuncV2 = [
  StringIndex,
  PassV2[],
];

export interface IonJSONv2 {
  version: 2,
  strings: string[],
  functions: FuncV2[],
}

export interface Func {
  name: string,
  passes: Pass[],
}

export interface Pass {
  name: string,
  mir: {
    blocks: MIRBlock[],
  },
  lir: {
    blocks: LIRBlock[],
  },
  liveRanges?: LiveRanges,
}

export type BlockPtr = number & { readonly __brand: "BlockPtr" }
export type BlockID = number & { readonly __brand: "BlockID" }
export type InsPtr = number & { readonly __brand: "InsPtr" }
export type InsID = number & { readonly __brand: "InsID" }

export interface MIRBlock {
  ptr: BlockPtr,
  id: BlockID,
  loopDepth: number,
  attributes: string[],
  predecessors: BlockID[],
  successors: BlockID[],
  instructions: MIRInstruction[],
  source?: SourceLoc,
  metadata?: Record<string, unknown>,
}

export interface MIRInstruction {
  ptr: InsPtr,
  id: InsID,
  opcode: string,
  attributes: string[],
  inputs: number[],
  uses: number[],
  memInputs: unknown[], // TODO
  type: string,
  source?: SourceLoc,
  metadata?: Record<string, unknown>,
}

export interface LIRBlock {
  ptr: BlockPtr,
  id: BlockID,
  instructions: LIRInstruction[],
}

export interface LIRInstruction {
  ptr: InsPtr,
  id: InsID,
  mirPtr: number | null,
  opcode: string,
  defs: number[],
  source?: SourceLoc,
  metadata?: Record<string, unknown>,
}

export interface SourceLoc {
  script?: string,
  line?: number,
  column?: number,
  bytecodeOffset?: number,
  inlineStack?: SourceLoc[],
}

export interface LiveRangeInterval {
  start: number,
  end: number,
}

export interface LiveRange {
  vreg: string,
  intervals: LiveRangeInterval[],
  reg?: string,
}

export interface LiveRanges {
  vregs: LiveRange[],
}

export interface SampleCounts {
  selfLineHits: Map<number, number>,
  totalLineHits: Map<number, number>,
}

function inflateV2ToV1(ionJSON: IonJSONv2): IonJSON {
  const strings = ionJSON.strings ?? [];
  const getString = (index: number) => strings[index] ?? "";

  return {
    version: currentVersion,
    normalizedVersion: currentVersion,
    functions: ionJSON.functions.map(([funcNameIndex, passes]) => ({
      name: getString(funcNameIndex),
      passes: passes.map(([passNameIndex, mirBlocks, lirBlocks, liveRanges]) => ({
        name: getString(passNameIndex),
        mir: {
          blocks: mirBlocks.map(([ptr, id, loopDepth, attrIdxs, preds, succs, instructions]) => ({
            ptr: ptr as any as BlockPtr,
            id: id as any as BlockID,
            loopDepth,
            attributes: (attrIdxs ?? []).map(getString),
            predecessors: preds as any as BlockID[],
            successors: succs as any as BlockID[],
            instructions: instructions.map(ins => {
              const memInputs = ins[6] ?? [];
              const typeIndex = ins[7] ?? -1;
              return {
                ptr: ins[0] as any as InsPtr,
                id: ins[1] as any as InsID,
                opcode: getString(ins[2]),
                attributes: (ins[3] ?? []).map(getString),
                inputs: ins[4] ?? [],
                uses: ins[5] ?? [],
                memInputs,
                type: typeIndex >= 0 ? getString(typeIndex) : "",
              };
            }),
          })),
        },
        lir: {
          blocks: lirBlocks.map(([ptr, id, instructions]) => ({
            ptr: ptr as any as BlockPtr,
            id: id as any as BlockID,
            instructions: instructions.map(ins => ({
              ptr: ins[0] as any as InsPtr,
              id: ins[1] as any as InsID,
              mirPtr: ins[2] ?? null,
              opcode: getString(ins[3]),
              defs: ins[4] ?? [],
            })),
          })),
        },
        liveRanges: liveRanges ?? undefined,
      })),
    })),
  };
}

/**
 * Migrate ion JSON data to the latest version of the schema. A history of
 * schema changes can be found at the end of the file.
 */
export function migrate(ionJSON: any): IonJSON {
  if (ionJSON.version === undefined) {
    ionJSON.version = 0;
  }

  const sourceVersion = ionJSON.version;
  let normalized: IonJSON;
  if (sourceVersion === 2) {
    normalized = inflateV2ToV1(ionJSON as IonJSONv2);
  } else {
    normalized = ionJSON as IonJSON;
  }

  const migrationVersion = sourceVersion === 2 ? currentVersion : sourceVersion;
  for (const f of normalized.functions) {
    migrateFunc(f, migrationVersion);
  }

  normalized.version = sourceVersion === 2 ? 2 : currentVersion;
  normalized.normalizedVersion = currentVersion;
  return normalized;
}

function migrateFunc(f: any, version: number): Func {
  for (const p of f.passes) {
    for (const b of p.mir.blocks) {
      migrateMIRBlock(b, version);
    }
    for (const b of p.lir.blocks) {
      migrateLIRBlock(b, version);
    }
  }

  return f;
}

function migrateMIRBlock(b: any, version: number): MIRBlock {
  if (version === 0) {
    b.ptr = ((b.id ?? b.number) + 1) as any as BlockPtr;
    b.id = b.number;
  }

  for (const ins of b.instructions) {
    migrateMIRInstruction(ins, version);
  }

  return b;
}

function migrateMIRInstruction(ins: any, version: number): MIRInstruction {
  if (version === 0) {
    ins.ptr = ins.id;
  }

  return ins;
}

function migrateLIRBlock(b: any, version: number): MIRBlock {
  if (version === 0) {
    b.ptr = (b.id ?? b.number) as any as BlockPtr;
    b.id = b.number;
  }

  for (const ins of b.instructions) {
    migrateLIRInstruction(ins, version);
  }

  return b;
}

function migrateLIRInstruction(ins: any, version: number): LIRInstruction {
  if (version === 0) {
    ins.ptr = ins.id;
    ins.mirPtr = null;
  }

  return ins;
}

/*
# History of the ion.json schema

- Version 0: "Legacy" ion.json as used by sstangl's iongraph tool. Never
  explicitly versioned.

- Version 1: Created for the release of the web-based iongraph tool. The first
  explicitly-versioned schema. Key changes:
  - Renamed "number" to "id" on MIR and LIR blocks for consistency with C++.
  - Added "ptr" to MIR blocks and MIR and LIR instructions for stable
    identification across passes. LIR blocks do not need this because they are
    stably identified by their corresponding MIR block.
  - Added "mirPtr" to LIR instructions so that they can be traced back to their
    MIR instruction. May be null.

- Version 2: Compact schema with string tables and tuple encoding. The viewer
  inflates this format to a normalized v1-shaped representation, keeping
  `version: 2` and setting `normalizedVersion` to the current version.

*/
