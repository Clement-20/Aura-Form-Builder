import React, { useMemo, useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash,
  Copy,
  ArrowUp,
  ArrowDown,
  MagnifyingGlass,
  WarningCircle,
  Warning,
  CheckCircle,
  Play,
  SlidersHorizontal,
  Function as FunctionIcon,
  X,
  ShieldCheck,
  Trophy,
  Sparkle,
} from '@phosphor-icons/react';
import {
  AnyLogicRule,
  CrossFieldValidationRule,
  FormDocument,
  FormOutcomeConfig,
  FormScoringConfig,
  FormVariableDefinition,
  LogicActionConfig,
  LogicActionType,
  LogicMessageTone,
  LogicTrigger,
  StudioLogicRule,
  createEmptyAction,
  createEmptyLogicRule,
  defaultLogicEngine,
  duplicateStudioLogicRule,
  evaluateFormOutcomes,
  evaluateFormScoring,
  formComponentRegistry,
  getOrderedComponents,
  isSafeHttpUrl,
  logicActionRegistry,
  normalizeLogicRule,
  serializeStudioLogicRule,
  validateAndSanitizeSubmission,
  validateFormLogic,
  validateVariableAssignment,
} from '../../studio';
import {
  LogicConditionGroupEditor,
  indexConditionTraces,
} from './LogicConditionGroupEditor';
import { LogicDebuggerPanel } from './LogicDebuggerPanel';
import { VariablesManager } from './VariablesManager';
import { CrossFieldValidationManager } from './CrossFieldValidationManager';
import { ScoringManager } from './ScoringManager';
import { OutcomeBuilder } from './OutcomeBuilder';
import { FormulaEditor } from './FormulaEditor';
import { AnswerPipingPicker } from './AnswerPipingPicker';

function appendPipingToken(current: string, token: string): string {
  if (!current) return token;
  return /\s$/.test(current) ? `${current}${token}` : `${current} ${token}`;
}

interface VisualLogicBuilderProps {
  document: FormDocument;
  onUpdateRules: (rules: StudioLogicRule[]) => void;
  onUpdateVariables: (variables: FormVariableDefinition[]) => void;
  onRenameVariable?: (variableId: string, nextName: string) => { error?: string };
  onUpdateCrossFieldValidations?: (rules: CrossFieldValidationRule[]) => void;
  onUpdateScoring?: (scoring: FormScoringConfig) => void;
  onUpdateOutcomes?: (outcomes: FormOutcomeConfig) => void;
  isReadOnly?: boolean;
}

const TRIGGER_OPTIONS: { value: LogicTrigger; label: string }[] = [
  { value: 'on_change', label: 'When answers change' },
  { value: 'on_page_enter', label: 'When page opens' },
  { value: 'on_page_leave', label: 'When leaving page' },
  { value: 'on_submit', label: 'Before form submits' },
  { value: 'always', label: 'Always evaluate' },
];

