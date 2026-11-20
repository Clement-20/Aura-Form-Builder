/**
 * FlexStore / AuraForm Studio — Built-in Component Definitions
 *
 * Registers all Content, Form Fields (reusing all 13 existing question types +
 * Yes/No, Time, File Upload), Layout Containers (Section, Container, Two-Column,
 * Three-Column, Image & Text), and Other blocks (Welcome Screen, Thank-You Screen,
 * Progress Indicator).
 */

import React from 'react';
import {
  TextT,
  AlignLeft,
  EnvelopeSimple,
  Phone,
  LinkSimple,
  RadioButton,
  CheckSquare,
  CaretCircleDown,
  Star,
  SlidersHorizontal,
  Hash,
  CalendarBlank,
  Clock,
  ToggleLeft,
  UploadSimple,
  ChatCircleText,
  TextH,
  Article,
  TextAa,
  Image as ImageIcon,
  VideoCamera,
  Minus,
  ArrowsVertical,
  SquaresFour,
  SquareHalf,
  Columns,
  Rows,
  Layout,
  HandWaving,
  Confetti,
  ChartLineUp,
  Plus,
  Trash,
  Check,
} from '@phosphor-icons/react';
import { ComponentRegistry } from './ComponentRegistry';
import {
  ComponentConfigOption,
  EditorComponentRenderProps,
  FormComponentDefinition,
  RespondentComponentRenderProps,
} from './types';
import { FormComponentNode, FormComponentType, UploadedFileMeta } from '../document/types';
import {
  resolveComponentTokens,
  resolveContainerColumns,
} from '../engines/design-engine';
import { DEFAULT_STUDIO_DESIGN } from '../engines/theme-presets';
import { normalizeUploadedFiles } from '../engines/validation-engine';

// ============================================================================
// Video URL Embed Helper
// ============================================================================

function getVideoEmbedUrl(rawUrl?: string): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/
  );
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = trimmed.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  if (/^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(trimmed)) return trimmed;
  return null;
}

// ============================================================================
// Visual WYSIWYG Editor Renderers (close to respondent-facing design)
// ============================================================================

const VisualFieldEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const placeholderText =
    node.content.placeholder ||
    (node.type === 'email'
      ? 'name@example.com'
      : node.type === 'phone'
      ? '+1 (555) 000-0000'
      : node.type === 'url'
      ? 'https://example.com'
      : node.type === 'number'
      ? '0'
      : node.type === 'date'
      ? 'MM / DD / YYYY'
      : node.type === 'time'
      ? '09:00 AM'
      : 'Type your answer...');

  return (
    <div className="space-y-2.5" style={{ fontFamily: ct.bodyStyle.fontFamily }}>
      <div className="flex items-start gap-1">
        <input
          type="text"
          disabled={isReadOnly}
          value={node.content.label}
          onChange={(e) => onUpdate({ content: { label: e.target.value } })}
          placeholder="Click to write your question..."
          style={{
            color: ct.headingStyle.color,
            fontSize: ct.headingStyle.fontSize,
            fontWeight: ct.headingStyle.fontWeight || 600,
            textAlign: ct.effectiveAlign,
          }}
          className="w-full text-base font-display font-semibold bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:ring-2 focus:ring-[#0F766E]/40 focus:outline-none transition-colors disabled:opacity-75"
        />
        {node.validation.required && (
          <span className="text-sm font-bold shrink-0 mt-1" style={{ color: ct.accentColor }}>
            *
          </span>
        )}
      </div>

      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.helpText || ''}
        onChange={(e) => onUpdate({ content: { helpText: e.target.value } })}
        placeholder="Add an optional description or hint..."
        style={{ color: ct.bodyStyle.color, textAlign: ct.effectiveAlign }}
        className="w-full text-xs opacity-70 bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:opacity-100 focus:ring-2 focus:ring-[#0F766E]/30 focus:outline-none transition-colors disabled:opacity-60"
      />

      {/* Realistic respondent-facing input preview */}
      <div className="pt-1 pointer-events-none select-none">
        {node.type === 'textarea' ? (
          <div className={`${ct.inputClassName} h-20 opacity-75`} style={ct.inputStyle}>
            {placeholderText}
          </div>
        ) : node.type === 'rating' ? (
          <div className="flex items-center gap-1.5 py-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star key={s} size={22} weight="light" className="opacity-45" />
            ))}
          </div>
        ) : node.type === 'scale' ? (
          <div className="flex flex-wrap gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <span
                key={n}
                style={{
                  borderColor: ct.inputStyle.borderColor,
                  backgroundColor: ct.inputStyle.backgroundColor,
                  color: ct.inputStyle.color,
                }}
                className="w-8 h-8 text-[11px] font-mono border rounded-lg flex items-center justify-center"
              >
                {n}
              </span>
            ))}
          </div>
        ) : node.type === 'yes_no' ? (
          <div className="grid grid-cols-2 gap-2.5 max-w-xs">
            {['Yes', 'No'].map((opt) => (
              <div
                key={opt}
                style={{
                  borderColor: ct.inputStyle.borderColor,
                  backgroundColor: ct.inputStyle.backgroundColor,
                  color: ct.inputStyle.color,
                }}
                className="px-4 py-2.5 text-xs font-semibold border rounded-xl text-center"
              >
                {opt}
              </div>
            ))}
          </div>
        ) : node.type === 'file_upload' ? (
          <div
            style={{
              borderColor: ct.inputStyle.borderColor,
              backgroundColor: ct.inputStyle.backgroundColor,
            }}
            className="p-5 border border-dashed rounded-xl text-center space-y-1"
          >
            <UploadSimple size={20} weight="light" className="mx-auto opacity-60" />
            <p className="text-xs font-medium opacity-75">
              Drag &amp; drop a file or click to browse
            </p>
            <p className="text-[11px] opacity-50">
              {node.content.acceptedFileTypes || 'PDF, PNG, JPG, DOCX'} · Max{' '}
              {node.content.maxFileSizeMb || 10}MB
            </p>
          </div>
        ) : (
          <div
            className={`${ct.inputClassName} flex items-center justify-between opacity-75`}
            style={ct.inputStyle}
          >
            <span>{placeholderText}</span>
            {node.type === 'date' && <CalendarBlank size={15} weight="light" />}
            {node.type === 'time' && <Clock size={15} weight="light" />}
          </div>
        )}
      </div>
    </div>
  );
};

const ChoiceQuestionEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isQuizMode,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const options = node.content.options || [];

  const handleAddOption = () => {
    onUpdate({
      content: { options: [...options, `Option ${options.length + 1}`] },
    });
  };

  const handleUpdateOption = (optIdx: number, val: string) => {
    const next = [...options];
    next[optIdx] = val;
    onUpdate({ content: { options: next } });
  };

  const handleDeleteOption = (optIdx: number) => {
    onUpdate({ content: { options: options.filter((_, i) => i !== optIdx) } });
  };

  return (
    <div className="space-y-2.5" style={{ fontFamily: ct.bodyStyle.fontFamily }}>
      <div className="flex items-start gap-1">
        <input
          type="text"
          disabled={isReadOnly}
          value={node.content.label}
          onChange={(e) => onUpdate({ content: { label: e.target.value } })}
          placeholder="Click to write your question..."
          style={{
            color: ct.headingStyle.color,
            fontSize: ct.headingStyle.fontSize,
            fontWeight: ct.headingStyle.fontWeight || 600,
            textAlign: ct.effectiveAlign,
          }}
          className="w-full text-base font-display font-semibold bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:ring-2 focus:ring-[#0F766E]/40 focus:outline-none transition-colors disabled:opacity-75"
        />
        {node.validation.required && (
          <span className="text-sm font-bold shrink-0 mt-1" style={{ color: ct.accentColor }}>
            *
          </span>
        )}
      </div>

      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.helpText || ''}
        onChange={(e) => onUpdate({ content: { helpText: e.target.value } })}
        placeholder="Add an optional description or hint..."
        style={{ color: ct.bodyStyle.color, textAlign: ct.effectiveAlign }}
        className="w-full text-xs opacity-70 bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:opacity-100 focus:ring-2 focus:ring-[#0F766E]/30 focus:outline-none transition-colors"
      />

      <div className="pt-1 space-y-2">
        {options.map((opt, optIdx) => {
          const isCorrect = String(node.behaviour.correctAnswer ?? '') === String(opt);
          return (
            <div key={optIdx} className="flex items-center gap-2">
              {node.type === 'radio' && (
                <span className="w-4 h-4 rounded-full border border-current opacity-40 shrink-0" />
              )}
              {node.type === 'checkbox' && (
                <span className="w-4 h-4 rounded border border-current opacity-40 shrink-0" />
              )}
              {node.type === 'select' && (
                <span className="text-[11px] font-mono opacity-45 w-4 text-right shrink-0">
                  {optIdx + 1}.
                </span>
              )}

              {isQuizMode && (
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ behaviour: { correctAnswer: opt } });
                  }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isCorrect
                      ? 'bg-[#0F766E] text-white'
                      : 'bg-black/[0.05] text-[#5C6066] hover:text-[#0B0D0F]'
                  }`}
                  title="Mark as correct answer"
                >
                  <Check size={12} weight="bold" />
                </button>
              )}

              <input
                type="text"
                disabled={isReadOnly}
                value={opt}
                onChange={(e) => handleUpdateOption(optIdx, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={ct.inputStyle}
                className={`${ct.inputClassName} flex-1 py-2 text-xs`}
              />

              {options.length > 1 && !isReadOnly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteOption(optIdx);
                  }}
                  className="w-7 h-7 rounded-full text-[#5C6066] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0"
                  title="Remove option"
                  aria-label="Remove option"
                >
                  <Trash size={13} weight="light" />
                </button>
              )}
            </div>
          );
        })}

        {!isReadOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddOption();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.04] hover:bg-black/[0.08] text-xs font-medium transition-colors"
          >
            <Plus size={13} weight="bold" style={{ color: ct.accentColor }} />
            <span>Add option</span>
          </button>
        )}
      </div>
    </div>
  );
};

const HeadingBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const level = node.content.headingLevel || 2;
  const sizeClass =
    level === 1
      ? 'text-2xl sm:text-3xl font-bold'
      : level === 3
      ? 'text-base sm:text-lg font-semibold'
      : 'text-xl sm:text-2xl font-bold';

  return (
    <div className="space-y-1.5" style={{ marginBottom: ct.wrapperStyle.marginBottom }}>
      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.label}
        onChange={(e) => onUpdate({ content: { label: e.target.value } })}
        placeholder="Type a heading..."
        style={ct.headingStyle}
        className={`w-full ${sizeClass} font-display tracking-tight bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:ring-2 focus:ring-[#0F766E]/40 focus:outline-none`}
      />
      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.helpText || ''}
        onChange={(e) => onUpdate({ content: { helpText: e.target.value } })}
        placeholder="Optional subtitle..."
        style={{
          color: ct.bodyStyle.color,
          fontFamily: ct.bodyStyle.fontFamily,
          textAlign: ct.effectiveAlign,
        }}
        className="w-full text-xs opacity-65 bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:opacity-100 focus:outline-none"
      />
    </div>
  );
};

const ParagraphBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-1.5" style={{ marginBottom: ct.wrapperStyle.marginBottom }}>
      {node.type === 'rich_text' && (
        <input
          type="text"
          disabled={isReadOnly}
          value={node.content.label}
          onChange={(e) => onUpdate({ content: { label: e.target.value } })}
          placeholder="Optional callout title..."
          style={ct.headingStyle}
          className="w-full text-sm font-display font-semibold bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:outline-none"
        />
      )}
      <textarea
        rows={node.type === 'rich_text' ? 4 : 3}
        disabled={isReadOnly}
        value={node.content.body ?? node.content.helpText ?? ''}
        onChange={(e) => onUpdate({ content: { body: e.target.value, helpText: e.target.value } })}
        placeholder="Write clear instructions, context, or rich copy..."
        style={ct.bodyStyle}
        className="w-full text-sm leading-relaxed opacity-90 bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1.5 -mx-2 focus:opacity-100 focus:ring-2 focus:ring-[#0F766E]/30 focus:outline-none resize-y"
      />
    </div>
  );
};

const StatementBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div
      className={`${ct.containerClassName} space-y-1.5`}
      style={ct.containerStyle}
    >
      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.label}
        onChange={(e) => onUpdate({ content: { label: e.target.value } })}
        placeholder="Note headline..."
        style={ct.headingStyle}
        className="w-full text-sm font-semibold bg-transparent focus:bg-white rounded px-1.5 py-0.5 -mx-1.5 focus:outline-none"
      />
      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.helpText || ''}
        onChange={(e) => onUpdate({ content: { helpText: e.target.value } })}
        placeholder="Add helpful context for respondents..."
        style={ct.bodyStyle}
        className="w-full text-xs opacity-75 bg-transparent focus:bg-white rounded px-1.5 py-0.5 -mx-1.5 focus:outline-none"
      />
    </div>
  );
};

const ImageBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
  radiusClass = 'rounded-xl',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className={`space-y-2 ${ct.imageContainerClassName}`}>
      {node.content.mediaUrl ? (
        <img
          src={node.content.mediaUrl}
          alt={node.content.mediaAlt || node.content.label || 'Form visual'}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          style={ct.imageStyle}
          className={`${ct.imageClassName} border border-black/10`}
        />
      ) : (
        <div
          className={`w-full h-36 border border-dashed border-black/20 bg-black/[0.025] flex flex-col items-center justify-center gap-1.5 text-center px-4 ${radiusClass}`}
        >
          <ImageIcon size={24} weight="light" className="opacity-50" />
          <span className="text-xs font-medium opacity-75">Image block</span>
          <span className="text-[11px] opacity-50">
            Add an image URL in the right inspector panel
          </span>
        </div>
      )}
      {node.content.mediaCaption && (
        <p className="text-xs opacity-65 text-center w-full">{node.content.mediaCaption}</p>
      )}
    </div>
  );
};

const VideoBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  radiusClass = 'rounded-xl',
}) => {
  const embedUrl = getVideoEmbedUrl(node.content.videoUrl);
  return (
    <div className="space-y-2">
      {embedUrl ? (
        <div
          className={`aspect-video w-full overflow-hidden border border-black/10 bg-black ${radiusClass}`}
        >
          {/\.(mp4|webm|ogg)(\?.*)?$/i.test(embedUrl) ? (
            <video src={embedUrl} controls className="w-full h-full object-cover" />
          ) : (
            <iframe
              src={embedUrl}
              title={node.content.label || 'Embedded video'}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      ) : (
        <div
          className={`h-36 border border-dashed border-black/20 bg-black/[0.025] flex flex-col items-center justify-center gap-1.5 text-center px-4 ${radiusClass}`}
        >
          <VideoCamera size={24} weight="light" className="opacity-50" />
          <span className="text-xs font-medium opacity-75">Video block</span>
          <span className="text-[11px] opacity-50">
            Paste a YouTube, Vimeo, or MP4 URL in the inspector
          </span>
        </div>
      )}
      {node.content.mediaCaption && (
        <p className="text-xs opacity-65 text-center">{node.content.mediaCaption}</p>
      )}
    </div>
  );
};

const DividerBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
}) => (
  <div className="py-2 flex items-center gap-3">
    <div className="h-px flex-1 bg-current opacity-15" />
    <input
      type="text"
      disabled={isReadOnly}
      value={node.content.label}
      onChange={(e) => onUpdate({ content: { label: e.target.value } })}
      placeholder="Optional label"
      className="text-[11px] font-mono text-center opacity-65 bg-transparent hover:bg-black/[0.04] focus:bg-white rounded px-2 py-0.5 focus:outline-none max-w-[160px]"
    />
    <div className="h-px flex-1 bg-current opacity-15" />
  </div>
);

const SpacerBlockEditor: React.FC<EditorComponentRenderProps> = ({ node }) => {
  const heightClass =
    node.content.spacerSize === 'lg'
      ? 'h-16'
      : node.content.spacerSize === 'sm'
      ? 'h-6'
      : 'h-10';
  return (
    <div
      className={`${heightClass} w-full rounded-lg border border-dashed border-black/12 bg-black/[0.015] flex items-center justify-center`}
    >
      <span className="text-[10px] font-mono opacity-45">
        Spacer · {node.content.spacerSize || 'md'}
      </span>
    </div>
  );
};

const ImageTextBlockEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
  radiusClass = 'rounded-xl',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const imageRight = node.content.mediaPosition === 'right';
  const gridColsClass = viewport === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';

  const mediaSlot = node.content.mediaUrl ? (
    <img
      src={node.content.mediaUrl}
      alt={node.content.mediaAlt || node.content.label}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      style={ct.imageStyle}
      className={`w-full h-40 border border-black/10 ${radiusClass}`}
    />
  ) : (
    <div
      className={`w-full h-36 border border-dashed border-black/20 bg-black/[0.03] flex flex-col items-center justify-center gap-1 text-center p-3 ${radiusClass}`}
    >
      <ImageIcon size={20} weight="light" className="opacity-50" />
      <span className="text-[11px] opacity-55">Set image URL in inspector</span>
    </div>
  );

  const textSlot = (
    <div className="space-y-1.5 flex flex-col justify-center">
      <input
        type="text"
        disabled={isReadOnly}
        value={node.content.label}
        onChange={(e) => onUpdate({ content: { label: e.target.value } })}
        placeholder="Feature or story title..."
        style={ct.headingStyle}
        className="w-full text-base font-display font-semibold bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:outline-none"
      />
      <textarea
        rows={3}
        disabled={isReadOnly}
        value={node.content.body || ''}
        onChange={(e) => onUpdate({ content: { body: e.target.value } })}
        placeholder="Describe this visual section..."
        style={ct.bodyStyle}
        className="w-full text-xs leading-relaxed opacity-80 bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-1 -mx-2 focus:opacity-100 focus:outline-none resize-none"
      />
    </div>
  );

  return (
    <div className={`grid ${gridColsClass} gap-4 items-center`}>
      {imageRight ? (
        <>
          {textSlot}
          {mediaSlot}
        </>
      ) : (
        <>
          {mediaSlot}
          {textSlot}
        </>
      )}
    </div>
  );
};

const ProgressIndicatorEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center justify-between text-xs opacity-70">
        <span className="font-medium">{node.content.label || 'Form Progress'}</span>
        <span className="font-mono tabular-nums text-[11px]">50%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-black/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full w-1/2"
          style={{ backgroundColor: ct.accentColor }}
        />
      </div>
    </div>
  );
};

const ContainerHeaderEditor: React.FC<EditorComponentRenderProps> = ({
  node,
  onUpdate,
  isReadOnly,
  design = DEFAULT_STUDIO_DESIGN,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-1">
      {node.type === 'section' && (
        <>
          <input
            type="text"
            disabled={isReadOnly}
            value={node.content.label}
            onChange={(e) => onUpdate({ content: { label: e.target.value } })}
            placeholder="Section title..."
            style={ct.headingStyle}
            className="w-full text-base font-display font-semibold bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-0.5 -mx-2 focus:outline-none"
          />
          <input
            type="text"
            disabled={isReadOnly}
            value={node.content.helpText || ''}
            onChange={(e) => onUpdate({ content: { helpText: e.target.value } })}
            placeholder="Optional section description..."
            style={{ color: ct.bodyStyle.color, textAlign: ct.effectiveAlign }}
            className="w-full text-xs opacity-65 bg-transparent hover:bg-black/[0.03] focus:bg-white rounded-lg px-2 py-0.5 -mx-2 focus:outline-none"
          />
        </>
      )}
    </div>
  );
};

// ============================================================================
// Respondent Renderers (used by Rendering Engine — 1:1 token fidelity)
// ============================================================================

const FieldHeader: React.FC<{
  node: FormComponentNode;
  required: boolean;
  accentColor: string;
  headingStyle: React.CSSProperties;
  bodyStyle: React.CSSProperties;
  inputId?: string;
}> = ({ node, required, accentColor, headingStyle, bodyStyle, inputId }) => (
  <div className="space-y-1">
    <label
      htmlFor={inputId}
      className="block text-sm font-semibold"
      style={{
        color: headingStyle.color,
        fontFamily: headingStyle.fontFamily,
        fontSize: headingStyle.fontSize,
        fontWeight: headingStyle.fontWeight || 600,
        textAlign: headingStyle.textAlign,
      }}
    >
      {node.content.label}
      {required && (
        <span className="ml-1 font-bold" style={{ color: accentColor }} aria-hidden="true">
          *
        </span>
      )}
    </label>
    {node.content.helpText && (
      <p
        className="text-xs opacity-70 leading-relaxed"
        style={{
          color: bodyStyle.color,
          fontFamily: bodyStyle.fontFamily,
          textAlign: bodyStyle.textAlign,
        }}
      >
        {node.content.helpText}
      </p>
    )}
  </div>
);

