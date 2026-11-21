import React from 'react';
import { FormSchema, FormSettings } from '../../types/form';
import {
  Award,
  Send,
  Download,
  ExternalLink,
} from 'lucide-react';

interface SettingsTabProps {
  form: FormSchema;
  onUpdateSettings: (settings: FormSettings) => void;
  onExportSchema: () => void;
  onOpenIntegrations?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  form,
  onUpdateSettings,
  onExportSchema,
  onOpenIntegrations,
}) => {
  const { settings } = form;

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Form Configuration & Integrations</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Configure access control, submission constraints, quiz scoring modes, and webhook endpoints.
          </p>
        </div>

        {/* General & URL Slug */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4 text-xs">
          <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px] block">
            Publication & URL Path
          </span>

          <div className="space-y-1.5">
            <label className="font-medium text-neutral-700">Form URL Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-neutral-400 font-mono">/p/</span>
              <input
                type="text"
                value={settings.slug}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  })
                }
                className="flex-1 px-3 py-1.5 font-mono border rounded-md border-neutral-200 focus:border-neutral-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-neutral-700">Custom Submit Button Text</label>
            <input
              type="text"
              value={settings.submitButtonText || ''}
              onChange={(e) =>
                onUpdateSettings({ ...settings, submitButtonText: e.target.value })
              }
              placeholder="Submit Form"
              className="w-full px-3 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 font-medium text-neutral-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={settings.allowMultipleSubmissions}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  allowMultipleSubmissions: e.target.checked,
                })
              }
              className="rounded text-neutral-900"
            />
            <span>Allow respondents to submit more than once from same device</span>
          </label>
        </div>

        {/* Form Progress Bar Toggle */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-3 text-xs">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px] block">
                Form Progress Bar
              </span>
              <p className="text-neutral-500 leading-relaxed">
                Show a live completion progress bar to respondents as they move through your form.
                Forms with conditional branching automatically switch to a dynamic path indicator.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                aria-label="Toggle form progress bar"
                checked={settings.showProgressBar !== false}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, showProgressBar: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900" />
            </label>
          </div>
        </div>

        {/* Conditional Logic — Hidden Field Answer Policy */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-3 text-xs">
          <div className="space-y-1">
            <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px] block">
              Hidden Field Answer Policy
            </span>
            <p className="text-neutral-500 leading-relaxed">
              Define how previously entered answers are handled when conditional logic hides a
              question, section, or page.
            </p>
          </div>

          <div className="space-y-2 pt-1">
            {(
              [
                {
                  value: 'preserve_on_hide_omit_on_submit',
                  title: 'Preserve while navigating, omit from submitted response (Recommended)',
                  desc: 'Respondents keep their typed values if they go back and change an answer, while hidden answers are cleanly excluded from the final submission.',
                },
                {
                  value: 'preserve_always',
                  title: 'Preserve in submitted response',
                  desc: 'Keep entered values even when a field is hidden by conditional logic, and include them in the saved response.',
                },
                {
                  value: 'clear_on_hide',
                  title: 'Clear immediately when hidden',
                  desc: 'Erase a field’s value the moment a rule hides it.',
                },
              ] as const
            ).map((opt) => {
              const activePolicy =
                settings.hiddenFieldPolicy || 'preserve_on_hide_omit_on_submit';
              const checked = activePolicy === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? 'border-neutral-900 bg-neutral-50'
                      : 'border-neutral-200 hover:bg-neutral-50/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="hiddenFieldPolicy"
                    value={opt.value}
                    checked={checked}
                    onChange={() =>
                      onUpdateSettings({
                        ...settings,
                        hiddenFieldPolicy: opt.value,
                      })
                    }
                    className="mt-0.5 accent-neutral-900"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-neutral-900">{opt.title}</div>
                    <div className="text-neutral-500 leading-relaxed">{opt.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Quiz & Scoring Mode */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px]">
                Interactive Quiz & Assessment Mode
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.isQuizMode}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, isQuizMode: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900" />
            </label>
          </div>

          <p className="text-neutral-500 leading-relaxed">
            When enabled, question cards can specify points and correct answers. Respondents receive an instant graded score card upon completing the form.
          </p>
        </div>

        {/* Submission Limits */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4 text-xs">
          <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px] block">
            Submission Limits & Expiry
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-medium text-neutral-700">Max Submissions Cap</label>
              <input
                type="number"
                min={0}
                value={settings.closeAfterSubmissions || ''}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    closeAfterSubmissions: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                placeholder="Unlimited (empty)"
                className="w-full px-3 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-neutral-700">Automatic Expiration Date</label>
              <input
                type="date"
                value={settings.closeAtDate || ''}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, closeAtDate: e.target.value || null })
                }
                className="w-full px-3 py-1.5 border rounded-md border-neutral-200 focus:border-neutral-900"
              />
            </div>
          </div>
        </div>

        {/* Webhooks & Integrations Studio Bridge */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-[#0F766E]" />
              <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px]">
                Integrations & Signed Webhooks
              </span>
            </div>
            {onOpenIntegrations && (
              <button
                type="button"
                onClick={onOpenIntegrations}
                className="px-3 py-1.5 bg-[#0B0D0F] hover:bg-[#191D21] text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
              >
                <span>Open Integrations Studio</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-neutral-500 leading-relaxed">
            Configure signed HTTPS webhooks, Slack channel notifications, and custom REST API
            connectors with field-level data filtering, payload previews, secret rotation, automatic
            retries, and full delivery logs in the Integrations tab.
          </p>
        </div>

        {/* Schema Portability & Backup */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4 text-xs">
          <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px] block">
            Schema Portability & Backups
          </span>

          <p className="text-neutral-500">
            Export the complete schema representation of this form (fields, logic, styles, and settings) for local archiving or deployment.
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={onExportSchema}
              className="px-3.5 py-2 border border-neutral-200 hover:bg-neutral-50 rounded-lg text-neutral-800 font-semibold transition-colors flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Form Schema (.JSON)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