export const VisualLogicBuilder: React.FC<VisualLogicBuilderProps> = ({
  document,
  onUpdateRules,
  onUpdateVariables,
  onRenameVariable,
  onUpdateCrossFieldValidations,
  onUpdateScoring,
  onUpdateOutcomes,
  isReadOnly = false,
}) => {
  // Normalize all rules into structured StudioLogicRule[]
  const rules: StudioLogicRule[] = useMemo(
    () =>
      (document.logic.rules || [])
        .map((r, idx) => normalizeLogicRule(r as AnyLogicRule, document, idx))
        .sort((a, b) => a.priority - b.priority),
    [document]
  );

  const [workspaceTab, setWorkspaceTab] = useState<
    'rules' | 'validation' | 'variables' | 'scoring' | 'outcomes'
  >('rules');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(
    () => rules[0]?.id || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showDebugger, setShowDebugger] = useState(true);

  // Debugger simulated answers (strictly isolated creator test state, never saved)
  const [testAnswers, setTestAnswers] = useState<Record<string, unknown>>({});

  const orderedComponents = useMemo(() => getOrderedComponents(document), [document]);

  // Question components usable as condition sources & calculation/skip targets
  const questionComponents = useMemo(
    () =>
      orderedComponents.filter((node) => {
        const def = formComponentRegistry.get(node.type);
        return !def || def.isQuestion;
      }),
    [orderedComponents]
  );

  // All non-screen components usable as visibility targets
  const targetableComponents = useMemo(
    () =>
      orderedComponents.filter((node) => {
        const def = formComponentRegistry.get(node.type);
        return !def?.specialAction;
      }),
    [orderedComponents]
  );

  const actionCategories = useMemo(() => logicActionRegistry.listByCategory(), []);

  // Static validation report
  const validation = useMemo(() => validateFormLogic(document), [document]);

  // Live creator-only evaluation for Debugger & inline condition trace
  const evaluation = useMemo(
    () =>
      defaultLogicEngine.evaluate(document, {
        answers: testAnswers,
        includeDebugTrace: true,
      }),
    [document, testAnswers]
  );

  const resolvedSelectedRule = useMemo(() => {
    if (selectedRuleId) {
      const match = rules.find((r) => r.id === selectedRuleId);
      if (match) return match;
    }
    return rules[0] || null;
  }, [rules, selectedRuleId]);

  const filteredRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => r.name.toLowerCase().includes(q));
  }, [rules, searchQuery]);

  const selectedRuleTrace = useMemo(() => {
    if (!resolvedSelectedRule || !showDebugger) return undefined;
    return evaluation.trace.find((t) => t.ruleId === resolvedSelectedRule.id);
  }, [resolvedSelectedRule, showDebugger, evaluation.trace]);

  const conditionTraceMap = useMemo(
    () =>
      selectedRuleTrace ? indexConditionTraces(selectedRuleTrace.conditionTrace) : undefined,
    [selectedRuleTrace]
  );

  const ruleIssues = useMemo(() => {
    if (!resolvedSelectedRule) return { errors: [], warnings: [] };
    return {
      errors: validation.errors.filter((e) => e.ruleId === resolvedSelectedRule.id),
      warnings: validation.warnings.filter((w) => w.ruleId === resolvedSelectedRule.id),
    };
  }, [resolvedSelectedRule, validation]);

  const commitRules = (nextRules: StudioLogicRule[]) => {
    if (isReadOnly) return;
    const serialized = nextRules.map((r, idx) => serializeStudioLogicRule(r, document, idx));
    onUpdateRules(serialized);
  };

  const handleCreateRule = () => {
    if (isReadOnly) return;
    const created = createEmptyLogicRule(document, rules.length);
    commitRules([...rules, created]);
    setSelectedRuleId(created.id);
  };

  const handleUpdateSelectedRule = (patch: Partial<StudioLogicRule>) => {
    if (isReadOnly || !resolvedSelectedRule) return;
    const next = rules.map((r) =>
      r.id === resolvedSelectedRule.id ? { ...r, ...patch } : r
    );
    commitRules(next);
  };

  const handleToggleRuleEnabled = (ruleId: string) => {
    if (isReadOnly) return;
    commitRules(rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)));
  };

  const handleDuplicateRule = (rule: StudioLogicRule) => {
    if (isReadOnly) return;
    const copy = duplicateStudioLogicRule(rule, document, rules.length);
    const idx = rules.findIndex((r) => r.id === rule.id);
    const next = [...rules];
    next.splice(idx + 1, 0, copy);
    // Re-assign clean sequential priorities
    const reindexed = next.map((r, i) => ({ ...r, priority: (i + 1) * 10 }));
    commitRules(reindexed);
    setSelectedRuleId(copy.id);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (isReadOnly) return;
    const next = rules.filter((r) => r.id !== ruleId);
    commitRules(next);
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(next[0]?.id || null);
    }
  };

  const handleMoveRulePriority = (ruleId: string, direction: 'up' | 'down') => {
    if (isReadOnly) return;
    const idx = rules.findIndex((r) => r.id === ruleId);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || targetIdx < 0 || targetIdx >= rules.length) return;
    const next = [...rules];
    const tmp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = tmp;
    const reindexed = next.map((r, i) => ({ ...r, priority: (i + 1) * 10 }));
    commitRules(reindexed);
  };

  // Action mutations for selected rule (shared for THEN and ELSE branches)
  const handleAddAction = (branch: 'then' | 'else' = 'then') => {
    if (isReadOnly || !resolvedSelectedRule) return;
    const defaultType: LogicActionType =
      branch === 'else' ? 'navigate_to_page' : 'show_component';
    const created = createEmptyAction(document, defaultType);
    if (branch === 'else') {
      handleUpdateSelectedRule({
        elseActions: [...(resolvedSelectedRule.elseActions || []), created],
      });
    } else {
      handleUpdateSelectedRule({
        actions: [...resolvedSelectedRule.actions, created],
      });
    }
  };

  const handleUpdateAction = (
    actionId: string,
    patch: Partial<LogicActionConfig>,
    branch: 'then' | 'else' = 'then'
  ) => {
    if (isReadOnly || !resolvedSelectedRule) return;
    if (branch === 'else') {
      handleUpdateSelectedRule({
        elseActions: (resolvedSelectedRule.elseActions || []).map((a) =>
          a.id === actionId ? { ...a, ...patch } : a
        ),
      });
    } else {
      handleUpdateSelectedRule({
        actions: resolvedSelectedRule.actions.map((a) =>
          a.id === actionId ? { ...a, ...patch } : a
        ),
      });
    }
  };

  const handleChangeActionType = (
    actionId: string,
    nextType: LogicActionType,
    branch: 'then' | 'else' = 'then'
  ) => {
    if (isReadOnly || !resolvedSelectedRule) return;
    const fresh = createEmptyAction(document, nextType);
    if (branch === 'else') {
      handleUpdateSelectedRule({
        elseActions: (resolvedSelectedRule.elseActions || []).map((a) =>
          a.id === actionId ? { ...fresh, id: actionId } : a
        ),
      });
    } else {
      handleUpdateSelectedRule({
        actions: resolvedSelectedRule.actions.map((a) =>
          a.id === actionId ? { ...fresh, id: actionId } : a
        ),
      });
    }
  };

  const handleRemoveAction = (actionId: string, branch: 'then' | 'else' = 'then') => {
    if (isReadOnly || !resolvedSelectedRule) return;
    if (branch === 'else') {
      handleUpdateSelectedRule({
        elseActions: (resolvedSelectedRule.elseActions || []).filter((a) => a.id !== actionId),
      });
    } else {
      handleUpdateSelectedRule({
        actions: resolvedSelectedRule.actions.filter((a) => a.id !== actionId),
      });
    }
  };

  const activeRuleCount = rules.filter((r) => r.enabled).length;
  const circularCalcErrors = validation.errors.filter(
    (e) => e.code === 'CIRCULAR_CALCULATION'
  );

  // Live creator-only simulation of validation, multi-category scoring, and personalised outcomes
  const simulatedValidation = useMemo(
    () => validateAndSanitizeSubmission(document, testAnswers),
    [document, testAnswers]
  );

  const effectiveSimulatedAnswers = useMemo(
    () => ({ ...testAnswers, ...evaluation.calculatedComponentValues }),
    [testAnswers, evaluation.calculatedComponentValues]
  );

  const liveScoring = useMemo(
    () =>
      evaluateFormScoring(
        document,
        effectiveSimulatedAnswers,
        evaluation.resolvedVariables,
        evaluation.visibleComponentIds
      ),
    [document, effectiveSimulatedAnswers, evaluation.resolvedVariables, evaluation.visibleComponentIds]
  );

  const liveOutcomeResult = useMemo(
    () =>
      evaluateFormOutcomes(
        document,
        effectiveSimulatedAnswers,
        evaluation.resolvedVariables,
        liveScoring,
        {
          document,
          answers: effectiveSimulatedAnswers,
          variables: evaluation.resolvedVariables,
          formattedVariables: evaluation.formattedVariables,
        }
      ),
    [
      document,
      effectiveSimulatedAnswers,
      evaluation.resolvedVariables,
      evaluation.formattedVariables,
      liveScoring,
    ]
  );

  const crossFieldCount = document.logic.crossFieldValidations?.length || 0;
  const scoringRuleCount = document.scoring?.rules?.length || 0;
  const outcomeCount = document.outcomes?.outcomes?.length || 0;

  return (
    <div className="flex-1 flex flex-col bg-[#F7F6F3] overflow-hidden min-h-0">
      {/* TOP SUB-BAR: Logic Rules, Cross-Field Validation, Variables, Scoring & Outcomes */}
      <div className="px-4 py-2.5 bg-white border-b border-black/[0.08] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div
          className="inline-flex items-center rounded-lg border border-black/[0.08] bg-[#F7F6F3] p-0.5 overflow-x-auto max-w-full"
          role="tablist"
          aria-label="Logic workspace view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'rules'}
            onClick={() => setWorkspaceTab('rules')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspaceTab === 'rules'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <GitBranch size={13} weight="duotone" />
            <span>Logic Rules</span>
            <span className="font-mono text-[10px] opacity-80 tabular-nums">({rules.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'validation'}
            onClick={() => setWorkspaceTab('validation')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspaceTab === 'validation'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <ShieldCheck size={13} weight="duotone" />
            <span>Cross-Field</span>
            <span className="font-mono text-[10px] opacity-80 tabular-nums">
              ({crossFieldCount})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'variables'}
            onClick={() => setWorkspaceTab('variables')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspaceTab === 'variables'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <FunctionIcon size={13} weight="duotone" />
            <span>Variables</span>
            <span className="font-mono text-[10px] opacity-80 tabular-nums">
              ({document.variables.length})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'scoring'}
            onClick={() => setWorkspaceTab('scoring')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspaceTab === 'scoring'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <Trophy size={13} weight="duotone" />
            <span>Scoring</span>
            <span className="font-mono text-[10px] opacity-80 tabular-nums">
              ({scoringRuleCount})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'outcomes'}
            onClick={() => setWorkspaceTab('outcomes')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              workspaceTab === 'outcomes'
                ? 'bg-[#0B0D0F] text-[#F7F6F3]'
                : 'text-[#5C6066] hover:text-[#0B0D0F]'
            }`}
          >
            <Sparkle size={13} weight="duotone" />
            <span>Outcomes</span>
            <span className="font-mono text-[10px] opacity-80 tabular-nums">({outcomeCount})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs">
            {validation.errors.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-rose-700 font-medium">
                <WarningCircle size={15} weight="fill" />
                <span>
                  {validation.errors.length} issue
                  {validation.errors.length === 1 ? '' : 's'} to fix before publishing
                </span>
              </span>
            ) : validation.warnings.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                <Warning size={15} weight="fill" />
                <span>
                  {validation.warnings.length} advisory warning
                  {validation.warnings.length === 1 ? '' : 's'}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[#0F766E] font-medium">
                <CheckCircle size={15} weight="fill" />
                <span>All rules, validations &amp; outcomes valid</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowDebugger((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              showDebugger
                ? 'bg-[#0F766E] text-white border-[#0F766E]'
                : 'bg-white text-[#0B0D0F] border-black/[0.08] hover:bg-[#EAE7E1]'
            }`}
          >
            <Play size={13} weight="fill" />
            <span>{showDebugger ? 'Hide Debugger' : 'Test & Debug'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden min-h-0">
      {workspaceTab === 'variables' ? (
        <VariablesManager
          document={document}
          onUpdateVariables={onUpdateVariables}
          onRenameVariable={onRenameVariable}
          sampleAnswers={testAnswers}
          resolvedVariables={evaluation.resolvedVariables}
          formattedVariables={evaluation.formattedVariables}
          isReadOnly={isReadOnly}
        />
      ) : workspaceTab === 'validation' ? (
        <CrossFieldValidationManager
          document={document}
          onUpdateRules={(next) => onUpdateCrossFieldValidations?.(next)}
          sampleAnswers={effectiveSimulatedAnswers}
          resolvedVariables={evaluation.resolvedVariables}
          formattedVariables={evaluation.formattedVariables}
          visibleComponentIds={evaluation.visibleComponentIds}
          disabledComponentIds={evaluation.disabledComponentIds}
          isReadOnly={isReadOnly}
        />
      ) : workspaceTab === 'scoring' ? (
        <ScoringManager
          document={document}
          onUpdateScoring={(next) => onUpdateScoring?.(next)}
          liveScoring={liveScoring}
          sampleAnswers={effectiveSimulatedAnswers}
          resolvedVariables={evaluation.resolvedVariables}
          isReadOnly={isReadOnly}
        />
      ) : workspaceTab === 'outcomes' ? (
        <OutcomeBuilder
          document={document}
          onUpdateOutcomes={(next) => onUpdateOutcomes?.(next)}
          liveScoring={liveScoring}
          liveOutcomeResult={liveOutcomeResult}
          sampleAnswers={effectiveSimulatedAnswers}
          resolvedVariables={evaluation.resolvedVariables}
          formattedVariables={evaluation.formattedVariables}
          isReadOnly={isReadOnly}
        />
      ) : (
      <>
      {/* LEFT SIDEBAR: Overview, Rules List & Quick Variables Link */}
      <aside className="w-full xl:w-[300px] shrink-0 bg-white border-b xl:border-b-0 xl:border-r border-black/[0.08] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-black/[0.08] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-semibold text-[#0B0D0F] flex items-center gap-1.5">
                <GitBranch size={15} weight="duotone" className="text-[#0F766E]" />
                <span>Logic Rules</span>
              </h2>
              <p className="text-[11px] font-mono text-[#5C6066] mt-0.5 tabular-nums">
                {rules.length} total · {activeRuleCount} active · {document.variables.length} vars
              </p>
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={handleCreateRule}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Plus size={13} weight="bold" />
                <span>New Rule</span>
              </button>
            )}
          </div>

          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5C6066] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter rules..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-[#F7F6F3] border border-black/[0.08] rounded-lg text-[#0B0D0F] placeholder:text-[#5C6066] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0F766E]"
            />
          </div>
        </div>

        {/* Rule List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[260px] xl:max-h-none">
          {filteredRules.length === 0 ? (
            <div className="p-5 text-center text-xs text-[#5C6066] border border-dashed border-black/[0.12] rounded-xl">
              {rules.length === 0
                ? 'No rules yet. Create a rule to control visibility, validation, variables, or page jumps.'
                : 'No rules match your search.'}
            </div>
          ) : (
            filteredRules.map((rule, idx) => {
              const isSelected = resolvedSelectedRule?.id === rule.id;
              const errCount = validation.errors.filter((e) => e.ruleId === rule.id).length;
              const warnCount = validation.warnings.filter((w) => w.ruleId === rule.id).length;
              const trace = showDebugger
                ? evaluation.trace.find((t) => t.ruleId === rule.id)
                : undefined;

              return (
                <div
                  key={rule.id}
                  onClick={() => setSelectedRuleId(rule.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRuleId(rule.id);
                    }
                  }}
                  className={`group rounded-xl border p-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#0F766E]/[0.06] border-[#0F766E]/40'
                      : 'bg-white border-black/[0.07] hover:bg-[#FAF9F7]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#5C6066] tabular-nums shrink-0">
                          #{idx + 1}
                        </span>
                        <span
                          className={`text-xs font-semibold truncate ${
                            rule.enabled ? 'text-[#0B0D0F]' : 'text-[#5C6066] line-through'
                          }`}
                        >
                          {rule.name || 'Untitled Rule'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#5C6066] font-mono tabular-nums">
                        <span>{rule.conditionGroup.combinator}</span>
                        <span>·</span>
                        <span>
                          {rule.actions.length} action{rule.actions.length === 1 ? '' : 's'}
                          {rule.elseActions && rule.elseActions.length > 0
                            ? ` + ${rule.elseActions.length} else`
                            : ''}
                        </span>
                        {errCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-rose-600 inline-flex items-center gap-0.5 font-semibold">
                              <WarningCircle size={12} weight="fill" />
                              {errCount}
                            </span>
                          </>
                        )}
                        {errCount === 0 && warnCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 inline-flex items-center gap-0.5">
                              <Warning size={12} weight="fill" />
                              {warnCount}
                            </span>
                          </>
                        )}
                        {trace && rule.enabled && errCount === 0 && (
                          <>
                            <span>·</span>
                            <span
                              className={
                                trace.matched
                                  ? 'text-[#0F766E] font-semibold'
                                  : trace.branchTaken === 'else'
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-[#5C6066]'
                              }
                            >
                              {trace.matched
                                ? 'THEN'
                                : trace.branchTaken === 'else'
                                ? 'ELSE'
                                : 'Idle'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && (
                      <div
                        className="flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleRuleEnabled(rule.id)}
                          aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                          title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                          className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                            rule.enabled ? 'bg-[#0F766E]' : 'bg-black/20'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                              rule.enabled ? 'left-3.5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>

                  {!isReadOnly && isSelected && (
                    <div
                      className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-between gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveRulePriority(rule.id, 'up')}
                          className="p-1 rounded-md text-[#5C6066] hover:text-[#0B0D0F] hover:bg-black/[0.05] disabled:opacity-25"
                          title="Increase priority (run earlier)"
                          aria-label="Move rule up"
                        >
                          <ArrowUp size={12} weight="bold" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === filteredRules.length - 1}
                          onClick={() => handleMoveRulePriority(rule.id, 'down')}
                          className="p-1 rounded-md text-[#5C6066] hover:text-[#0B0D0F] hover:bg-black/[0.05] disabled:opacity-25"
                          title="Lower priority (run later)"
                          aria-label="Move rule down"
                        >
                          <ArrowDown size={12} weight="bold" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRule(rule)}
                          className="p-1 rounded-md text-[#5C6066] hover:text-[#0B0D0F] hover:bg-black/[0.05]"
                          title="Duplicate rule"
                          aria-label="Duplicate rule"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 rounded-md text-[#5C6066] hover:text-rose-600 hover:bg-rose-50"
                          title="Delete rule"
                          aria-label="Delete rule"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Quick Link to Full Variables & Calculations Workspace */}
        <div className="border-t border-black/[0.08] bg-[#FAF9F7]">
          <button
            type="button"
            onClick={() => setWorkspaceTab('variables')}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#0B0D0F] hover:bg-black/[0.03] transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">
              <FunctionIcon size={14} className="text-[#0F766E]" />
              <span>Variables &amp; Calculations ({document.variables.length})</span>
            </span>
            <span className="text-[11px] font-mono text-[#0F766E]">Open →</span>
          </button>
        </div>
      </aside>

      {/* CENTER WORKSPACE: Rule Editor */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Global Circular Navigation Error Banner */}
          {validation.circularPaths.length > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <WarningCircle size={15} weight="fill" />
                <span>Circular page navigation detected</span>
              </div>
              {validation.errors
                .filter((e) => e.code === 'CIRCULAR_NAVIGATION')
                .map((err) => (
                  <p key={err.id}>{err.message}</p>
                ))}
            </div>
          )}

          {/* Global Circular Calculation Error Banner */}
          {circularCalcErrors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
              <div className="font-semibold flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <WarningCircle size={15} weight="fill" />
                  <span>Circular calculation dependency detected</span>
                </span>
                <button
                  type="button"
                  onClick={() => setWorkspaceTab('variables')}
                  className="underline font-semibold hover:text-rose-950"
                >
                  Open Variables
                </button>
              </div>
              {circularCalcErrors.map((err) => (
                <p key={err.id}>{err.message}</p>
              ))}
            </div>
          )}

          {!resolvedSelectedRule ? (
            <div className="bg-white rounded-2xl border border-black/[0.08] p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#F7F6F3] border border-black/[0.08] text-[#0F766E] flex items-center justify-center mx-auto">
                <GitBranch size={24} weight="duotone" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-display font-semibold text-[#0B0D0F]">
                  Build dynamic no-code workflows
                </h3>
                <p className="text-xs text-[#5C6066] leading-relaxed">
                  Show or hide questions, lock fields, skip pages, calculate scores, or display
                  tailored notices based on respondent answers — no code required.
                </p>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleCreateRule}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#0B0D0F] hover:bg-[#191D21] text-[#F7F6F3] text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Plus size={14} weight="bold" />
                  <span>Create First Logic Rule</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Rule Metadata & Execution Configuration Card */}
              <section className="bg-white rounded-2xl border border-black/[0.08] p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      disabled={isReadOnly}
                      value={resolvedSelectedRule.name}
                      onChange={(e) => handleUpdateSelectedRule({ name: e.target.value })}
                      placeholder="e.g. Show enterprise follow-up questions"
                      className="w-full h-9 px-3 text-sm font-display font-semibold text-[#0B0D0F] bg-[#FAF9F7] border border-black/[0.08] rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>

                  {!isReadOnly && (
                    <div className="flex items-center gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => handleToggleRuleEnabled(resolvedSelectedRule.id)}
                        className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                          resolvedSelectedRule.enabled
                            ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/30'
                            : 'bg-[#F7F6F3] text-[#5C6066] border-black/[0.08]'
                        }`}
                      >
                        {resolvedSelectedRule.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateRule(resolvedSelectedRule)}
                        className="h-9 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-[#F7F6F3] text-[#0B0D0F] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                        title="Duplicate rule"
                      >
                        <Copy size={14} />
                        <span className="hidden sm:inline">Duplicate</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(resolvedSelectedRule.id)}
                        className="h-9 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 text-[#5C6066] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                        title="Delete rule"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Execution Settings Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-black/[0.06]">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      Trigger
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={resolvedSelectedRule.trigger}
                      onChange={(e) =>
                        handleUpdateSelectedRule({
                          trigger: e.target.value as LogicTrigger,
                        })
                      }
                      className="w-full h-8 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    >
                      {TRIGGER_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                      When Conditions Are False
                    </label>
                    <select
                      disabled={isReadOnly}
                      value={resolvedSelectedRule.execution.elseBehavior}
                      onChange={(e) =>
                        handleUpdateSelectedRule({
                          execution: {
                            ...resolvedSelectedRule.execution,
                            elseBehavior: e.target.value as 'revert' | 'none',
                          },
                        })
                      }
                      className="w-full h-8 px-2.5 text-xs bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    >
                      <option value="revert">Revert show/hide defaults</option>
                      <option value="none">Do nothing</option>
                    </select>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div className="w-20">
                      <label className="block text-[10px] font-mono uppercase tracking-[0.12em] text-[#5C6066] mb-1">
                        Priority
                      </label>
                      <input
                        type="number"
                        disabled={isReadOnly}
                        value={resolvedSelectedRule.priority}
                        onChange={(e) =>
                          handleUpdateSelectedRule({
                            priority: Math.max(1, Number(e.target.value) || 10),
                          })
                        }
                        className="w-full h-8 px-2 text-xs font-mono bg-[#FAF9F7] border border-black/[0.08] rounded-lg text-[#0B0D0F] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#5C6066] h-8 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={isReadOnly}
                        checked={Boolean(resolvedSelectedRule.execution.stopOnMatch)}
                        onChange={(e) =>
                          handleUpdateSelectedRule({
                            execution: {
                              ...resolvedSelectedRule.execution,
                              stopOnMatch: e.target.checked,
                            },
                          })
                        }
                        className="accent-[#0F766E]"
                      />
                      <span>Stop lower rules</span>
                    </label>
                  </div>
                </div>

                {/* Rule-Specific Validation Errors & Warnings */}
                {(ruleIssues.errors.length > 0 || ruleIssues.warnings.length > 0) && (
                  <div className="space-y-1.5 pt-2">
                    {ruleIssues.errors.map((err) => (
                      <div
                        key={err.id}
                        className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
                      >
                        <WarningCircle size={14} weight="fill" className="shrink-0 mt-0.5" />
                        <span>{err.message}</span>
                      </div>
                    ))}
                    {ruleIssues.warnings.map((warn) => (
                      <div
                        key={warn.id}
                        className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2"
                      >
                        <Warning size={14} weight="fill" className="shrink-0 mt-0.5" />
                        <span>{warn.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* IF — NESTED CONDITION BUILDER */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-[#0F766E]">
                      IF
                    </span>
                    <span className="text-xs font-medium text-[#5C6066]">
                      Conditions to evaluate
                    </span>
                  </div>
                </div>

                <LogicConditionGroupEditor
                  document={document}
                  group={resolvedSelectedRule.conditionGroup}
                  onChange={(nextGroup) =>
                    handleUpdateSelectedRule({ conditionGroup: nextGroup })
                  }
                  isReadOnly={isReadOnly}
                  traceMap={conditionTraceMap}
                  selectableComponents={questionComponents}
                />
              </section>

              {/* THEN & ELSE — MULTI-ACTION BUILDERS (ALL 15 CORE ACTIONS) */}
              {(() => {
                const renderActionCard = (
                  action: LogicActionConfig,
                  actIdx: number,
                  branch: 'then' | 'else',
                  canRemove: boolean
                ) => {
                  const actionDef = logicActionRegistry.get(action.type);
                  const targetVarDef = action.variableName
                    ? document.variables.find((v) => v.name === action.variableName)
                    : undefined;
                  const varAssignValidation =
                    action.type === 'set_variable' &&
                    targetVarDef &&
                    typeof action.value === 'string' &&
                    action.value.trim() !== '' &&
                    !/\{\{[^}]+\}\}/.test(action.value)
                      ? validateVariableAssignment(targetVarDef, action.value)
                      : null;

                  const isMissingTargetComp =
                    Boolean(actionDef?.requiresComponentTarget) &&
                    Boolean(action.targetComponentId) &&
                    !document.components[action.targetComponentId!];

                  const isMissingTargetPage =
                    Boolean(actionDef?.requiresPageTarget) &&
                    Boolean(action.targetPageId) &&
                    !document.pages.some((p) => p.id === action.targetPageId);

                  const invalidRedirect =
                    action.type === 'end_form' &&
                    Boolean(action.redirectUrl?.trim()) &&
                    !isSafeHttpUrl(action.redirectUrl);

                  return (
                    <div
                      key={action.id}
                      className={`rounded-xl border p-3.5 space-y-3 ${
                        isMissingTargetComp || isMissingTargetPage || invalidRedirect
                          ? 'border-rose-300 bg-rose-50/40'
                          : 'border-black/[0.08] bg-[#FAF9F7]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-[#5C6066]">
                          {branch === 'else' ? 'ELSE ' : ''}Action {actIdx + 1} ·{' '}
                          {actionDef?.category || 'action'}
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            disabled={!canRemove}
                            onClick={() => handleRemoveAction(action.id, branch)}
                            className="p-1 rounded-md text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 disabled:opacity-25"
                            title="Remove action"
                            aria-label="Remove action"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Action Type Selector */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                        <div className="md:col-span-5">
                          <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                            Action Type
                          </label>
                          <select
                            disabled={isReadOnly}
                            value={action.type}
                            onChange={(e) =>
                              handleChangeActionType(
                                action.id,
                                e.target.value as LogicActionType,
                                branch
                              )
                            }
                            className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                          >
                            {actionCategories.map((cat) => (
                              <optgroup key={cat.category} label={cat.label}>
                                {cat.actions.map((def) => (
                                  <option key={def.type} value={def.type}>
                                    {def.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        {/* Component Target Picker */}
                        {actionDef?.requiresComponentTarget && (
                          <div className="md:col-span-7">
                            <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                              Target Question, Section or Block
                            </label>
                            <select
                              disabled={isReadOnly}
                              value={action.targetComponentId || ''}
                              onChange={(e) =>
                                handleUpdateAction(
                                  action.id,
                                  { targetComponentId: e.target.value },
                                  branch
                                )
                              }
                              className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                            >
                              <option value="">Select target block...</option>
                              {isMissingTargetComp && (
                                <option value={action.targetComponentId}>
                                  Missing block ({action.targetComponentId})
                                </option>
                              )}
                              {(action.type === 'skip_to_question'
                                ? questionComponents
                                : targetableComponents
                              ).map((c, idx) => (
                                <option key={c.id} value={c.id}>
                                  {idx + 1}. {c.content.label || c.type}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Single Page Target Picker (navigate_to_page, show_page, hide_page) */}
                        {actionDef?.requiresPageTarget && (
                          <div className="md:col-span-7">
                            <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                              {action.type === 'navigate_to_page'
                                ? 'Destination Page'
                                : 'Target Page'}
                            </label>
                            <select
                              disabled={isReadOnly}
                              value={action.targetPageId || ''}
                              onChange={(e) =>
                                handleUpdateAction(
                                  action.id,
                                  { targetPageId: e.target.value },
                                  branch
                                )
                              }
                              className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                            >
                              <option value="">Select page...</option>
                              {isMissingTargetPage && (
                                <option value={action.targetPageId}>
                                  Deleted page ({action.targetPageId})
                                </option>
                              )}
                              {document.pages.map((p) => (
                                <option key={p.id} value={p.id}>
                                  Page {p.index}: {p.title || `Page ${p.index}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Multi-Page Picker (skip_pages) */}
                        {actionDef?.requiresMultiPageTarget && (
                          <div className="md:col-span-7">
                            <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                              Pages to Skip
                            </label>
                            {document.pages.length <= 1 ? (
                              <p className="text-xs text-[#5C6066] bg-white border border-black/[0.08] rounded-lg px-3 py-2">
                                Add additional pages in the Build tab to skip pages.
                              </p>
                            ) : (
                              <div className="bg-white border border-black/[0.1] rounded-lg p-2 space-y-1.5 max-h-36 overflow-y-auto">
                                {document.pages.map((p) => {
                                  const selectedIds = action.targetPageIds || [];
                                  const isChecked = selectedIds.includes(p.id);
                                  return (
                                    <label
                                      key={p.id}
                                      className="flex items-center gap-2 text-xs text-[#0B0D0F] cursor-pointer px-1.5 py-0.5 rounded hover:bg-[#FAF9F7]"
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={isReadOnly}
                                        checked={isChecked}
                                        onChange={() => {
                                          const nextIds = isChecked
                                            ? selectedIds.filter((id) => id !== p.id)
                                            : [...selectedIds, p.id];
                                          handleUpdateAction(
                                            action.id,
                                            { targetPageIds: nextIds },
                                            branch
                                          );
                                        }}
                                        className="accent-[#0F766E]"
                                      />
                                      <span className="truncate">
                                        Page {p.index}: {p.title || `Page ${p.index}`}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Set Variable Config */}
                        {action.type === 'set_variable' && (
                          <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                                Variable
                              </label>
                              <select
                                disabled={isReadOnly}
                                value={action.variableName || ''}
                                onChange={(e) =>
                                  handleUpdateAction(
                                    action.id,
                                    { variableName: e.target.value },
                                    branch
                                  )
                                }
                                className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                              >
                                <option value="">Select variable...</option>
                                {document.variables.map((v) => (
                                  <option key={v.id} value={v.name}>
                                    {v.name} ({v.valueType})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066]">
                                  Assigned Value
                                </label>
                                {targetVarDef?.valueType !== 'boolean' &&
                                  !(
                                    targetVarDef?.valueType === 'selection' &&
                                    targetVarDef.options?.length
                                  ) && (
                                    <AnswerPipingPicker
                                      document={document}
                                      disabled={isReadOnly}
                                      onInsertToken={(token) =>
                                        handleUpdateAction(
                                          action.id,
                                          { value: appendPipingToken(action.value ?? '', token) },
                                          branch
                                        )
                                      }
                                    />
                                  )}
                              </div>

                              {targetVarDef?.valueType === 'boolean' ? (
                                <select
                                  disabled={isReadOnly}
                                  value={action.value ?? ''}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, { value: e.target.value }, branch)
                                  }
                                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                                >
                                  <option value="">Choose true/false...</option>
                                  <option value="true">True (Yes)</option>
                                  <option value="false">False (No)</option>
                                </select>
                              ) : targetVarDef?.valueType === 'selection' &&
                                targetVarDef.options?.length ? (
                                <select
                                  disabled={isReadOnly}
                                  value={action.value ?? ''}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, { value: e.target.value }, branch)
                                  }
                                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                                >
                                  <option value="">Choose option...</option>
                                  {targetVarDef.options.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={targetVarDef?.valueType === 'date' ? 'date' : 'text'}
                                  disabled={isReadOnly}
                                  value={action.value ?? ''}
                                  onChange={(e) =>
                                    handleUpdateAction(action.id, { value: e.target.value }, branch)
                                  }
                                  placeholder={
                                    targetVarDef?.valueType === 'number'
                                      ? 'e.g. 100 or {{qty}}'
                                      : targetVarDef?.valueType === 'list'
                                      ? 'Comma-separated items'
                                      : 'e.g. qualified or {{first_name}}'
                                  }
                                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                                />
                              )}

                              {varAssignValidation && !varAssignValidation.valid && (
                                <p className="mt-1 text-[11px] text-rose-600">
                                  {varAssignValidation.error}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* End Form Copy & Result Redirect URL */}
                        {action.type === 'end_form' && (
                          <div className="md:col-span-7 space-y-2">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066]">
                                  Completion Heading
                                </label>
                                <AnswerPipingPicker
                                  document={document}
                                  disabled={isReadOnly}
                                  onInsertToken={(token) =>
                                    handleUpdateAction(
                                      action.id,
                                      {
                                        endFormTitle: appendPipingToken(
                                          action.endFormTitle ?? '',
                                          token
                                        ),
                                      },
                                      branch
                                    )
                                  }
                                />
                              </div>
                              <input
                                type="text"
                                disabled={isReadOnly}
                                value={action.endFormTitle ?? ''}
                                onChange={(e) =>
                                  handleUpdateAction(
                                    action.id,
                                    { endFormTitle: e.target.value },
                                    branch
                                  )
                                }
                                placeholder="Thank you for your time"
                                className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066]">
                                  Completion Message
                                </label>
                                <AnswerPipingPicker
                                  document={document}
                                  disabled={isReadOnly}
                                  onInsertToken={(token) =>
                                    handleUpdateAction(
                                      action.id,
                                      {
                                        endFormMessage: appendPipingToken(
                                          action.endFormMessage ?? '',
                                          token
                                        ),
                                      },
                                      branch
                                    )
                                  }
                                />
                              </div>
                              <input
                                type="text"
                                disabled={isReadOnly}
                                value={action.endFormMessage ?? ''}
                                onChange={(e) =>
                                  handleUpdateAction(
                                    action.id,
                                    { endFormMessage: e.target.value },
                                    branch
                                  )
                                }
                                placeholder="Based on your answers, we have everything we need."
                                className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                                Result / Completion Redirect URL (optional)
                              </label>
                              <input
                                type="url"
                                disabled={isReadOnly}
                                value={action.redirectUrl ?? ''}
                                onChange={(e) =>
                                  handleUpdateAction(
                                    action.id,
                                    { redirectUrl: e.target.value },
                                    branch
                                  )
                                }
                                placeholder="https://example.com/result"
                                className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                              />
                              {invalidRedirect && (
                                <p className="mt-1 text-[11px] text-rose-600">
                                  Enter a valid http:// or https:// URL.
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Display Message Config */}
                        {action.type === 'display_message' && (
                          <div className="md:col-span-7 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                                  Notice Style
                                </label>
                                <select
                                  disabled={isReadOnly}
                                  value={action.messageTone || 'info'}
                                  onChange={(e) =>
                                    handleUpdateAction(
                                      action.id,
                                      { messageTone: e.target.value as LogicMessageTone },
                                      branch
                                    )
                                  }
                                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                                >
                                  <option value="info">Info</option>
                                  <option value="success">Success</option>
                                  <option value="warning">Warning</option>
                                  <option value="error">Alert / Error</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                                  Position
                                </label>
                                <select
                                  disabled={isReadOnly}
                                  value={action.targetComponentId || ''}
                                  onChange={(e) =>
                                    handleUpdateAction(
                                      action.id,
                                      { targetComponentId: e.target.value || undefined },
                                      branch
                                    )
                                  }
                                  className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                                >
                                  <option value="">Top of current page</option>
                                  {targetableComponents.map((c, idx) => (
                                    <option key={c.id} value={c.id}>
                                      Above Q{idx + 1}. {c.content.label || c.type}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066]">
                                  Message Text
                                </label>
                                <AnswerPipingPicker
                                  document={document}
                                  disabled={isReadOnly}
                                  onInsertToken={(token) =>
                                    handleUpdateAction(
                                      action.id,
                                      { message: appendPipingToken(action.message ?? '', token) },
                                      branch
                                    )
                                  }
                                />
                              </div>
                              <textarea
                                rows={2}
                                disabled={isReadOnly}
                                value={action.message ?? ''}
                                onChange={(e) =>
                                  handleUpdateAction(
                                    action.id,
                                    { message: e.target.value },
                                    branch
                                  )
                                }
                                placeholder="Write the message shown to respondents..."
                                className="w-full p-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E] resize-y"
                              />
                            </div>
                          </div>
                        )}

                        {/* Calculated Value Config */}
                        {action.type === 'set_calculated_value' && (
                          <div className="md:col-span-7 space-y-2">
                            <div>
                              <label className="block text-[10px] font-mono uppercase tracking-[0.1em] text-[#5C6066] mb-1">
                                Store Calculated Result In
                              </label>
                              <select
                                disabled={isReadOnly}
                                value={
                                  action.variableName
                                    ? `var:${action.variableName}`
                                    : action.targetComponentId
                                    ? `comp:${action.targetComponentId}`
                                    : ''
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.startsWith('var:')) {
                                    handleUpdateAction(
                                      action.id,
                                      { variableName: val.slice(4), targetComponentId: undefined },
                                      branch
                                    );
                                  } else if (val.startsWith('comp:')) {
                                    handleUpdateAction(
                                      action.id,
                                      { variableName: undefined, targetComponentId: val.slice(5) },
                                      branch
                                    );
                                  } else {
                                    handleUpdateAction(
                                      action.id,
                                      { variableName: undefined, targetComponentId: undefined },
                                      branch
                                    );
                                  }
                                }}
                                className="w-full h-9 px-2.5 text-xs bg-white border border-black/[0.1] rounded-lg text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                              >
                                <option value="">Select destination variable or field...</option>
                                {document.variables.length > 0 && (
                                  <optgroup label="Form Variables">
                                    {document.variables.map((v) => (
                                      <option key={v.id} value={`var:${v.name}`}>
                                        Variable: {v.name} ({v.valueType})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="Form Fields">
                                  {questionComponents.map((c, idx) => (
                                    <option key={c.id} value={`comp:${c.id}`}>
                                      Field Q{idx + 1}: {c.content.label || c.type}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>

                            <div>
                              <FormulaEditor
                                document={document}
                                value={action.expression ?? ''}
                                onChange={(nextExpr) =>
                                  handleUpdateAction(action.id, { expression: nextExpr }, branch)
                                }
                                targetVariableType={targetVarDef?.valueType || 'number'}
                                formatConfig={targetVarDef?.format}
                                sampleAnswers={testAnswers}
                                sampleVariables={evaluation.resolvedVariables}
                                disabled={isReadOnly}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {actionDef?.description && (
                        <p className="text-[11px] text-[#5C6066] flex items-center gap-1.5">
                          <SlidersHorizontal size={12} className="shrink-0 opacity-60" />
                          <span>{actionDef.description}</span>
                        </p>
                      )}
                    </div>
                  );
                };

                const elseActions = resolvedSelectedRule.elseActions || [];

                return (
                  <>
                    {/* THEN Branch */}
                    <section className="space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-[#0B0D0F]">
                            THEN
                          </span>
                          <span className="text-xs font-medium text-[#5C6066]">
                            Actions to execute when conditions match
                          </span>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-black/[0.08] p-4 space-y-3">
                        {resolvedSelectedRule.actions.length === 0 ? (
                          <div className="p-4 rounded-xl border border-dashed border-black/[0.15] text-center text-xs text-[#5C6066]">
                            No actions configured. Add an action below.
                          </div>
                        ) : (
                          resolvedSelectedRule.actions.map((action, actIdx) =>
                            renderActionCard(
                              action,
                              actIdx,
                              'then',
                              resolvedSelectedRule.actions.length > 1
                            )
                          )
                        )}

                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleAddAction('then')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <Plus size={13} weight="bold" />
                            <span>Add Action</span>
                          </button>
                        )}
                      </div>
                    </section>

                    {/* ELSE Branch (Optional Fallback Branching) */}
                    <section className="space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold uppercase tracking-[0.14em] text-[#5C6066]">
                            ELSE
                          </span>
                          <span className="text-xs font-medium text-[#5C6066]">
                            Optional fallback actions when conditions do not match
                          </span>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-black/[0.08] p-4 space-y-3">
                        {elseActions.length === 0 ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C6066]">
                            <span>
                              No ELSE branch configured. Add one to route non-matching respondents to
                              an alternate page, block, or outcome.
                            </span>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleAddAction('else')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
                              >
                                <Plus size={13} weight="bold" />
                                <span>Add ELSE Action</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {elseActions.map((action, actIdx) =>
                              renderActionCard(action, actIdx, 'else', true)
                            )}
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleAddAction('else')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B0D0F] bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
                              >
                                <Plus size={13} weight="bold" />
                                <span>Add ELSE Action</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </section>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </main>
      </>
      )}

      {/* RIGHT PANEL: Live Logic Preview & Debugger (Creator-Only) */}
      {showDebugger && (
        <LogicDebuggerPanel
          document={document}
          selectableComponents={questionComponents}
          testAnswers={testAnswers}
          onChangeTestAnswer={(compId, val) =>
            setTestAnswers((prev) => ({ ...prev, [compId]: val }))
          }
          onResetTestAnswers={() => setTestAnswers({})}
          evaluation={evaluation}
          validation={validation}
          simulatedValidation={simulatedValidation}
          liveScoring={liveScoring}
          liveOutcomeResult={liveOutcomeResult}
          selectedRuleId={resolvedSelectedRule?.id || null}
          onSelectRule={(ruleId) => {
            setWorkspaceTab('rules');
            setSelectedRuleId(ruleId);
          }}
        />
      )}
      </div>
    </div>
  );
};
