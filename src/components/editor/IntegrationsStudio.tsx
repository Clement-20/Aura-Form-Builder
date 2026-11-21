import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PlugsConnected,
  WebhooksLogo,
  SlackLogo,
  Code,
  EnvelopeSimple,
  Table,
  GoogleDriveLogo,
  Plus,
  CheckCircle,
  WarningCircle,
  ClockCountdown,
  PaperPlaneTilt,
  ArrowsClockwise,
  Key,
  Copy,
  Check,
  Trash,
  Plug,
  Eye,
  ShieldCheck,
  CaretDown,
  CaretUp,
  Info,
  Lock,
} from '@phosphor-icons/react';
import type { User } from 'firebase/auth';
import {
  formComponentRegistry,
  type FormDocument,
  type FormIntegrationSummary,
  type IntegrationDeliveryLog,
  type IntegrationEventType,
  INTEGRATION_EVENT_META,
  type IntegrationProviderId,
  type IntegrationProviderMetadata,
  SUBSCRIBABLE_INTEGRATION_EVENTS,
} from '../../studio';
import {
  createFormIntegration,
  deleteFormIntegration,
  disconnectFormIntegration,
  fetchFormIntegrations,
  previewFormIntegrationPayload,
  retryFormIntegrationDelivery,
  rotateFormIntegrationSecret,
  testFormIntegration,
  updateFormIntegration,
} from '../../lib/integrations-client';

interface IntegrationsStudioProps {
  document: FormDocument;
  firebaseUser?: User | null;
  isReadOnly?: boolean;
}

type StudioSubView = 'configured' | 'catalog' | 'history';

const PROVIDER_ICONS: Record<IntegrationProviderId, React.ComponentType<any>> = {
  outbound_webhook: WebhooksLogo,
  slack_webhook: SlackLogo,
  external_api: Code,
  email_service: EnvelopeSimple,
  google_sheets: Table,
  google_drive: GoogleDriveLogo,
};

