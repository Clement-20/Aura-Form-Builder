import { FormComponentType } from '../../studio';

export type StudioDragPayload =
  | { kind: 'new'; componentType: FormComponentType }
  | { kind: 'existing'; componentId: string }
  | { kind: 'reusable'; definitionId: string };

export const STUDIO_DND_MIME = 'application/x-flexstore-studio';

export function serializeDragPayload(payload: StudioDragPayload): string {
  return JSON.stringify(payload);
}

export function parseDragPayload(raw: string | null | undefined): StudioDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === 'new' && typeof parsed.componentType === 'string') {
      return { kind: 'new', componentType: parsed.componentType };
    }
    if (parsed?.kind === 'existing' && typeof parsed.componentId === 'string') {
      return { kind: 'existing', componentId: parsed.componentId };
    }
    if (parsed?.kind === 'reusable' && typeof parsed.definitionId === 'string') {
      return { kind: 'reusable', definitionId: parsed.definitionId };
    }
  } catch {
    return null;
  }
  return null;
}

export function getDraggedIdentifier(payload: StudioDragPayload): string {
  if (payload.kind === 'existing') return payload.componentId;
  if (payload.kind === 'reusable') return 'reusable_instance';
  return payload.componentType;
}
