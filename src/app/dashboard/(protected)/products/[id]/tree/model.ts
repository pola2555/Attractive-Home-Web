import type { TemplateDef } from '@/lib/configurator/types';

// Shapes the tree editor needs: builds, their questions + answers, upgrades and
// size steps, all carrying the ids the edit controls post back. Derived from the
// engine's TemplateDef so the same read that prices a door also draws it.

export type AnswerVM = { id: string; name: string; colorHex: string | null };
export type QuestionVM = {
  optionId: string;
  name: string;
  kind: string;
  unit: string | null;
  answers: AnswerVM[];
};
export type UpgradeVM = { id: string; label: string; amount: number; unit: string };
export type SizeStepVM = {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
  amount: number;
  measure: string;
};
export type NumberQ = { optionId: string; name: string };

export type BuildVM = {
  variantId: string;
  code: string;
  name: string;
  includedSpec: string | null;
  questions: QuestionVM[];
  numberQuestions: NumberQ[];
  hasGrid: boolean;
  gridAxes: string[];
  cellCount: number;
  upgrades: UpgradeVM[];
  sizeSteps: SizeStepVM[];
};

export type SharedVM = {
  questions: QuestionVM[];
  numberQuestions: NumberQ[];
  upgrades: UpgradeVM[];
  sizeSteps: SizeStepVM[];
};

export type EditorModel = { currency: string; builds: BuildVM[]; shared: SharedVM };

type Options = TemplateDef['options'];

export function buildEditorModel(def: TemplateDef): EditorModel {
  const variants = def.variants ?? [];
  const upgrades = def.upgrades ?? [];
  const bands = def.bands ?? [];
  const nameByGroup = new Map(def.options.map((o) => [o.groupCode, o.name]));

  const questionVM = (o: Options[number]): QuestionVM => ({
    optionId: o.id,
    name: o.name,
    kind: o.inputKind,
    unit: o.unit,
    answers: o.values.map((v) => ({ id: v.id, name: v.name, colorHex: v.colorHex })),
  });
  const numberQs = (opts: Options): NumberQ[] =>
    opts.filter((o) => o.inputKind === 'number').map((o) => ({ optionId: o.id, name: o.name }));
  const upVM = (variantCode: string | null): UpgradeVM[] =>
    upgrades
      .filter((u) => u.variantCode === variantCode)
      .map((u) => ({ id: u.id, label: u.label, amount: u.amount, unit: u.unit }));
  const stepVM = (variantCode: string | null): SizeStepVM[] =>
    bands
      .filter((b) => b.variantCode === variantCode)
      .map((b) => ({
        id: b.id,
        label: b.label,
        min: b.min,
        max: b.max,
        amount: b.amount,
        measure: nameByGroup.get(b.groupCode) ?? b.groupCode,
      }));

  const builds: BuildVM[] = variants.map((v) => {
    const opts = def.options.filter((o) => o.variantCode === v.code);
    return {
      variantId: v.id,
      code: v.code,
      name: v.name,
      includedSpec: v.includedSpec,
      questions: opts.map(questionVM),
      numberQuestions: numberQs(opts),
      hasGrid: Boolean(v.grid && v.grid.axes.length),
      gridAxes: v.grid ? v.grid.axes.map((c) => nameByGroup.get(c) ?? c) : [],
      cellCount: v.grid ? Object.keys(v.grid.cells).length : 0,
      upgrades: upVM(v.code),
      sizeSteps: stepVM(v.code),
    };
  });

  const sharedOpts = def.options.filter((o) => o.variantCode === null);
  const shared: SharedVM = {
    questions: sharedOpts.map(questionVM),
    numberQuestions: numberQs(sharedOpts),
    upgrades: upVM(null),
    sizeSteps: stepVM(null),
  };

  return { currency: def.currency, builds, shared };
}