const FieldErrorBanner: React.FC<{ error?: string; color?: string }> = ({
  error,
  color = '#DC2626',
}) =>
  error ? (
    <p role="alert" className="text-xs font-medium mt-1.5" style={{ color }}>
      {error}
    </p>
  ) : null;

const TextInputRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const inputId = `field-${node.id}`;
  const inputType =
    node.type === 'email'
      ? 'email'
      : node.type === 'phone'
      ? 'tel'
      : node.type === 'url'
      ? 'url'
      : node.type === 'number'
      ? 'number'
      : node.type === 'date'
      ? 'date'
      : node.type === 'time'
      ? 'time'
      : 'text';

  return (
    <div className="space-y-2">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
        inputId={inputId}
      />
      <input
        id={inputId}
        type={inputType}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        data-error={error ? 'true' : 'false'}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={node.content.placeholder || 'Type your answer...'}
        min={node.validation.min}
        max={node.validation.max}
        style={ct.inputStyle}
        className={`${ct.inputClassName} disabled:opacity-55 disabled:cursor-not-allowed`}
      />
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const TextareaRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const inputId = `field-${node.id}`;
  return (
    <div className="space-y-2">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
        inputId={inputId}
      />
      <textarea
        id={inputId}
        rows={4}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        data-error={error ? 'true' : 'false'}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={node.content.placeholder || 'Write your detailed response...'}
        style={ct.inputStyle}
        className={`${ct.inputClassName} resize-y disabled:opacity-55 disabled:cursor-not-allowed`}
      />
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const YesNoRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  radiusClass,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-2.5">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
      />
      <div className="grid grid-cols-2 gap-2.5 max-w-xs" role="radiogroup" aria-label={node.content.label}>
        {['Yes', 'No'].map((choice) => {
          const selected = value === choice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              disabled={disabled}
              aria-checked={selected}
              onClick={() => !disabled && onChange(choice)}
              className={`studio-choice px-4 py-3 border text-sm font-semibold transition-all disabled:opacity-55 disabled:cursor-not-allowed ${radiusClass}`}
              style={{
                borderColor: selected ? ct.accentColor : ct.inputStyle.borderColor,
                backgroundColor: selected ? `${ct.accentColor}16` : ct.inputStyle.backgroundColor,
                color: selected ? ct.accentColor : ct.inputStyle.color,
              }}
            >
              {choice}
            </button>
          );
        })}
      </div>
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const FileUploadRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  radiusClass,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const files = normalizeUploadedFiles(value);
  const maxFiles = node.validation.maxFiles;
  const allowMultiple = (maxFiles ?? 1) > 1;
  const maxSizeMb = node.validation.maxFileSizeMb ?? node.content.maxFileSizeMb ?? 10;

  const acceptTokens = [
    ...(node.validation.allowedExtensions || []),
    ...(node.validation.allowedMimeTypes || []),
  ];
  const acceptAttr =
    acceptTokens.length > 0
      ? acceptTokens.join(',')
      : node.content.acceptedFileTypes || undefined;

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (disabled || !fileList || fileList.length === 0) return;
    const incoming: UploadedFileMeta[] = Array.from(fileList).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      lastModified: f.lastModified,
    }));
    if (allowMultiple) {
      onChange([...files, ...incoming]);
    } else {
      onChange([incoming[0]]);
    }
  };

  const handleRemoveFile = (index: number) => {
    if (disabled) return;
    const next = files.filter((_, idx) => idx !== index);
    onChange(next.length > 0 ? next : []);
  };

  return (
    <div className="space-y-2">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
      />
      <label
        style={{
          backgroundColor: ct.inputStyle.backgroundColor,
          borderColor: error ? ct.errorColor : ct.inputStyle.borderColor,
        }}
        className={`flex flex-col items-center justify-center gap-1.5 p-5 border border-dashed transition-colors ${
          disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'
        } ${radiusClass}`}
      >
        <UploadSimple size={22} weight="light" style={{ color: ct.accentColor }} />
        <span className="text-xs font-semibold">
          {files.length > 0
            ? allowMultiple
              ? `${files.length} file${files.length === 1 ? '' : 's'} attached — click to add more`
              : files[0].name
            : allowMultiple
            ? 'Choose files to upload'
            : 'Choose a file to upload'}
        </span>
        <span className="text-[11px] opacity-60 text-center">
          {acceptTokens.length > 0
            ? acceptTokens.join(', ')
            : node.content.acceptedFileTypes || 'PDF, PNG, JPG, DOCX'}{' '}
          · Max {maxSizeMb}MB
          {maxFiles ? ` · Up to ${maxFiles} file${maxFiles === 1 ? '' : 's'}` : ''}
        </span>
        <input
          type="file"
          multiple={allowMultiple}
          disabled={disabled}
          accept={acceptAttr}
          className="sr-only"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, idx) => (
            <li
              key={`${file.name}_${idx}`}
              className={`flex items-center justify-between gap-2 px-3 py-2 border text-xs ${radiusClass}`}
              style={{
                borderColor: ct.inputStyle.borderColor,
                backgroundColor: ct.inputStyle.backgroundColor,
              }}
            >
              <div className="min-w-0 truncate">
                <span className="font-medium truncate">{file.name}</span>
                {file.size > 0 && (
                  <span className="ml-2 font-mono text-[10px] opacity-60 tabular-nums">
                    {formatFileSize(file.size)}
                  </span>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveFile(idx)}
                  className="p-1 opacity-60 hover:opacity-100 shrink-0"
                  aria-label={`Remove ${file.name}`}
                >
                  <Trash size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const RadioRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  radiusClass,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-2.5">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
      />
      <div className="space-y-2" role="radiogroup" aria-label={node.content.label}>
        {(node.content.options || []).map((opt, idx) => {
          const selected = value === opt;
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              disabled={disabled}
              aria-checked={selected}
              onClick={() => !disabled && onChange(opt)}
              className={`studio-choice w-full text-left px-3.5 py-3 border text-sm transition-all flex items-center gap-3 disabled:opacity-55 disabled:cursor-not-allowed ${radiusClass}`}
              style={{
                borderColor: selected ? ct.accentColor : ct.inputStyle.borderColor,
                backgroundColor: selected ? `${ct.accentColor}14` : ct.inputStyle.backgroundColor,
                color: ct.inputStyle.color,
              }}
            >
              <span
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{ borderColor: selected ? ct.accentColor : ct.inputStyle.borderColor }}
              >
                {selected && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ct.accentColor }} />
                )}
              </span>
              <span className={selected ? 'font-semibold' : ''}>{opt}</span>
            </button>
          );
        })}
      </div>
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const CheckboxRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  radiusClass,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const selectedList = Array.isArray(value) ? (value as string[]) : [];
  const toggleOption = (opt: string) => {
    if (disabled) return;
    const next = selectedList.includes(opt)
      ? selectedList.filter((item) => item !== opt)
      : [...selectedList, opt];
    onChange(next);
  };

  return (
    <div className="space-y-2.5">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
      />
      <div className="space-y-2" role="group" aria-label={node.content.label}>
        {(node.content.options || []).map((opt, idx) => {
          const checked = selectedList.includes(opt);
          return (
            <button
              key={idx}
              type="button"
              role="checkbox"
              disabled={disabled}
              aria-checked={checked}
              onClick={() => toggleOption(opt)}
              className={`studio-choice w-full text-left px-3.5 py-3 border text-sm transition-all flex items-center gap-3 disabled:opacity-55 disabled:cursor-not-allowed ${radiusClass}`}
              style={{
                borderColor: checked ? ct.accentColor : ct.inputStyle.borderColor,
                backgroundColor: checked ? `${ct.accentColor}14` : ct.inputStyle.backgroundColor,
                color: ct.inputStyle.color,
              }}
            >
              <span
                className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-white"
                style={{
                  backgroundColor: checked ? ct.accentColor : 'transparent',
                  border: checked ? 'none' : `1.5px solid ${ct.inputStyle.borderColor || '#9CA3AF'}`,
                }}
              >
                {checked && <Check size={11} weight="bold" />}
              </span>
              <span className={checked ? 'font-semibold' : ''}>{opt}</span>
            </button>
          );
        })}
      </div>
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const SelectRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const inputId = `field-${node.id}`;
  return (
    <div className="space-y-2">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
        inputId={inputId}
      />
      <select
        id={inputId}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        data-error={error ? 'true' : 'false'}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        style={ct.inputStyle}
        className={`${ct.inputClassName} disabled:opacity-55 disabled:cursor-not-allowed`}
      >
        <option value="">Select an option...</option>
        {(node.content.options || []).map((opt, idx) => (
          <option key={idx} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const RatingRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const current = Number(value) || 0;
  return (
    <div className="space-y-2.5">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
      />
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(star)}
            aria-label={`Rate ${star} out of 5`}
            className="studio-choice p-1.5 rounded-xl hover:bg-black/[0.04] transition-transform active:scale-95 disabled:opacity-55 disabled:cursor-not-allowed"
          >
            <Star
              size={26}
              weight={current >= star ? 'fill' : 'light'}
              style={{ color: current >= star ? '#F59E0B' : 'currentColor', opacity: current >= star ? 1 : 0.35 }}
            />
          </button>
        ))}
      </div>
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const ScaleRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  value,
  onChange,
  error,
  required,
  disabled = false,
  design,
  radiusClass,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const min = node.validation.min ?? 0;
  const max = node.validation.max ?? 10;
  const steps = Array.from({ length: Math.min(11, Math.max(2, max - min + 1)) }, (_, i) => min + i);

  return (
    <div className="space-y-2.5">
      <FieldHeader
        node={node}
        required={required}
        accentColor={ct.accentColor}
        headingStyle={ct.headingStyle}
        bodyStyle={ct.bodyStyle}
      />
      <div className="flex flex-wrap gap-1.5">
        {steps.map((num) => {
          const selected = value === num;
          return (
            <button
              key={num}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(num)}
              className={`studio-choice min-w-[36px] h-9 px-2 text-xs font-semibold border transition-all disabled:opacity-55 disabled:cursor-not-allowed ${radiusClass}`}
              style={{
                backgroundColor: selected ? ct.accentColor : ct.inputStyle.backgroundColor,
                color: selected ? '#FFFFFF' : ct.inputStyle.color,
                borderColor: selected ? ct.accentColor : ct.inputStyle.borderColor,
              }}
            >
              {num}
            </button>
          );
        })}
      </div>
      <FieldErrorBanner error={error} color={ct.errorColor} />
    </div>
  );
};

const StatementRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className={`${ct.containerClassName} space-y-1`} style={ct.containerStyle}>
      {node.content.label && (
        <h3 className="text-sm font-semibold" style={ct.headingStyle}>
          {node.content.label}
        </h3>
      )}
      {(node.content.body || node.content.helpText) && (
        <p className="text-xs opacity-80 leading-relaxed whitespace-pre-line" style={ct.bodyStyle}>
          {node.content.body || node.content.helpText}
        </p>
      )}
    </div>
  );
};

const HeadingRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const level = node.content.headingLevel || 2;
  const className =
    level === 1
      ? 'text-2xl sm:text-3xl font-display font-bold tracking-tight'
      : level === 3
      ? 'text-base sm:text-lg font-display font-semibold'
      : 'text-xl sm:text-2xl font-display font-bold tracking-tight';

  const Tag = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';

  return (
    <div className="space-y-1 pt-1" style={{ marginBottom: ct.wrapperStyle.marginBottom }}>
      <Tag className={className} style={ct.headingStyle}>
        {node.content.label}
      </Tag>
      {node.content.helpText && (
        <p className="text-sm opacity-75 leading-relaxed" style={ct.bodyStyle}>
          {node.content.helpText}
        </p>
      )}
    </div>
  );
};

const ParagraphRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-1.5" style={{ marginBottom: ct.wrapperStyle.marginBottom }}>
      {node.type === 'rich_text' && node.content.label && (
        <h4 className="text-sm font-semibold" style={ct.headingStyle}>
          {node.content.label}
        </h4>
      )}
      <p className="text-sm opacity-85 leading-relaxed whitespace-pre-line" style={ct.bodyStyle}>
        {node.content.body || node.content.helpText || ''}
      </p>
    </div>
  );
};

const ImageRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  viewport = 'desktop',
}) => {
  if (!node.content.mediaUrl) return null;
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <figure className={`space-y-1.5 ${ct.imageContainerClassName}`}>
      <img
        src={node.content.mediaUrl}
        alt={node.content.mediaAlt || node.content.label || 'Form visual'}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={ct.imageStyle}
        className={`${ct.imageClassName} border border-black/[0.08]`}
      />
      {node.content.mediaCaption && (
        <figcaption className="text-xs opacity-65 text-center w-full">
          {node.content.mediaCaption}
        </figcaption>
      )}
    </figure>
  );
};

const VideoRespondent: React.FC<RespondentComponentRenderProps> = ({ node, radiusClass }) => {
  const embedUrl = getVideoEmbedUrl(node.content.videoUrl);
  if (!embedUrl) return null;
  return (
    <figure className="space-y-1.5">
      <div className={`aspect-video w-full overflow-hidden bg-black ${radiusClass}`}>
        {/\.(mp4|webm|ogg)(\?.*)?$/i.test(embedUrl) ? (
          <video src={embedUrl} controls className="w-full h-full object-cover" />
        ) : (
          <iframe
            src={embedUrl}
            title={node.content.label || 'Embedded video'}
            className="w-full h-full"
            loading="lazy"
            allowFullScreen
          />
        )}
      </div>
      {node.content.mediaCaption && (
        <figcaption className="text-xs opacity-65 text-center">
          {node.content.mediaCaption}
        </figcaption>
      )}
    </figure>
  );
};

const DividerRespondent: React.FC<RespondentComponentRenderProps> = ({ node }) => (
  <div className="py-2 flex items-center gap-3">
    <div className="h-px flex-1 bg-current opacity-15" />
    {node.content.label && (
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-55">
        {node.content.label}
      </span>
    )}
    <div className="h-px flex-1 bg-current opacity-15" />
  </div>
);

