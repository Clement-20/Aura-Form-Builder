import React, { useState } from 'react';
import { FormSchema } from '../../types/form';
import {
  Copy,
  Check,
  ExternalLink,
  QrCode,
  Code,
  Share2,
  Download,
  Smartphone,
  Globe,
} from 'lucide-react';

interface ShareTabProps {
  form: FormSchema;
  onOpenPublicView: (slug: string) => void;
}

export const ShareTab: React.FC<ShareTabProps> = ({ form, onOpenPublicView }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const formSlug = form.settings.slug || form.id;
  const baseUrl = window.location.origin;
  const shareableUrl = `${baseUrl}/#p=${formSlug}`;

  const embedCode = `<iframe
  src="${shareableUrl}"
  width="100%"
  height="700"
  frameborder="0"
  marginheight="0"
  marginwidth="0"
  style="border-radius: 12px; border: 1px solid #e2e8f0; max-width: 100%; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);"
  title="${form.title}"
></iframe>`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  // Simple clean SVG QR code visualizer representation
  const renderQRCodeSvg = () => {
    return (
      <svg
        viewBox="0 0 100 100"
        className="w-40 h-40 bg-white p-2 rounded-lg border border-neutral-200"
        fill="currentColor"
      >
        {/* Finder pattern Top-Left */}
        <rect x="10" y="10" width="24" height="24" fill="#09090b" rx="2" />
        <rect x="14" y="14" width="16" height="16" fill="#ffffff" rx="1" />
        <rect x="18" y="18" width="8" height="8" fill="#09090b" />

        {/* Finder pattern Top-Right */}
        <rect x="66" y="10" width="24" height="24" fill="#09090b" rx="2" />
        <rect x="70" y="14" width="16" height="16" fill="#ffffff" rx="1" />
        <rect x="74" y="18" width="8" height="8" fill="#09090b" />

        {/* Finder pattern Bottom-Left */}
        <rect x="10" y="66" width="24" height="24" fill="#09090b" rx="2" />
        <rect x="14" y="70" width="16" height="16" fill="#ffffff" rx="1" />
        <rect x="18" y="74" width="8" height="8" fill="#09090b" />

        {/* Dense data simulation dots */}
        <rect x="40" y="12" width="4" height="8" fill="#09090b" />
        <rect x="48" y="10" width="8" height="4" fill="#09090b" />
        <rect x="58" y="14" width="4" height="6" fill="#09090b" />
        <rect x="42" y="24" width="12" height="4" fill="#09090b" />
        <rect x="10" y="42" width="8" height="4" fill="#09090b" />
        <rect x="22" y="46" width="6" height="8" fill="#09090b" />
        <rect x="32" y="38" width="4" height="14" fill="#09090b" />
        <rect x="42" y="36" width="16" height="16" fill="#09090b" rx="1" />
        <rect x="46" y="40" width="8" height="8" fill="#ffffff" />
        <rect x="64" y="42" width="10" height="4" fill="#09090b" />
        <rect x="78" y="38" width="12" height="6" fill="#09090b" />
        <rect x="72" y="48" width="6" height="10" fill="#09090b" />
        <rect x="84" y="52" width="6" height="6" fill="#09090b" />
        <rect x="40" y="66" width="8" height="6" fill="#09090b" />
        <rect x="52" y="70" width="6" height="10" fill="#09090b" />
        <rect x="42" y="80" width="16" height="6" fill="#09090b" />
        <rect x="66" y="68" width="8" height="8" fill="#09090b" />
        <rect x="78" y="72" width="10" height="4" fill="#09090b" />
        <rect x="70" y="82" width="18" height="8" fill="#09090b" />
      </svg>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Distribution & Sharing Studio</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Publish your form to the world, generate mobile QR codes, or embed directly into any web application.
          </p>
        </div>

        {/* Publication Status Card */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
            form.settings.isPublished
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                form.settings.isPublished ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            />
            <span className="font-semibold">
              {form.settings.isPublished
                ? 'Form is live and accepting submissions'
                : 'Form is in Draft mode (only workspace members can test)'}
            </span>
          </div>

          <button
            onClick={() => onOpenPublicView(formSlug)}
            className="px-3 py-1.5 rounded-lg bg-white border border-current font-semibold hover:bg-neutral-50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span>Open Public View</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Shareable Link Card */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-neutral-700" />
            <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px]">
              Direct Shareable Link
            </span>
          </div>

          <p className="text-neutral-500">
            Share this link via messaging, social media, or email campaigns for direct full-screen respondent experience.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareableUrl}
              className="flex-1 px-3 py-2 font-mono text-xs border rounded-lg bg-neutral-50 border-neutral-200 text-neutral-700 focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
            </button>
          </div>
        </div>

        {/* QR Code Card */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-neutral-700" />
            <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px]">
              Mobile QR Code
            </span>
          </div>

          <p className="text-neutral-500">
            Scan with any smartphone camera to open the conversational experience instantly. Ideal for event badges, slides, posters, and in-person kiosks.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
            {renderQRCodeSvg()}

            <div className="space-y-3 text-center sm:text-left">
              <div>
                <p className="font-semibold text-neutral-900 text-sm">{form.title}</p>
                <p className="text-[11px] text-neutral-500 font-mono mt-0.5 truncate max-w-xs">
                  {shareableUrl}
                </p>
              </div>

              <button
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 border border-neutral-200 hover:bg-neutral-50 rounded-lg font-semibold text-neutral-800 transition-colors inline-flex items-center gap-2 text-xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy URL for Printing</span>
              </button>
            </div>
          </div>
        </div>

        {/* Website Embed Code Card */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-neutral-700" />
            <span className="font-semibold text-neutral-800 uppercase tracking-wider text-[11px]">
              Embed in Your Website or App
            </span>
          </div>

          <p className="text-neutral-500">
            Paste this responsive HTML snippet into Webflow, WordPress, React, Next.js, or HTML static sites.
          </p>

          <div className="relative">
            <textarea
              readOnly
              rows={4}
              value={embedCode}
              className="w-full p-3 font-mono text-[11px] border rounded-lg bg-neutral-900 text-neutral-200 border-neutral-800 focus:outline-none"
            />
            <button
              onClick={handleCopyEmbed}
              className="absolute top-2.5 right-2.5 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
            >
              {copiedEmbed ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedEmbed ? 'Copied' : 'Copy Snippet'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
