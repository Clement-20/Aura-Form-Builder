/**
 * FlexStore / AuraForm Studio — Architectural Foundation Barrel Export
 */

// 1. Document Model, Validation & Migration
export * from './document/types';
export * from './document/validation';
export * from './document/migration';

// 2. Central Component Registry
export * from './registry/types';
export * from './registry/ComponentRegistry';
export * from './registry/builtin-components';

// 3. Visual Logic Model, Registries & Migration
export * from './logic/types';
export * from './logic/registries';
export * from './logic/migration';

// 4. Separated Core Engines
export * from './engines/history-engine';
export * from './engines/theme-presets';
export * from './engines/design-engine';
export * from './engines/logic-engine';
export * from './engines/calculation-engine';
export * from './engines/piping-engine';
export * from './engines/validation-engine';
export * from './engines/scoring-engine';
export * from './engines/custom-css-engine';
export * from './engines/custom-html-engine';
export * from './engines/custom-js-engine';
export * from './engines/CustomScriptSandbox';
export * from './engines/reusable-component-engine';
export * from './engines/navigation-engine';
export * from './engines/submission-validator';
export * from './engines/document-engine';
export * from './engines/editor-engine';
export * from './engines/OutcomeResultCard';
export * from './engines/rendering-engine';
