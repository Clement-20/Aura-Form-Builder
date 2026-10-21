import { FormSchema, FormSubmission, UserAccount, PlanTier } from '../types/form';
import { SAMPLE_FORMS, SAMPLE_SUBMISSIONS } from './sample-data';

const FORMS_KEY = 'auraform_forms_v1';
const SUBMISSIONS_KEY = 'auraform_submissions_v1';
const USER_KEY = 'auraform_user_v1';

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && url !== 'https://your-project.supabase.co' && key !== 'your-anon-key');
}

export function getCurrentUser(): UserAccount {
  try {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        supabaseConnected: isSupabaseConfigured(),
      };
    }
  } catch (e) {
    console.error('Failed to load user from localStorage:', e);
  }

  const defaultUser: UserAccount = {
    id: 'usr_default_demo',
    name: 'Elena Vance',
    email: 'elena.vance@studio.design',
    avatarUrl: '/src/assets/images/avatar_demo_creator_1792599916553.jpg',
    plan: 'pro',
    supabaseConnected: isSupabaseConfigured(),
  };

  saveCurrentUser(defaultUser);
  return defaultUser;
}

export function saveCurrentUser(user: UserAccount): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to save user to localStorage:', e);
  }
}

export function updateUserPlan(plan: PlanTier): UserAccount {
  const current = getCurrentUser();
  const updated = { ...current, plan };
  saveCurrentUser(updated);
  return updated;
}

export function getStoredForms(): FormSchema[] {
  try {
    const data = localStorage.getItem(FORMS_KEY);
    if (data) {
      const parsed: FormSchema[] = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading forms from localStorage:', e);
  }

  return [];
}

export function saveForms(forms: FormSchema[]): void {
  try {
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
  } catch (e) {
    console.error('Error saving forms to localStorage:', e);
  }
}

export function getFormById(id: string): FormSchema | null {
  const forms = getStoredForms();
  return forms.find((f) => f.id === id) || null;
}

export function getFormBySlug(slug: string): FormSchema | null {
  const forms = getStoredForms();
  return forms.find((f) => f.settings.slug === slug || f.id === slug) || null;
}

export function saveForm(form: FormSchema): void {
  const forms = getStoredForms();
  const existingIdx = forms.findIndex((f) => f.id === form.id);
  const updatedForm = {
    ...form,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    forms[existingIdx] = updatedForm;
  } else {
    forms.unshift(updatedForm);
  }

  saveForms(forms);
}

export function deleteForm(id: string): void {
  const forms = getStoredForms();
  const filtered = forms.filter((f) => f.id !== id);
  saveForms(filtered);
}

export function duplicateForm(id: string): FormSchema | null {
  const original = getFormById(id);
  if (!original) return null;

  const newId = 'form_' + Math.random().toString(36).substring(2, 9);
  const newSlug = `${original.settings.slug}-copy-${Math.floor(Math.random() * 900 + 100)}`;

  const duplicated: FormSchema = {
    ...JSON.parse(JSON.stringify(original)),
    id: newId,
    title: `${original.title} (Copy)`,
    settings: {
      ...original.settings,
      slug: newSlug,
      isPublished: false,
    },
    responsesCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveForm(duplicated);
  return duplicated;
}

// Submissions Storage
export function getStoredSubmissions(formId?: string): FormSubmission[] {
  try {
    const data = localStorage.getItem(SUBMISSIONS_KEY);
    let allSubmissions: Record<string, FormSubmission[]> = {};

    if (data) {
      allSubmissions = JSON.parse(data);
    } else {
      
    }

    if (formId) {
      return allSubmissions[formId] || [];
    }

    return Object.values(allSubmissions).flat();
  } catch (e) {
    console.error('Error reading submissions:', e);
    return [];
  }
}

export function saveSubmission(submission: FormSubmission): void {
  try {
    const data = localStorage.getItem(SUBMISSIONS_KEY);
    let allSubmissions: Record<string, FormSubmission[]> = {};

    if (data) {
      allSubmissions = JSON.parse(data);
    } else {
      allSubmissions = {};
    }

    if (!allSubmissions[submission.formId]) {
      allSubmissions[submission.formId] = [];
    }

    allSubmissions[submission.formId].unshift(submission);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(allSubmissions));

    // Update responses count on the form
    const forms = getStoredForms();
    const target = forms.find((f) => f.id === submission.formId);
    if (target) {
      target.responsesCount = (target.responsesCount || 0) + 1;
      target.updatedAt = new Date().toISOString();
      saveForms(forms);
    }
  } catch (e) {
    console.error('Error saving submission:', e);
  }
}

export function clearSubmissions(formId: string): void {
  try {
    const data = localStorage.getItem(SUBMISSIONS_KEY);
    if (data) {
      const allSubmissions = JSON.parse(data);
      allSubmissions[formId] = [];
      localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(allSubmissions));
    }
  } catch (e) {
    console.error('Error clearing submissions:', e);
  }
}

// Custom Theme Presets Storage
const CUSTOM_THEMES_KEY = 'auraform_custom_theme_presets_v1';
const DEFAULT_THEME_KEY = 'auraform_default_theme_v1';

export function getCustomThemePresets(): import('../types/form').CustomThemePreset[] {
  try {
    const data = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading custom theme presets:', e);
  }
  return [];
}

export function saveCustomThemePreset(preset: import('../types/form').CustomThemePreset): void {
  try {
    const existing = getCustomThemePresets();
    const idx = existing.findIndex((p) => p.id === preset.id);
    if (idx >= 0) {
      existing[idx] = preset;
    } else {
      existing.push(preset);
    }
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error('Error saving custom theme preset:', e);
  }
}

export function deleteCustomThemePreset(id: string): void {
  try {
    const existing = getCustomThemePresets().filter((p) => p.id !== id);
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error('Error deleting custom theme preset:', e);
  }
}

export function getDefaultTheme(): import('../types/form').FormTheme | null {
  try {
    const data = localStorage.getItem(DEFAULT_THEME_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading default theme:', e);
  }
  return null;
}

export function setDefaultTheme(theme: import('../types/form').FormTheme): void {
  try {
    localStorage.setItem(DEFAULT_THEME_KEY, JSON.stringify(theme));
  } catch (e) {
    console.error('Error saving default theme:', e);
  }
}

// Multi-Step Synchronization Helper
export function ensureFormSteps(form: FormSchema): import('../types/form').FormStep[] {
  if (form.steps && form.steps.length > 0) {
    return form.steps;
  }

  // Derive steps from fields
  const stepNumbers = Array.from(new Set(form.fields.map((f) => f.step || 1))).sort((a, b) => a - b);
  if (stepNumbers.length === 0) {
    return [{ id: 'step_1', stepNumber: 1, title: 'Page 1', description: 'General information' }];
  }

  return stepNumbers.map((num) => ({
    id: `step_${num}`,
    stepNumber: num,
    title: num === 1 ? 'Personal Information' : `Page ${num}`,
    description: num === 1 ? 'Primary respondent contact credentials' : `Section ${num} questions`,
  }));
}

