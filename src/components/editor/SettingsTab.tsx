import React, { useState } from 'react';
import { FormSchema, FormSettings } from '../../types/form';
import {
  Globe,
  Award,
  Send,
  Bell,
  Lock,
  Download,
  Upload,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface SettingsTabProps {
  form: FormSchema;
  onUpdateSettings: (settings: FormSettings) => void;
  onExportSchema: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  form,
  onUpdateSettings,
  onExportSchema,
}) => {
  const { settings } = form;
  const [webhookTestStatus, setWebhookTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  const handleTestWebhook = async () => {
    setWebhookTestStatus({ loading: true });

    try {
      const response = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'form_submission.test',
          formId: form.id,
          formTitle: form.title,
          timestamp: new Date().toISOString(),
          samplePayload: {
            field_name: 'Elena Vance',
            field_email: 'elena@studio.design',
          },
        }),
      });

      const data = await response.json();
      setWebhookTestStatus({
        loading: false,
        success: response.ok,
        message: response.ok
          ? `Webhook endpoint responded 200 OK (${new Date().toLocaleTimeString()})`
          : 'Webhook endpoint returned error.',
      });
    } catch (e: any) {
      setWebhookTestStatus({
        loading: false,
        success: false,
        message: e.message || 'Failed to ping webhook URL.',
      });
    }
  };

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

        {/* Webhooks & API Integration */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-neutral-700" />
            <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px]">
              Webhook Event Integration
            </span>
          </div>

          <p className="text-neutral-500">
            Transmit real-time JSON payloads whenever a respondent submits this form (compatible with Zapier, Make, n8n, Slack, or custom API endpoints).
          </p>

          <div className="space-y-2">
            <label className="font-medium text-neutral-700">Webhook POST URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={settings.webhookUrl || ''}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, webhookUrl: e.target.value })
                }
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                className="flex-1 px-3 py-1.5 font-mono border rounded-md border-neutral-200 focus:border-neutral-900"
              />
              <button
                type="button"
                onClick={handleTestWebhook}
                disabled={webhookTestStatus.loading}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded-md transition-colors shrink-0"
              >
                {webhookTestStatus.loading ? 'Pinging...' : 'Send Test Event'}
              </button>
            </div>

            {webhookTestStatus.message && (
              <p
                className={`text-[11px] font-medium flex items-center gap-1.5 pt-1 ${
                  webhookTestStatus.success ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {webhookTestStatus.success ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                <span>{webhookTestStatus.message}</span>
              </p>
            )}
          </div>
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