function statusLabel(status: FormIntegrationSummary['status']): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'connected':
      return {
        label: 'Connected',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'pending_verification':
      return {
        label: 'Not Verified',
        classes: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'error':
      return {
        label: 'Error',
        classes: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    case 'disconnected':
      return {
        label: 'Disconnected',
        classes: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    default:
      return {
        label: 'Setup Required',
        classes: 'bg-slate-100 text-slate-600 border-slate-200',
      };
  }
}

function deliveryStatusStyle(status: IntegrationDeliveryLog['status']): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'succeeded':
      return { label: 'Succeeded', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'retrying':
      return { label: 'Retrying', classes: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'queued':
    case 'delivering':
      return { label: 'Delivering', classes: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'rate_limited':
      return { label: 'Rate Limited', classes: 'bg-orange-50 text-orange-700 border-orange-200' };
    default:
      return { label: 'Failed', classes: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
}

export const IntegrationsStudio: React.FC<IntegrationsStudioProps> = ({
  document: doc,
  firebaseUser,
  isReadOnly = false,
}) => {
  const [subView, setSubView] = useState<StudioSubView>('configured');
  const [providers, setProviders] = useState<IntegrationProviderMetadata[]>([]);
  const [integrations, setIntegrations] = useState<FormIntegrationSummary[]>([]);
  const [deliveries, setDeliveries] = useState<IntegrationDeliveryLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // One-time secret reveal modal/banner state (signing secret shown ONLY on creation or rotation)
  const [revealedSecret, setRevealedSecret] = useState<{
    integrationName: string;
    secret: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // New Integration creation drawer state
  const [creatingProvider, setCreatingProvider] = useState<IntegrationProviderMetadata | null>(null);
  const [createName, setCreateName] = useState('');
  const [createEndpoint, setCreateEndpoint] = useState('');
  const [createMethod, setCreateMethod] = useState<'POST' | 'PUT'>('POST');
  const [createAuthHeader, setCreateAuthHeader] = useState('Authorization');
  const [createAuthSecret, setCreateAuthSecret] = useState('');
  const [createRecipientEmail, setCreateRecipientEmail] = useState('');
  const [createEvents, setCreateEvents] = useState<IntegrationEventType[]>(['form.submitted']);
  const [createIncludedFields, setCreateIncludedFields] = useState<string[]>([]);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Selected integration editor draft state
  const [editName, setEditName] = useState('');
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editMethod, setEditMethod] = useState<'POST' | 'PUT'>('POST');
  const [editAuthHeader, setEditAuthHeader] = useState('Authorization');
  const [editAuthSecret, setEditAuthSecret] = useState('');
  const [editRecipientEmail, setEditRecipientEmail] = useState('');
  const [editEvents, setEditEvents] = useState<IntegrationEventType[]>(['form.submitted']);
  const [editIncludedFields, setEditIncludedFields] = useState<string[]>([]);
  const [editIncludeMeta, setEditIncludeMeta] = useState(true);
  const [editIncludeScoring, setEditIncludeScoring] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<string | null>(null);

  // Live Payload Preview state
  const [payloadPreview, setPayloadPreview] = useState<{
    providerFormat: string;
    payloadPreview: string;
    headersPreview: Record<string, string>;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Delivery history expansion & filter
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'failed' | 'succeeded'>('all');

  // Extract answerable fields from FormDocument for the field allowlist picker & previews
  const fieldCatalog = useMemo(() => {
    const list: Array<{ id: string; label: string; type: string }> = [];
    for (const page of doc.pages) {
      const visit = (id: string) => {
        const node = doc.components[id];
        if (!node) return;
        const def = formComponentRegistry.get(node.type);
        if (def && def.category === 'fields') {
          list.push({
            id: node.id,
            label: node.content.label || def.displayName,
            type: node.type,
          });
        }
        if (Array.isArray(node.children)) {
          for (const cid of node.children) visit(cid);
        }
      };
      for (const cid of page.componentIds) visit(cid);
    }
    return list;
  }, [doc.pages, doc.components]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setBannerError(null);
    try {
      const data = await fetchFormIntegrations(doc.id, firebaseUser);
      setProviders(data.providers);
      setIntegrations(data.integrations);
      setDeliveries(data.deliveries);
      setSelectedId((prev) => {
        if (prev && data.integrations.some((i) => i.id === prev)) return prev;
        return data.integrations[0]?.id ?? null;
      });
    } catch (err: unknown) {
      setBannerError(
        err instanceof Error ? err.message : 'Could not load integrations from server.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [doc.id, firebaseUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedIntegration = useMemo(
    () => integrations.find((i) => i.id === selectedId) || null,
    [integrations, selectedId]
  );

  const selectedProviderMeta = useMemo(
    () => providers.find((p) => p.id === selectedIntegration?.providerId) || null,
    [providers, selectedIntegration?.providerId]
  );

  // Sync editor inputs when selected integration changes
  useEffect(() => {
    if (!selectedIntegration) {
      setPayloadPreview(null);
      return;
    }
    setEditName(selectedIntegration.name);
    setEditEndpoint(selectedIntegration.endpointUrl || '');
    setEditMethod(selectedIntegration.httpMethod || 'POST');
    setEditAuthHeader(selectedIntegration.authHeaderName || 'Authorization');
    setEditAuthSecret('');
    setEditRecipientEmail(selectedIntegration.recipientEmail || '');
    setEditEvents(selectedIntegration.events);
    setEditIncludedFields(selectedIntegration.includedFieldIds);
    setEditIncludeMeta(selectedIntegration.includeMetadata);
    setEditIncludeScoring(selectedIntegration.includeScoreAndOutcome);
    setPayloadPreview(null);
  }, [selectedIntegration]);

  const handleStartCreate = (provider: IntegrationProviderMetadata) => {
    setBannerError(null);
    setBannerNotice(null);
    setCreatingProvider(provider);
    setCreateName(`${provider.shortName} — ${doc.title || 'Form'}`);
    setCreateEndpoint('');
    setCreateMethod('POST');
    setCreateAuthHeader('Authorization');
    setCreateAuthSecret('');
    setCreateRecipientEmail('');
    setCreateEvents(['form.submitted']);
    setCreateIncludedFields([]);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingProvider || isReadOnly) return;
    setIsSubmittingCreate(true);
    setBannerError(null);
    setBannerNotice(null);

    try {
      const result = await createFormIntegration(
        doc.id,
        {
          providerId: creatingProvider.id,
          name: createName.trim() || creatingProvider.name,
          endpointUrl: createEndpoint.trim() || undefined,
          httpMethod: creatingProvider.id === 'external_api' ? createMethod : undefined,
          authHeaderName:
            creatingProvider.id === 'external_api' ? createAuthHeader.trim() || undefined : undefined,
          authSecret:
            creatingProvider.id === 'external_api' && createAuthSecret.trim()
              ? createAuthSecret.trim()
              : undefined,
          recipientEmail:
            creatingProvider.id === 'email_service' ? createRecipientEmail.trim() : undefined,
          events: createEvents,
          includedFieldIds: createIncludedFields,
          includeMetadata: true,
          includeScoreAndOutcome: true,
          enabled: true,
        },
        firebaseUser
      );

      setIntegrations((prev) => [result.integration, ...prev]);
      setSelectedId(result.integration.id);
      setCreatingProvider(null);
      setSubView('configured');

      if (result.signingSecretOnce) {
        setRevealedSecret({
          integrationName: result.integration.name,
          secret: result.signingSecretOnce,
        });
        setCopiedSecret(false);
      }

      setBannerNotice(
        `${result.integration.name} created. Run "Test Connection" to verify delivery and mark it connected.`
      );
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to create integration.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleSaveSelected = async () => {
    if (!selectedIntegration || isReadOnly) return;
    setIsSavingEdit(true);
    setBannerError(null);
    setBannerNotice(null);

    try {
      const { integration } = await updateFormIntegration(
        doc.id,
        selectedIntegration.id,
        {
          name: editName.trim() || selectedIntegration.name,
          endpointUrl: editEndpoint.trim() || undefined,
          httpMethod: selectedIntegration.providerId === 'external_api' ? editMethod : undefined,
          authHeaderName:
            selectedIntegration.providerId === 'external_api'
              ? editAuthHeader.trim() || undefined
              : undefined,
          ...(selectedIntegration.providerId === 'external_api' && editAuthSecret.trim()
            ? { authSecret: editAuthSecret.trim() }
            : {}),
          recipientEmail:
            selectedIntegration.providerId === 'email_service'
              ? editRecipientEmail.trim()
              : undefined,
          events: editEvents,
          includedFieldIds: editIncludedFields,
          includeMetadata: editIncludeMeta,
          includeScoreAndOutcome: editIncludeScoring,
        },
        firebaseUser
      );

      setIntegrations((prev) => prev.map((item) => (item.id === integration.id ? integration : item)));
      setEditAuthSecret('');
      setBannerNotice('Integration configuration saved.');
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleEnabled = async (item: FormIntegrationSummary) => {
    if (isReadOnly) return;
    setBannerError(null);
    try {
      const { integration } = await updateFormIntegration(
        doc.id,
        item.id,
        { enabled: !item.enabled },
        firebaseUser
      );
      setIntegrations((prev) => prev.map((i) => (i.id === integration.id ? integration : i)));
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to update integration status.');
    }
  };

  const handleTestSelected = async () => {
    if (!selectedIntegration || isReadOnly) return;
    setIsTesting(true);
    setBannerError(null);
    setBannerNotice(null);

    try {
      const res = await testFormIntegration(
        doc.id,
        selectedIntegration.id,
        {
          formTitle: doc.title,
          formSlug: doc.settings.slug,
          fieldCatalog,
        },
        firebaseUser
      );
      setIntegrations((prev) =>
        prev.map((item) => (item.id === res.integration.id ? res.integration : item))
      );
      setDeliveries((prev) => [res.delivery, ...prev]);

      if (res.ok) {
        setBannerNotice(
          `Connection verified (HTTP ${res.delivery.httpStatus ?? 200} in ${res.delivery.durationMs ?? 0}ms). Status is now Connected.`
        );
      } else {
        setBannerError(
          res.delivery.errorMessage || 'Test delivery failed. Inspect delivery logs for details.'
        );
      }
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Test request failed.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!selectedIntegration || isReadOnly) return;
    setIsRotating(true);
    setBannerError(null);
    try {
      const res = await rotateFormIntegrationSecret(doc.id, selectedIntegration.id, firebaseUser);
      setIntegrations((prev) =>
        prev.map((item) => (item.id === res.integration.id ? res.integration : item))
      );
      setRevealedSecret({
        integrationName: res.integration.name,
        secret: res.signingSecretOnce,
      });
      setCopiedSecret(false);
      setBannerNotice(
        `Signing secret rotated to v${res.integration.secretVersion}. Update your receiver immediately.`
      );
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to rotate secret.');
    } finally {
      setIsRotating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedIntegration || isReadOnly) return;
    setBannerError(null);
    try {
      const { integration } = await disconnectFormIntegration(
        doc.id,
        selectedIntegration.id,
        firebaseUser
      );
      setIntegrations((prev) => prev.map((item) => (item.id === integration.id ? integration : item)));
      setBannerNotice(`${integration.name} disconnected and stored credentials removed.`);
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not disconnect integration.');
    }
  };

  const handleDelete = async () => {
    if (!selectedIntegration || isReadOnly) return;
    setBannerError(null);
    const idToRemove = selectedIntegration.id;
    try {
      await deleteFormIntegration(doc.id, idToRemove, firebaseUser);
      const remaining = integrations.filter((item) => item.id !== idToRemove);
      setIntegrations(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setBannerNotice('Integration removed.');
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to delete integration.');
    }
  };

  const handleLoadPreview = async () => {
    if (!selectedIntegration) return;
    setIsLoadingPreview(true);
    setBannerError(null);
    try {
      const preview = await previewFormIntegrationPayload(
        doc.id,
        selectedIntegration.id,
        {
          formTitle: doc.title,
          formSlug: doc.settings.slug,
          fieldCatalog,
        },
        firebaseUser
      );
      setPayloadPreview(preview);
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Could not build payload preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    if (isReadOnly) return;
    setRetryingDeliveryId(deliveryId);
    setBannerError(null);
    try {
      const { delivery } = await retryFormIntegrationDelivery(doc.id, deliveryId, firebaseUser);
      setDeliveries((prev) => prev.map((d) => (d.deliveryId === delivery.deliveryId ? delivery : d)));
      if (delivery.status === 'succeeded') {
        setBannerNotice(`Retry succeeded (HTTP ${delivery.httpStatus ?? 200}).`);
      } else {
        setBannerError(delivery.errorMessage || 'Retry failed.');
      }
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to retry delivery.');
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  const toggleEventInList = (
    list: IntegrationEventType[],
    setList: React.Dispatch<React.SetStateAction<IntegrationEventType[]>>,
    event: IntegrationEventType
  ) => {
    if (list.includes(event)) {
      if (list.length === 1) return; // Require at least one event
      setList(list.filter((e) => e !== event));
    } else {
      setList([...list, event]);
    }
  };

  const toggleFieldInList = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    fieldId: string
  ) => {
    if (list.includes(fieldId)) {
      setList(list.filter((id) => id !== fieldId));
    } else {
      setList([...list, fieldId]);
    }
  };

  const filteredDeliveries = useMemo(() => {
    if (historyFilter === 'all') return deliveries;
    if (historyFilter === 'succeeded') return deliveries.filter((d) => d.status === 'succeeded');
    return deliveries.filter(
      (d) => d.status === 'failed' || d.status === 'rate_limited' || d.status === 'retrying'
    );
  }, [deliveries, historyFilter]);

  const handleCopySecret = async () => {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F7F6F3] p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Studio Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#0F766E] mb-1">
              <PlugsConnected size={15} weight="duotone" />
              <span>Integrations & Webhooks</span>
            </div>
            <h1 className="text-2xl font-display font-semibold text-[#0B0D0F] tracking-tight">
              Connect Your Form Workflow
            </h1>
            <p className="text-sm text-[#5C6066] mt-1 max-w-2xl">
              Send signed webhook payloads, Slack notifications, or REST API updates asynchronously
              whenever respondents submit this form.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="h-9 px-3 rounded-lg bg-white border border-black/[0.08] text-xs font-medium text-[#0B0D0F] hover:bg-[#FAF9F7] flex items-center gap-1.5 transition-colors"
            >
              <ArrowsClockwise size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  setCreatingProvider(null);
                  setSubView('catalog');
                }}
                className="h-9 px-3.5 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus size={14} weight="bold" />
                <span>Add Integration</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-navigation Strip */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-black/[0.08] w-fit">
          {(
            [
              { id: 'configured', label: `Configured (${integrations.length})` },
              { id: 'catalog', label: `Providers (${providers.length})` },
              { id: 'history', label: `Delivery Logs (${deliveries.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCreatingProvider(null);
                setSubView(tab.id);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                subView === tab.id
                  ? 'bg-[#0B0D0F] text-white shadow-xs'
                  : 'text-[#5C6066] hover:text-[#0B0D0F]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* One-Time Signing Secret Reveal Banner */}
        {revealedSecret && (
          <div className="rounded-2xl bg-[#0B0D0F] text-white p-5 border border-black/15 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0F766E]/25 text-emerald-300 flex items-center justify-center shrink-0">
                  <Key size={16} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    Copy Signing Secret for {revealedSecret.integrationName}
                  </h3>
                  <p className="text-xs text-white/70">
                    For security, this secret is displayed once and kept strictly on the server.
                    Use it to verify the <code className="font-mono">X-FlexStore-Signature</code> header.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="text-xs text-white/60 hover:text-white px-2 py-1 rounded-md"
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3.5 py-2.5 font-mono text-xs">
              <span className="truncate flex-1 select-all">{revealedSecret.secret}</span>
              <button
                type="button"
                onClick={() => void handleCopySecret()}
                className="px-2.5 py-1 rounded-lg bg-white text-[#0B0D0F] font-sans font-semibold text-xs flex items-center gap-1 shrink-0 hover:bg-white/90"
              >
                {copiedSecret ? <Check size={13} weight="bold" /> : <Copy size={13} />}
                <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Feedback Banners */}
        {bannerError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800 flex items-start gap-2.5">
            <WarningCircle size={16} weight="fill" className="text-rose-600 shrink-0 mt-0.5" />
            <span className="flex-1">{bannerError}</span>
            <button
              type="button"
              onClick={() => setBannerError(null)}
              className="text-rose-600 hover:text-rose-900 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}
        {bannerNotice && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <CheckCircle size={16} weight="fill" className="text-emerald-600 shrink-0 mt-0.5" />
            <span className="flex-1">{bannerNotice}</span>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 1: PROVIDER CATALOG & CREATION FLOW                     */}
        {/* ============================================================ */}
        {subView === 'catalog' && (
          <div className="space-y-6">
            {creatingProvider ? (
              <form
                onSubmit={handleCreateSubmit}
                className="rounded-2xl bg-white border border-black/[0.08] p-6 space-y-5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] pb-4">
                  <div>
                    <h2 className="text-base font-display font-semibold text-[#0B0D0F]">
                      Configure {creatingProvider.name}
                    </h2>
                    <p className="text-xs text-[#5C6066] mt-0.5">
                      {creatingProvider.setupInstructions}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreatingProvider(null)}
                    className="text-xs font-medium text-[#5C6066] hover:text-[#0B0D0F]"
                  >
                    Back to Catalog
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                      Connection Name
                    </label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      required
                      maxLength={100}
                      className="w-full h-10 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                    />
                  </div>

                  {creatingProvider.id === 'email_service' ? (
                    <div>
                      <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                        Recipient Email Address
                      </label>
                      <input
                        type="email"
                        value={createRecipientEmail}
                        onChange={(e) => setCreateRecipientEmail(e.target.value)}
                        required
                        placeholder="team@yourdomain.com"
                        className="w-full h-10 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                        Destination HTTPS Endpoint URL
                      </label>
                      <input
                        type="url"
                        value={createEndpoint}
                        onChange={(e) => setCreateEndpoint(e.target.value)}
                        required
                        placeholder={creatingProvider.endpointPlaceholder}
                        className="w-full h-10 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      />
                      {creatingProvider.endpointHelper && (
                        <p className="text-[11px] text-[#5C6066] mt-1">
                          {creatingProvider.endpointHelper}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {creatingProvider.id === 'external_api' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                        HTTP Method
                      </label>
                      <select
                        value={createMethod}
                        onChange={(e) => setCreateMethod(e.target.value as 'POST' | 'PUT')}
                        className="w-full h-10 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F]"
                      >
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                        Auth Header Name
                      </label>
                      <input
                        type="text"
                        value={createAuthHeader}
                        onChange={(e) => setCreateAuthHeader(e.target.value)}
                        placeholder="Authorization or X-API-Key"
                        className="w-full h-10 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono text-[#0B0D0F]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                        Bearer Token / API Key (optional)
                      </label>
                      <input
                        type="password"
                        value={createAuthSecret}
                        onChange={(e) => setCreateAuthSecret(e.target.value)}
                        placeholder="Stored strictly server-side"
                        autoComplete="new-password"
                        className="w-full h-10 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono text-[#0B0D0F]"
                      />
                    </div>
                  </div>
                )}

                {/* Event Subscriptions */}
                <div>
                  <label className="block text-xs font-semibold text-[#0B0D0F] mb-2">
                    Subscribed Events
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {SUBSCRIBABLE_INTEGRATION_EVENTS.map((evt) => {
                      const active = createEvents.includes(evt);
                      return (
                        <button
                          key={evt}
                          type="button"
                          onClick={() => toggleEventInList(createEvents, setCreateEvents, evt)}
                          className={`text-left p-3 rounded-xl border transition-all ${
                            active
                              ? 'bg-[#0F766E]/8 border-[#0F766E] text-[#0B0D0F]'
                              : 'bg-[#FAF9F7] border-black/[0.07] text-[#5C6066] hover:border-black/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">
                              {INTEGRATION_EVENT_META[evt].label}
                            </span>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                                active
                                  ? 'bg-[#0F766E] text-white'
                                  : 'border border-black/20 bg-white'
                              }`}
                            >
                              {active && <Check size={11} weight="bold" />}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#5C6066] mt-1 leading-snug">
                            {INTEGRATION_EVENT_META[evt].description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Response Field Selection */}
                {fieldCatalog.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[#0B0D0F]">
                        Included Response Fields
                      </label>
                      <span className="text-[11px] text-[#5C6066]">
                        {createIncludedFields.length === 0
                          ? 'All non-sensitive fields included'
                          : `${createIncludedFields.length} selected`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {fieldCatalog.map((field) => {
                        const checked = createIncludedFields.includes(field.id);
                        return (
                          <button
                            key={field.id}
                            type="button"
                            onClick={() =>
                              toggleFieldInList(
                                createIncludedFields,
                                setCreateIncludedFields,
                                field.id
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                              checked
                                ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                                : 'bg-[#FAF9F7] text-[#0B0D0F] border-black/[0.08] hover:border-black/25'
                            }`}
                          >
                            {field.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={() => setCreatingProvider(null)}
                    className="h-9 px-4 rounded-lg text-xs font-medium text-[#5C6066] hover:text-[#0B0D0F]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCreate}
                    className="h-9 px-4 rounded-lg bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    {isSubmittingCreate ? 'Saving…' : 'Create Integration'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map((provider) => {
                  const Icon = PROVIDER_ICONS[provider.id] || Plug;
                  const isAvailable = provider.availability === 'available';
                  return (
                    <div
                      key={provider.id}
                      className="rounded-2xl bg-white border border-black/[0.08] p-5 flex flex-col justify-between gap-4 hover:border-black/20 transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-10 h-10 rounded-xl bg-[#F7F6F3] border border-black/[0.06] flex items-center justify-center text-[#0B0D0F]">
                            <Icon size={20} weight="duotone" />
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                              isAvailable
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isAvailable
                              ? 'Ready'
                              : provider.availability === 'requires_oauth'
                                ? 'OAuth Required'
                                : 'Server Setup Required'}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-sm font-display font-semibold text-[#0B0D0F]">
                            {provider.name}
                          </h3>
                          <p className="text-xs text-[#5C6066] mt-1 leading-relaxed">
                            {provider.description}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5 pt-2 border-t border-black/[0.05]">
                        {!isAvailable && (
                          <p className="text-[11px] text-[#5C6066] leading-snug flex items-start gap-1.5">
                            <Info size={13} className="shrink-0 mt-0.5 text-slate-500" />
                            <span>{provider.setupInstructions}</span>
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={!isAvailable || isReadOnly}
                          onClick={() => handleStartCreate(provider)}
                          className={`w-full h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            isAvailable && !isReadOnly
                              ? 'bg-[#0B0D0F] hover:bg-[#191D21] text-white'
                              : 'bg-[#F7F6F3] text-[#5C6066] cursor-not-allowed border border-black/[0.06]'
                          }`}
                        >
                          {isAvailable ? (
                            <>
                              <Plus size={13} weight="bold" />
                              <span>Configure {provider.shortName}</span>
                            </>
                          ) : (
                            <>
                              <Lock size={13} />
                              <span>Requires Credentials</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: CONFIGURED INTEGRATIONS & WEBHOOK EDITOR             */}
        {/* ============================================================ */}
        {subView === 'configured' && (
          <>
            {integrations.length === 0 ? (
              <div className="rounded-2xl bg-white border border-black/[0.08] p-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#F7F6F3] border border-black/[0.06] text-[#0F766E] flex items-center justify-center mx-auto">
                  <PlugsConnected size={24} weight="duotone" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h2 className="text-base font-display font-semibold text-[#0B0D0F]">
                    No integrations connected yet
                  </h2>
                  <p className="text-xs text-[#5C6066] leading-relaxed">
                    Add a signed Outbound Webhook, Slack channel notification, or Custom REST API
                    connector to forward validated form responses automatically.
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setSubView('catalog')}
                    className="h-9 px-4 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={14} weight="bold" />
                    <span>Browse Provider Catalog</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left Sidebar List */}
                <div className="lg:col-span-4 space-y-2.5">
                  {integrations.map((item) => {
                    const Icon = PROVIDER_ICONS[item.providerId] || Plug;
                    const badge = statusLabel(item.status);
                    const isSelected = item.id === selectedId;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSelectedId(item.id);
                        }}
                        className={`rounded-xl p-4 border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white border-[#0F766E] shadow-xs'
                            : 'bg-white/75 border-black/[0.08] hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#F7F6F3] flex items-center justify-center text-[#0B0D0F] shrink-0">
                              <Icon size={16} weight="duotone" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#0B0D0F] truncate">
                                {item.name}
                              </div>
                              <div className="text-[11px] text-[#5C6066] truncate font-mono">
                                {item.endpointUrl || item.recipientEmail || item.providerId}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isReadOnly || item.status === 'disconnected'}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleToggleEnabled(item);
                            }}
                            aria-label={item.enabled ? 'Disable integration' : 'Enable integration'}
                            className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
                              item.enabled ? 'bg-[#0F766E]' : 'bg-black/15'
                            } disabled:opacity-40`}
                          >
                            <span
                              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                                item.enabled ? 'left-[18px]' : 'left-0.5'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-black/[0.05]">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-mono text-[#5C6066]">
                            {item.events.length} event{item.events.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Detail Editor */}
                {selectedIntegration && (
                  <div className="lg:col-span-8 rounded-2xl bg-white border border-black/[0.08] p-6 space-y-6">
                    {/* Detail Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-display font-semibold text-[#0B0D0F]">
                            {selectedIntegration.name}
                          </h2>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                              statusLabel(selectedIntegration.status).classes
                            }`}
                          >
                            {statusLabel(selectedIntegration.status).label}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C6066] mt-0.5">
                          {selectedIntegration.lastVerifiedAt
                            ? `Verified ${new Date(selectedIntegration.lastVerifiedAt).toLocaleString()}`
                            : 'Send a live test event to verify this endpoint and mark it Connected.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isTesting || isReadOnly || selectedIntegration.status === 'disconnected'}
                          onClick={() => void handleTestSelected()}
                          className="h-8 px-3 rounded-lg bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <PaperPlaneTilt size={13} weight="fill" />
                          <span>{isTesting ? 'Sending Test…' : 'Send Test Event'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isLoadingPreview}
                          onClick={() => void handleLoadPreview()}
                          className="h-8 px-3 rounded-lg bg-[#F7F6F3] hover:bg-[#EAE7E1] border border-black/[0.08] text-xs font-semibold text-[#0B0D0F] flex items-center gap-1.5 transition-colors"
                        >
                          <Eye size={13} />
                          <span>{isLoadingPreview ? 'Loading…' : 'Preview Payload'}</span>
                        </button>
                      </div>
                    </div>

                    {selectedIntegration.lastError && (
                      <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800 flex items-start gap-2">
                        <WarningCircle size={15} weight="fill" className="text-rose-600 shrink-0 mt-0.5" />
                        <span>Last error: {selectedIntegration.lastError}</span>
                      </div>
                    )}

                    {/* Core Endpoint & Auth Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                          Connection Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          readOnly={isReadOnly}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                        />
                      </div>

                      {selectedIntegration.providerId === 'email_service' ? (
                        <div>
                          <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                            Recipient Email
                          </label>
                          <input
                            type="email"
                            value={editRecipientEmail}
                            readOnly={isReadOnly}
                            onChange={(e) => setEditRecipientEmail(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs text-[#0B0D0F]"
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                            Endpoint URL (HTTPS required)
                          </label>
                          <input
                            type="url"
                            value={editEndpoint}
                            readOnly={isReadOnly}
                            onChange={(e) => setEditEndpoint(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono text-[#0B0D0F] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                          />
                        </div>
                      )}
                    </div>

                    {selectedIntegration.providerId === 'external_api' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                            Method
                          </label>
                          <select
                            value={editMethod}
                            disabled={isReadOnly}
                            onChange={(e) => setEditMethod(e.target.value as 'POST' | 'PUT')}
                            className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs"
                          >
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                            Auth Header
                          </label>
                          <input
                            type="text"
                            value={editAuthHeader}
                            readOnly={isReadOnly}
                            onChange={(e) => setEditAuthHeader(e.target.value)}
                            className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#0B0D0F] mb-1.5">
                            {selectedIntegration.hasAuthSecret
                              ? 'Replace Secret (saved on server)'
                              : 'Bearer Token / API Key'}
                          </label>
                          <input
                            type="password"
                            value={editAuthSecret}
                            readOnly={isReadOnly}
                            onChange={(e) => setEditAuthSecret(e.target.value)}
                            placeholder={
                              selectedIntegration.hasAuthSecret
                                ? '•••••••• (enter new value to replace)'
                                : 'Optional secret'
                            }
                            autoComplete="new-password"
                            className="w-full h-9 px-2.5 rounded-lg bg-[#F7F6F3] border border-black/[0.08] text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* Signing Secret Panel */}
                    {selectedProviderMeta?.supportsSecretRotation && (
                      <div className="rounded-xl bg-[#FAF9F7] border border-black/[0.07] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <ShieldCheck
                            size={18}
                            weight="duotone"
                            className="text-[#0F766E] shrink-0 mt-0.5"
                          />
                          <div>
                            <div className="text-xs font-semibold text-[#0B0D0F]">
                              HMAC-SHA256 Signing Secret (v{selectedIntegration.secretVersion})
                            </div>
                            <div className="text-[11px] text-[#5C6066] font-mono mt-0.5">
                              {selectedIntegration.secretHint || 'Cleared (disconnected)'}
                            </div>
                          </div>
                        </div>
                        {!isReadOnly && selectedIntegration.status !== 'disconnected' && (
                          <button
                            type="button"
                            disabled={isRotating}
                            onClick={() => void handleRotateSecret()}
                            className="h-8 px-3 rounded-lg bg-white hover:bg-[#F7F6F3] border border-black/[0.1] text-xs font-semibold text-[#0B0D0F] flex items-center gap-1.5 shrink-0"
                          >
                            <Key size={13} />
                            <span>{isRotating ? 'Rotating…' : 'Rotate Secret'}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Event Subscriptions */}
                    <div>
                      <label className="block text-xs font-semibold text-[#0B0D0F] mb-2">
                        Subscribed Events
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {SUBSCRIBABLE_INTEGRATION_EVENTS.map((evt) => {
                          const active = editEvents.includes(evt);
                          return (
                            <button
                              key={evt}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => toggleEventInList(editEvents, setEditEvents, evt)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                                active
                                  ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/40 font-semibold'
                                  : 'bg-[#FAF9F7] text-[#5C6066] border-black/[0.07]'
                              }`}
                            >
                              {active && <Check size={12} weight="bold" />}
                              <span>{INTEGRATION_EVENT_META[evt].label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Field Selection & Data Controls */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[#0B0D0F]">
                          Included Response Fields
                        </label>
                        {editIncludedFields.length > 0 && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => setEditIncludedFields([])}
                            className="text-[11px] font-medium text-[#0F766E] hover:underline"
                          >
                            Reset to all non-sensitive fields
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {fieldCatalog.map((field) => {
                          const selected = editIncludedFields.includes(field.id);
                          return (
                            <button
                              key={field.id}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() =>
                                toggleFieldInList(
                                  editIncludedFields,
                                  setEditIncludedFields,
                                  field.id
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                                selected
                                  ? 'bg-[#0B0D0F] text-white border-[#0B0D0F]'
                                  : 'bg-[#FAF9F7] text-[#0B0D0F] border-black/[0.08] hover:border-black/25'
                              }`}
                            >
                              {field.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#5C6066]">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editIncludeScoring}
                            disabled={isReadOnly}
                            onChange={(e) => setEditIncludeScoring(e.target.checked)}
                            className="rounded border-black/25 text-[#0F766E]"
                          />
                          <span>Include score & outcome summary</span>
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editIncludeMeta}
                            disabled={isReadOnly}
                            onChange={(e) => setEditIncludeMeta(e.target.checked)}
                            className="rounded border-black/25 text-[#0F766E]"
                          />
                          <span>Include submission metadata</span>
                        </label>
                      </div>
                    </div>

                    {/* Live Payload Preview Drawer */}
                    {payloadPreview && (
                      <div className="rounded-xl bg-[#0B0D0F] text-white/90 p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/60">
                          <span>PAYLOAD PREVIEW · {payloadPreview.providerFormat}</span>
                          <button
                            type="button"
                            onClick={() => setPayloadPreview(null)}
                            className="hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                        <div className="text-[11px] font-mono text-emerald-300/90 space-y-0.5 border-b border-white/10 pb-2">
                          {Object.entries(payloadPreview.headersPreview).map(([k, v]) => (
                            <div key={k} className="truncate">
                              <span className="text-white/50">{k}:</span> {v}
                            </div>
                          ))}
                        </div>
                        <pre className="text-[11px] font-mono overflow-x-auto max-h-64 leading-relaxed text-white/90">
                          {payloadPreview.payloadPreview}
                        </pre>
                      </div>
                    )}

                    {/* Action Footer */}
                    {!isReadOnly && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-black/[0.06]">
                        <div className="flex items-center gap-2">
                          {selectedIntegration.status !== 'disconnected' && (
                            <button
                              type="button"
                              onClick={() => void handleDisconnect()}
                              className="h-8 px-3 rounded-lg border border-black/[0.1] text-xs font-medium text-[#5C6066] hover:text-[#0B0D0F] hover:bg-[#FAF9F7] transition-colors"
                            >
                              Disconnect
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete()}
                            className="h-8 px-3 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-1 transition-colors"
                          >
                            <Trash size={13} />
                            <span>Delete</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isSavingEdit}
                          onClick={() => void handleSaveSelected()}
                          className="h-9 px-4 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                        >
                          {isSavingEdit ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* VIEW 3: DELIVERY & EXECUTION HISTORY                         */}
        {/* ============================================================ */}
        {subView === 'history' && (
          <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
            <div className="px-5 py-4 border-b border-black/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-display font-semibold text-[#0B0D0F]">
                  Delivery History & Retry Queue
                </h2>
                <p className="text-[11px] text-[#5C6066]">
                  Every outbound attempt is logged with HTTP status, latency, and idempotency key.
                </p>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F7F6F3] border border-black/[0.06] text-xs">
                {(['all', 'succeeded', 'failed'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setHistoryFilter(f)}
                    className={`px-2.5 py-1 rounded-md capitalize font-medium ${
                      historyFilter === f
                        ? 'bg-white text-[#0B0D0F] shadow-xs'
                        : 'text-[#5C6066] hover:text-[#0B0D0F]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredDeliveries.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <ClockCountdown size={24} className="mx-auto text-[#5C6066]" />
                <p className="text-xs text-[#5C6066]">
                  No deliveries recorded yet. Send a test event or submit your form to inspect
                  real-time execution logs.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {filteredDeliveries.map((item) => {
                  const badge = deliveryStatusStyle(item.status);
                  const isExpanded = expandedDeliveryId === item.deliveryId;
                  const canRetry =
                    !isReadOnly &&
                    (item.status === 'failed' || item.status === 'rate_limited');
                  return (
                    <div key={item.deliveryId} className="p-4 hover:bg-[#FAF9F7]/70 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#0B0D0F] truncate">
                              {item.integrationName}{' '}
                              <span className="font-mono font-normal text-[#5C6066]">
                                · {item.eventType}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-[#5C6066]">
                              {new Date(item.createdAt).toLocaleString()} · Attempt {item.attempts}/
                              {item.maxAttempts}
                              {item.httpStatus ? ` · HTTP ${item.httpStatus}` : ''}
                              {item.durationMs ? ` · ${item.durationMs}ms` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {canRetry && (
                            <button
                              type="button"
                              disabled={retryingDeliveryId === item.deliveryId}
                              onClick={() => void handleRetryDelivery(item.deliveryId)}
                              className="h-7 px-2.5 rounded-lg bg-[#0B0D0F] hover:bg-[#191D21] disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1"
                            >
                              <ArrowsClockwise
                                size={12}
                                className={
                                  retryingDeliveryId === item.deliveryId ? 'animate-spin' : ''
                                }
                              />
                              <span>Retry Now</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDeliveryId(isExpanded ? null : item.deliveryId)
                            }
                            className="h-7 px-2 rounded-lg border border-black/[0.08] text-[11px] text-[#5C6066] hover:text-[#0B0D0F] flex items-center gap-1"
                          >
                            <span>Details</span>
                            {isExpanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
                          </button>
                        </div>
                      </div>

                      {item.errorMessage && (
                        <div className="mt-2 text-xs text-rose-700">
                          {item.errorMessage}
                          {item.troubleshootingHint && (
                            <span className="text-[#5C6066]"> — {item.troubleshootingHint}</span>
                          )}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-3 rounded-xl bg-[#F7F6F3] border border-black/[0.06] p-3.5 space-y-2 text-[11px] font-mono">
                          <div className="text-[#5C6066]">
                            Delivery ID: <span className="text-[#0B0D0F]">{item.deliveryId}</span> ·
                            Idempotency Key:{' '}
                            <span className="text-[#0B0D0F]">{item.idempotencyKey}</span>
                          </div>
                          {item.responseSnippet && (
                            <div>
                              <div className="text-[#5C6066] mb-1">Response snippet:</div>
                              <pre className="p-2 rounded-lg bg-white border border-black/[0.06] overflow-x-auto text-[#0B0D0F]">
                                {item.responseSnippet}
                              </pre>
                            </div>
                          )}
                          {item.requestPreview && (
                            <div>
                              <div className="text-[#5C6066] mb-1">Sanitized payload:</div>
                              <pre className="p-2 rounded-lg bg-white border border-black/[0.06] overflow-x-auto max-h-48 text-[#0B0D0F]">
                                {item.requestPreview}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