const SpacerRespondent: React.FC<RespondentComponentRenderProps> = ({ node }) => {
  const heightClass =
    node.content.spacerSize === 'lg'
      ? 'h-14'
      : node.content.spacerSize === 'sm'
      ? 'h-4'
      : 'h-8';
  return <div className={heightClass} aria-hidden="true" />;
};

const ImageTextRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  radiusClass,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const imageRight = node.content.mediaPosition === 'right';
  const gridColsClass = viewport === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';
  const img = node.content.mediaUrl ? (
    <img
      src={node.content.mediaUrl}
      alt={node.content.mediaAlt || node.content.label}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      style={ct.imageStyle}
      className={`w-full h-44 ${radiusClass}`}
    />
  ) : (
    <div
      className={`w-full h-44 bg-black/[0.04] border border-black/[0.08] flex items-center justify-center ${radiusClass}`}
    >
      <ImageIcon size={24} weight="light" className="opacity-40" />
    </div>
  );

  const text = (
    <div className="space-y-1.5 flex flex-col justify-center">
      {node.content.label && (
        <h3 className="text-base font-display font-semibold" style={ct.headingStyle}>
          {node.content.label}
        </h3>
      )}
      {node.content.body && (
        <p className="text-sm opacity-80 leading-relaxed whitespace-pre-line" style={ct.bodyStyle}>
          {node.content.body}
        </p>
      )}
    </div>
  );

  return (
    <div className={`grid ${gridColsClass} gap-5 items-center`}>
      {imageRight ? (
        <>
          {text}
          {img}
        </>
      ) : (
        <>
          {img}
          {text}
        </>
      )}
    </div>
  );
};

const ProgressIndicatorRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  progressPercent = 0,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center justify-between text-xs opacity-70">
        <span className="font-medium">{node.content.label || 'Progress'}</span>
        <span className="font-mono tabular-nums text-[11px]">{progressPercent}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-black/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%`, backgroundColor: ct.accentColor }}
        />
      </div>
    </div>
  );
};

const ContainerRespondent: React.FC<RespondentComponentRenderProps> = ({
  node,
  design,
  renderedChildren,
  viewport = 'desktop',
}) => {
  const ct = resolveComponentTokens(node, design, viewport);
  const cols = resolveContainerColumns(node, viewport);
  const gridColsClass =
    cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const gapKey = node.layout.gap || design.columnGap || 'md';
  const gapClass =
    gapKey === 'lg' ? 'gap-6' : gapKey === 'sm' ? 'gap-3' : 'gap-4';

  return (
    <div
      className={`${ct.containerClassName} space-y-4`}
      style={ct.containerStyle}
    >
      {node.type === 'section' && (node.content.label || node.content.helpText) && (
        <div className="space-y-0.5">
          {node.content.label && (
            <h3 className="text-base font-display font-semibold" style={ct.headingStyle}>
              {node.content.label}
            </h3>
          )}
          {node.content.helpText && (
            <p className="text-xs opacity-75" style={ct.bodyStyle}>
              {node.content.helpText}
            </p>
          )}
        </div>
      )}
      <div className={`grid ${gridColsClass} ${gapClass}`}>{renderedChildren}</div>
    </div>
  );
};

// ============================================================================
// Built-in Component Registry Catalog (4 Categories: Content, Fields, Layout, Other)
// ============================================================================

const BASE_QUESTION_OPTIONS: ComponentConfigOption[] = [
  'label',
  'helpText',
  'placeholder',
  'required',
  'width',
  'textAlign',
  'quizScoring',
];

const CHOICE_QUESTION_OPTIONS: ComponentConfigOption[] = [
  'label',
  'helpText',
  'options',
  'required',
  'width',
  'textAlign',
  'quizScoring',
];

const DEFAULT_APPEARANCE = { textAlign: 'left' as const };
const DEFAULT_LAYOUT = { width: 'full' as const, padding: 'none' as const, margin: 'none' as const };

export const BUILTIN_COMPONENT_DEFINITIONS: FormComponentDefinition[] = [
  // ==========================================================================
  // CONTENT
  // ==========================================================================
  {
    type: 'heading',
    displayName: 'Heading',
    shortLabel: 'Heading',
    hint: 'Display title to organize sections',
    category: 'content',
    isQuestion: false,
    keywords: ['title', 'h1', 'h2', 'h3', 'header'],
    icon: TextH,
    defaultContent: {
      label: 'New Section Heading',
      helpText: 'Optional subtitle describing this section',
      headingLevel: 2,
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'headingLevel', 'width', 'textAlign'],
    EditorRenderer: HeadingBlockEditor,
    RespondentRenderer: HeadingRespondent,
  },
  {
    type: 'paragraph',
    displayName: 'Paragraph',
    shortLabel: 'Paragraph',
    hint: 'Body copy or concise instructions',
    category: 'content',
    isQuestion: false,
    keywords: ['text', 'copy', 'description', 'body'],
    icon: Article,
    defaultContent: {
      label: '',
      body: 'Add helpful context, policy notes, or guidance for your respondents.',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['body', 'width', 'textAlign'],
    EditorRenderer: ParagraphBlockEditor,
    RespondentRenderer: ParagraphRespondent,
  },
  {
    type: 'rich_text',
    displayName: 'Rich Text',
    shortLabel: 'Rich Text',
    hint: 'Titled editorial copy & formatted notes',
    category: 'content',
    isQuestion: false,
    keywords: ['markdown', 'article', 'content', 'callout'],
    icon: TextAa,
    defaultContent: {
      label: 'Important Information',
      body: 'Share detailed instructions, terms, or multi-paragraph notes cleanly inside your form.',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'body', 'width', 'textAlign', 'backgroundColor'],
    EditorRenderer: ParagraphBlockEditor,
    RespondentRenderer: ParagraphRespondent,
  },
  {
    type: 'image',
    displayName: 'Image',
    shortLabel: 'Image',
    hint: 'Visual media banner or illustration',
    category: 'content',
    isQuestion: false,
    keywords: ['photo', 'picture', 'banner', 'media', 'logo'],
    icon: ImageIcon,
    defaultContent: {
      label: 'Image',
      mediaUrl: '',
      mediaAlt: 'Visual illustration',
      mediaCaption: '',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['media', 'width', 'textAlign'],
    EditorRenderer: ImageBlockEditor,
    RespondentRenderer: ImageRespondent,
  },
  {
    type: 'video',
    displayName: 'Video',
    shortLabel: 'Video',
    hint: 'Embed YouTube, Vimeo, or MP4 clips',
    category: 'content',
    isQuestion: false,
    keywords: ['youtube', 'vimeo', 'embed', 'media', 'clip'],
    icon: VideoCamera,
    defaultContent: {
      label: 'Video',
      videoUrl: '',
      mediaCaption: '',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['video', 'width'],
    EditorRenderer: VideoBlockEditor,
    RespondentRenderer: VideoRespondent,
  },
  {
    type: 'divider',
    displayName: 'Divider',
    shortLabel: 'Divider',
    hint: 'Clean horizontal visual separator',
    category: 'content',
    isQuestion: false,
    keywords: ['line', 'hr', 'separator', 'break'],
    icon: Minus,
    defaultContent: { label: '' },
    defaultAppearance: { textAlign: 'center' },
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'width'],
    EditorRenderer: DividerBlockEditor,
    RespondentRenderer: DividerRespondent,
  },
  {
    type: 'spacer',
    displayName: 'Spacer',
    shortLabel: 'Spacer',
    hint: 'Add breathing room between blocks',
    category: 'content',
    isQuestion: false,
    keywords: ['space', 'gap', 'padding', 'margin'],
    icon: ArrowsVertical,
    defaultContent: { label: 'Spacer', spacerSize: 'md' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['spacerSize', 'width'],
    EditorRenderer: SpacerBlockEditor,
    RespondentRenderer: SpacerRespondent,
  },
  {
    type: 'statement',
    displayName: 'Info Note',
    shortLabel: 'Note',
    hint: 'Highlighted callout card for tips',
    category: 'content',
    isQuestion: false,
    keywords: ['callout', 'statement', 'notice'],
    icon: ChatCircleText,
    defaultContent: {
      label: 'A quick note before you continue:',
      helpText: 'Share important context with respondents here.',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'width', 'textAlign'],
    EditorRenderer: StatementBlockEditor,
    RespondentRenderer: StatementRespondent,
  },

  // ==========================================================================
  // FORM FIELDS (Reusing all 13 existing question types + Yes/No, Time, File Upload)
  // ==========================================================================
  {
    type: 'text',
    displayName: 'Short Text',
    shortLabel: 'Short Text',
    hint: 'Names, titles, single-line replies',
    category: 'fields',
    isQuestion: true,
    keywords: ['input', 'name', 'string'],
    icon: TextT,
    defaultContent: { label: 'What is your full name?', placeholder: 'Type your answer...' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: BASE_QUESTION_OPTIONS,
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'textarea',
    displayName: 'Long Text',
    shortLabel: 'Long Text',
    hint: 'Multi-line feedback or descriptions',
    category: 'fields',
    isQuestion: true,
    keywords: ['paragraph', 'comments', 'message', 'bio'],
    icon: AlignLeft,
    defaultContent: { label: 'Tell us more in detail...', placeholder: 'Write as much as you like...' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: BASE_QUESTION_OPTIONS,
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextareaRespondent,
  },
  {
    type: 'email',
    displayName: 'Email',
    shortLabel: 'Email',
    hint: 'Validated email address input',
    category: 'fields',
    isQuestion: true,
    keywords: ['contact', 'mail'],
    icon: EnvelopeSimple,
    defaultContent: { label: 'What is your email address?', placeholder: 'name@example.com' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: BASE_QUESTION_OPTIONS,
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'phone',
    displayName: 'Phone',
    shortLabel: 'Phone',
    hint: 'Mobile or business phone number',
    category: 'fields',
    isQuestion: true,
    keywords: ['telephone', 'mobile', 'contact'],
    icon: Phone,
    defaultContent: { label: 'What is your phone number?', placeholder: '+1 (555) 000-0000' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: BASE_QUESTION_OPTIONS,
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'number',
    displayName: 'Number',
    shortLabel: 'Number',
    hint: 'Quantities, budget, or numeric values',
    category: 'fields',
    isQuestion: true,
    keywords: ['numeric', 'amount', 'count', 'age'],
    icon: Hash,
    defaultContent: { label: 'Enter a number:', placeholder: '0' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'placeholder', 'required', 'minMax', 'width', 'textAlign'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'select',
    displayName: 'Dropdown',
    shortLabel: 'Dropdown',
    hint: 'Compact menu of selectable options',
    category: 'fields',
    isQuestion: true,
    keywords: ['select', 'menu', 'list'],
    icon: CaretCircleDown,
    defaultContent: {
      label: 'Pick an option from the list:',
      options: ['Option 1', 'Option 2', 'Option 3'],
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: CHOICE_QUESTION_OPTIONS,
    EditorRenderer: ChoiceQuestionEditor,
    RespondentRenderer: SelectRespondent,
  },
  {
    type: 'radio',
    displayName: 'Single Choice',
    shortLabel: 'Single Choice',
    hint: 'Respondents select one option',
    category: 'fields',
    isQuestion: true,
    keywords: ['radio', 'pick one', 'options'],
    icon: RadioButton,
    defaultContent: {
      label: 'Choose the option that best fits:',
      options: ['Option 1', 'Option 2', 'Option 3'],
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: CHOICE_QUESTION_OPTIONS,
    EditorRenderer: ChoiceQuestionEditor,
    RespondentRenderer: RadioRespondent,
  },
  {
    type: 'checkbox',
    displayName: 'Multiple Choice',
    shortLabel: 'Checkboxes',
    hint: 'Respondents select one or more options',
    category: 'fields',
    isQuestion: true,
    keywords: ['multi', 'checkbox', 'select all'],
    icon: CheckSquare,
    defaultContent: {
      label: 'Select all that apply:',
      options: ['Option 1', 'Option 2', 'Option 3'],
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: CHOICE_QUESTION_OPTIONS,
    EditorRenderer: ChoiceQuestionEditor,
    RespondentRenderer: CheckboxRespondent,
  },
  {
    type: 'yes_no',
    displayName: 'Yes / No',
    shortLabel: 'Yes / No',
    hint: 'Quick binary yes or no decision',
    category: 'fields',
    isQuestion: true,
    keywords: ['boolean', 'toggle', 'confirm', 'agree'],
    icon: ToggleLeft,
    defaultContent: {
      label: 'Would you like to proceed?',
      options: ['Yes', 'No'],
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'required', 'width', 'textAlign', 'quizScoring'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: YesNoRespondent,
  },
  {
    type: 'date',
    displayName: 'Date',
    shortLabel: 'Date',
    hint: 'Bookings, deadlines, or birthdays',
    category: 'fields',
    isQuestion: true,
    keywords: ['calendar', 'day', 'schedule'],
    icon: CalendarBlank,
    defaultContent: { label: 'Pick a date:' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'required', 'width', 'textAlign'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'time',
    displayName: 'Time',
    shortLabel: 'Time',
    hint: 'Appointment or availability time',
    category: 'fields',
    isQuestion: true,
    keywords: ['clock', 'hour', 'schedule'],
    icon: Clock,
    defaultContent: { label: 'Select a preferred time:' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'required', 'width', 'textAlign'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'file_upload',
    displayName: 'File Upload',
    shortLabel: 'File Upload',
    hint: 'Collect resumes, documents, or photos',
    category: 'fields',
    isQuestion: true,
    keywords: ['attachment', 'pdf', 'document', 'upload'],
    icon: UploadSimple,
    defaultContent: {
      label: 'Upload supporting file',
      helpText: 'Accepted formats: PDF, PNG, JPG, DOCX',
      acceptedFileTypes: '.pdf,.png,.jpg,.jpeg,.docx',
      maxFileSizeMb: 10,
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'fileUpload', 'required', 'width'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: FileUploadRespondent,
  },
  {
    type: 'url',
    displayName: 'URL',
    shortLabel: 'URL',
    hint: 'Website, portfolio, or social link',
    category: 'fields',
    isQuestion: true,
    keywords: ['website', 'link', 'portfolio'],
    icon: LinkSimple,
    defaultContent: { label: 'What is your website or portfolio link?', placeholder: 'https://...' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: BASE_QUESTION_OPTIONS,
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: TextInputRespondent,
  },
  {
    type: 'rating',
    displayName: 'Star Rating',
    shortLabel: 'Star Rating',
    hint: '1 to 5 star feedback score',
    category: 'fields',
    isQuestion: true,
    keywords: ['stars', 'review', 'feedback'],
    icon: Star,
    defaultContent: { label: 'How would you rate your experience?' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false, min: 1, max: 5 },
    supportedOptions: ['label', 'helpText', 'required', 'width', 'textAlign', 'quizScoring'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: RatingRespondent,
  },
  {
    type: 'scale',
    displayName: 'Opinion Scale',
    shortLabel: '0–10 Scale',
    hint: 'NPS or 0 to 10 satisfaction score',
    category: 'fields',
    isQuestion: true,
    keywords: ['nps', 'slider', 'score'],
    icon: SlidersHorizontal,
    defaultContent: { label: 'On a scale of 0 to 10, how likely are you to recommend us?' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false, min: 0, max: 10 },
    supportedOptions: ['label', 'helpText', 'required', 'minMax', 'width', 'textAlign'],
    EditorRenderer: VisualFieldEditor,
    RespondentRenderer: ScaleRespondent,
  },

  // ==========================================================================
  // LAYOUT
  // ==========================================================================
  {
    type: 'section',
    displayName: 'Section',
    shortLabel: 'Section',
    hint: 'Titled container to group related blocks',
    category: 'layout',
    isQuestion: false,
    isContainer: true,
    keywords: ['group', 'block', 'wrapper', 'area'],
    icon: Rows,
    defaultContent: {
      label: 'Section Title',
      helpText: 'Drop questions or layout blocks inside this section',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: { width: 'full', columns: 1, gap: 'md', padding: 'md', margin: 'none' },
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'helpText', 'containerLayout', 'backgroundColor'],
    EditorRenderer: ContainerHeaderEditor,
    RespondentRenderer: ContainerRespondent,
  },
  {
    type: 'container',
    displayName: 'Container',
    shortLabel: 'Container',
    hint: 'Clean single-column box for nested blocks',
    category: 'layout',
    isQuestion: false,
    isContainer: true,
    keywords: ['box', 'card', 'frame', 'group'],
    icon: SquaresFour,
    defaultContent: { label: 'Container' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: { width: 'full', columns: 1, gap: 'md', padding: 'md', margin: 'none' },
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['containerLayout', 'backgroundColor', 'width'],
    EditorRenderer: ContainerHeaderEditor,
    RespondentRenderer: ContainerRespondent,
  },
  {
    type: 'two_column',
    displayName: 'Two-Column Layout',
    shortLabel: '2 Columns',
    hint: 'Side-by-side two-column responsive grid',
    category: 'layout',
    isQuestion: false,
    isContainer: true,
    keywords: ['grid', '2 col', 'side by side', 'columns', 'split'],
    icon: SquareHalf,
    defaultContent: { label: 'Two-Column Row' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: { width: 'full', columns: 2, gap: 'md', padding: 'sm', margin: 'none' },
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['containerLayout', 'backgroundColor'],
    EditorRenderer: ContainerHeaderEditor,
    RespondentRenderer: ContainerRespondent,
  },
  {
    type: 'three_column',
    displayName: 'Three-Column Layout',
    shortLabel: '3 Columns',
    hint: 'Balanced three-column responsive grid',
    category: 'layout',
    isQuestion: false,
    isContainer: true,
    keywords: ['grid', '3 col', 'columns', 'triple'],
    icon: Columns,
    defaultContent: { label: 'Three-Column Row' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: { width: 'full', columns: 3, gap: 'md', padding: 'sm', margin: 'none' },
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['containerLayout', 'backgroundColor'],
    EditorRenderer: ContainerHeaderEditor,
    RespondentRenderer: ContainerRespondent,
  },
  {
    type: 'image_text',
    displayName: 'Image & Text',
    shortLabel: 'Image & Text',
    hint: 'Split media visual alongside copy',
    category: 'layout',
    isQuestion: false,
    keywords: ['split', 'feature', 'hero', 'media'],
    icon: Layout,
    defaultContent: {
      label: 'Highlight a key detail',
      body: 'Pair a product visual or illustration next to concise guidance for your respondents.',
      mediaUrl: '',
      mediaAlt: 'Visual feature',
      mediaPosition: 'left',
    },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'body', 'media', 'mediaPosition', 'width'],
    EditorRenderer: ImageTextBlockEditor,
    RespondentRenderer: ImageTextRespondent,
  },

  // ==========================================================================
  // OTHER
  // ==========================================================================
  {
    type: 'welcome_screen',
    displayName: 'Welcome Screen',
    shortLabel: 'Welcome Screen',
    hint: 'Enable & configure the opening cover',
    category: 'other',
    isQuestion: false,
    specialAction: 'welcome',
    keywords: ['intro', 'cover', 'start'],
    icon: HandWaving,
    defaultContent: { label: 'Welcome Screen' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: [],
    EditorRenderer: StatementBlockEditor,
    RespondentRenderer: StatementRespondent,
  },
  {
    type: 'thank_you_screen',
    displayName: 'Thank-You Screen',
    shortLabel: 'Thank-You',
    hint: 'Configure the post-submission screen',
    category: 'other',
    isQuestion: false,
    specialAction: 'thank_you',
    keywords: ['ending', 'complete', 'confirmation'],
    icon: Confetti,
    defaultContent: { label: 'Thank-You Screen' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: [],
    EditorRenderer: StatementBlockEditor,
    RespondentRenderer: StatementRespondent,
  },
  {
    type: 'progress_indicator',
    displayName: 'Progress Indicator',
    shortLabel: 'Progress Bar',
    hint: 'Inline visual completion bar block',
    category: 'other',
    isQuestion: false,
    keywords: ['progress', 'bar', 'steps', 'percent'],
    icon: ChartLineUp,
    defaultContent: { label: 'Completion Progress' },
    defaultAppearance: DEFAULT_APPEARANCE,
    defaultLayout: DEFAULT_LAYOUT,
    defaultBehaviour: {},
    defaultValidation: { required: false },
    supportedOptions: ['label', 'width'],
    EditorRenderer: ProgressIndicatorEditor,
    RespondentRenderer: ProgressIndicatorRespondent,
  },
];

export const formComponentRegistry = new ComponentRegistry().registerMany(
  BUILTIN_COMPONENT_DEFINITIONS
);

export const RegisteredComponentIcon: React.FC<{
  type: FormComponentType;
  size?: number;
  className?: string;
}> = ({ type, size = 16, className = '' }) => {
  const def = formComponentRegistry.get(type);
  const Icon = def?.icon || TextT;
  return <Icon size={size} weight="light" className={className} />;
};
