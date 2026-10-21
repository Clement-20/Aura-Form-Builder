import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Helper to get GoogleGenAI client safely
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// API: Check AI status & capabilities
app.get('/api/ai/status', (_req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isAvailable = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
  res.json({
    available: isAvailable,
    model: 'gemini-3.8-flash',
    note: isAvailable
      ? 'Gemini 3.8 Flash is configured and active.'
      : 'No GEMINI_API_KEY detected. AuraForm smart schema generator will provide fallback procedural generation.',
  });
});

// API: Generate form schema using Gemini
app.post('/api/ai/generate-form', async (req: Request, res: Response) => {
  const { prompt, formType = 'standard' } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt is required.' });
    return;
  }

  const ai = getGeminiClient();

  if (!ai) {
    // High-quality procedural fallback when GEMINI_API_KEY is not configured
    const fallbackForm = generateProceduralForm(prompt, formType);
    res.json({
      success: true,
      form: fallbackForm,
      source: 'procedural-fallback',
      message: 'Generated using AuraForm procedural engine (configure GEMINI_API_KEY for live AI prompts).',
    });
    return;
  }

  try {
    const systemPrompt = `You are an expert form architect and UX designer.
Create a complete, realistic, production-ready form schema based on the user's prompt.
The output MUST be valid JSON matching this TypeScript structure:
{
  "title": string,
  "description": string,
  "category": "survey" | "quiz" | "registration" | "lead-gen" | "feedback" | "application",
  "layoutMode": "standard" | "conversational" | "stepped",
  "theme": {
    "primaryColor": string (hex color code),
    "backgroundColor": string (hex color code),
    "surfaceColor": string (hex color code),
    "textColor": string (hex color code),
    "borderRadius": "sm" | "md" | "lg" | "full",
    "fontFamily": "DM Sans" | "Plus Jakarta Sans" | "Inter" | "Playfair Display",
    "backgroundStyle": "solid" | "subtle-grid" | "gradient" | "mesh"
  },
  "welcomeScreen": {
    "enabled": boolean,
    "title": string,
    "subtitle": string,
    "buttonText": string
  },
  "thankYouScreen": {
    "title": string,
    "message": string,
    "showRestartButton": boolean,
    "redirectUrl": string | null
  },
  "fields": [
    {
      "id": string (unique like f_1, f_2),
      "type": "text" | "textarea" | "email" | "number" | "select" | "radio" | "checkbox" | "rating" | "scale" | "date" | "phone" | "url" | "statement",
      "label": string,
      "placeholder": string,
      "helpText": string,
      "required": boolean,
      "options": string[] (only for select, radio, checkbox),
      "step": number (1-based, default 1),
      "points": number (optional for quiz),
      "correctAnswer": string (optional for quiz)
    }
  ],
  "logicRules": [
    {
      "id": string,
      "sourceFieldId": string,
      "condition": "equals" | "not_equals" | "contains" | "greater_than" | "less_than",
      "value": string,
      "action": "show" | "hide" | "jump_to_step",
      "targetFieldId": string
    }
  ]
}

Ensure high visual polish, thoughtful question phrasing, logical field order, and at least 4-8 distinct fields. Include 1-2 conditional logic rules where relevant. Return ONLY the JSON object.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Prompt: ${prompt}\nPreferred layout: ${formType}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    const responseText = response.text || '{}';
    const parsedData = JSON.parse(responseText.trim());

    res.json({
      success: true,
      form: parsedData,
      source: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Gemini generation error:', error);
    // Graceful fallback to procedural generation
    const fallbackForm = generateProceduralForm(prompt, formType);
    res.json({
      success: true,
      form: fallbackForm,
      source: 'procedural-fallback',
      warning: error.message || 'Gemini call failed; generated using fallback engine.',
    });
  }
});

// Procedural fallback helper
function generateProceduralForm(prompt: string, preferredLayout: string = 'conversational') {
  const p = prompt.toLowerCase();
  const idPrefix = 'f_' + Math.random().toString(36).substring(2, 7);

  if (p.includes('feedback') || p.includes('nps') || p.includes('satisfaction') || p.includes('review')) {
    return {
      title: 'Customer Experience & Quality Review',
      description: 'Help us refine our service and product experience with your genuine thoughts.',
      category: 'feedback',
      layoutMode: preferredLayout === 'standard' ? 'standard' : 'conversational',
      theme: {
        primaryColor: '#0F766E',
        backgroundColor: '#F8FAFC',
        surfaceColor: '#FFFFFF',
        textColor: '#0F172A',
        borderRadius: 'lg',
        fontFamily: 'DM Sans',
        backgroundStyle: 'solid',
      },
      welcomeScreen: {
        enabled: true,
        title: 'Your Opinion Shapes Our Future',
        subtitle: 'Takes about 2 minutes. We read every single answer directly.',
        buttonText: 'Begin Feedback',
      },
      thankYouScreen: {
        title: 'Thank You For Your Insight',
        message: 'Your responses have been recorded and shared with our product leads.',
        showRestartButton: true,
        redirectUrl: null,
      },
      fields: [
        {
          id: `${idPrefix}_1`,
          type: 'rating',
          label: 'Overall, how satisfied are you with your experience?',
          placeholder: '',
          helpText: 'Select 1 to 5 stars',
          required: true,
          options: ['1', '2', '3', '4', '5'],
          step: 1,
        },
        {
          id: `${idPrefix}_2`,
          type: 'radio',
          label: 'What primary task were you trying to accomplish today?',
          placeholder: '',
          helpText: 'Choose the closest fit',
          required: true,
          options: ['Evaluating features', 'Managing existing workflows', 'Integrating an API', 'Seeking support'],
          step: 1,
        },
        {
          id: `${idPrefix}_3`,
          type: 'scale',
          label: 'How likely are you to recommend us to a peer or teammate? (NPS 0-10)',
          placeholder: '',
          helpText: '0 = Not likely at all, 10 = Extremely likely',
          required: true,
          options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
          step: 2,
        },
        {
          id: `${idPrefix}_4`,
          type: 'textarea',
          label: 'What is one thing we could do significantly better?',
          placeholder: 'Be candid—your feedback drives our next release...',
          helpText: 'Optional but immensely appreciated',
          required: false,
          options: [],
          step: 2,
        },
        {
          id: `${idPrefix}_5`,
          type: 'email',
          label: 'Can we follow up if our engineers have questions?',
          placeholder: 'name@company.com',
          helpText: 'Leave empty if you wish to remain completely anonymous',
          required: false,
          options: [],
          step: 3,
        },
      ],
      logicRules: [],
    };
  }

  if (p.includes('quiz') || p.includes('test') || p.includes('trivia') || p.includes('exam')) {
    return {
      title: 'Product & Design Knowledge Challenge',
      description: 'Test your knowledge on modern UX principles, typography, and frontend patterns.',
      category: 'quiz',
      layoutMode: 'conversational',
      theme: {
        primaryColor: '#6366F1',
        backgroundColor: '#0F172A',
        surfaceColor: '#1E293B',
        textColor: '#F8FAFC',
        borderRadius: 'md',
        fontFamily: 'Plus Jakarta Sans',
        backgroundStyle: 'mesh',
      },
      welcomeScreen: {
        enabled: true,
        title: 'Ready for the Challenge?',
        subtitle: '5 targeted questions with instant score tallying upon completion.',
        buttonText: 'Start Quiz',
      },
      thankYouScreen: {
        title: 'Quiz Finished!',
        message: 'Review your total score and correct solutions below.',
        showRestartButton: true,
        redirectUrl: null,
      },
      fields: [
        {
          id: `${idPrefix}_1`,
          type: 'radio',
          label: 'What is the recommended contrast ratio for normal body text according to WCAG AA?',
          placeholder: '',
          helpText: 'Think about accessibility standards',
          required: true,
          options: ['3.0:1', '4.5:1', '7.0:1', '10.0:1'],
          correctAnswer: '4.5:1',
          points: 10,
          step: 1,
        },
        {
          id: `${idPrefix}_2`,
          type: 'radio',
          label: 'Which CSS property should be animated to achieve 60fps compositor-only transitions?',
          placeholder: '',
          helpText: 'Avoid reflow and repaint triggers',
          required: true,
          options: ['width and height', 'top and left', 'transform and opacity', 'margin and padding'],
          correctAnswer: 'transform and opacity',
          points: 10,
          step: 2,
        },
        {
          id: `${idPrefix}_3`,
          type: 'select',
          label: 'Which typographic feature ensures tabular digits align vertically without jitter?',
          placeholder: 'Select a typographic feature',
          helpText: 'Essential for dashboards and metrics tables',
          required: true,
          options: ['font-kerning: normal', 'font-variant-numeric: tabular-nums', 'text-transform: capitalize', 'font-feature-settings: "liga"'],
          correctAnswer: 'font-variant-numeric: tabular-nums',
          points: 10,
          step: 3,
        },
        {
          id: `${idPrefix}_4`,
          type: 'email',
          label: 'Enter your email to save your certification certificate:',
          placeholder: 'you@domain.com',
          helpText: 'We will send your results summary',
          required: true,
          options: [],
          step: 4,
        },
      ],
      logicRules: [],
    };
  }

  // Default: High-end registration & lead generation form
  return {
    title: prompt ? `Form: ${prompt.slice(0, 48)}` : 'Executive Summit Registration',
    description: 'Reserve your attendee credential and tell us how we can curate your sessions.',
    category: 'registration',
    layoutMode: preferredLayout === 'stepped' ? 'stepped' : 'standard',
    theme: {
      primaryColor: '#18181B',
      backgroundColor: '#FAFAFA',
      surfaceColor: '#FFFFFF',
      textColor: '#18181B',
      borderRadius: 'lg',
      fontFamily: 'Plus Jakarta Sans',
      backgroundStyle: 'solid',
    },
    welcomeScreen: {
      enabled: true,
      title: 'Welcome to Registration',
      subtitle: 'Complete these quick details to lock in your confirmed delegate badge.',
      buttonText: 'Get Started',
    },
    thankYouScreen: {
      title: 'Registration Confirmed',
      message: 'A confirmation summary with calendar invite has been dispatched to your email.',
      showRestartButton: true,
      redirectUrl: null,
    },
    fields: [
      {
        id: `${idPrefix}_1`,
        type: 'text',
        label: 'Full Name',
        placeholder: 'e.g. Alex Morgan',
        helpText: 'As it should appear on your printed badge',
        required: true,
        options: [],
        step: 1,
      },
      {
        id: `${idPrefix}_2`,
        type: 'email',
        label: 'Work Email Address',
        placeholder: 'alex@company.com',
        helpText: 'We use this to verify registration credentials',
        required: true,
        options: [],
        step: 1,
      },
      {
        id: `${idPrefix}_3`,
        type: 'radio',
        label: 'Attendance Format',
        placeholder: '',
        helpText: 'Choose in-person or digital stream',
        required: true,
        options: ['In-Person Delegate', 'Virtual All-Access Pass', 'VIP Executive Dinner'],
        step: 1,
      },
      {
        id: `${idPrefix}_4`,
        type: 'select',
        label: 'Primary Industry Focus',
        placeholder: 'Select your industry',
        helpText: 'Helps us place you in tailored breakout circles',
        required: true,
        options: ['Enterprise Software', 'Healthcare & Biotech', 'Fintech & Banking', 'Industrial & Manufacturing', 'Other'],
        step: 2,
      },
      {
        id: `${idPrefix}_5`,
        type: 'textarea',
        label: 'Specific dietary or accessibility accommodations:',
        placeholder: 'e.g. Plant-based meals, wheelchair ramp access...',
        helpText: 'Optional',
        required: false,
        options: [],
        step: 2,
      },
    ],
    logicRules: [],
  };
}

// Simulated Webhook ping receiver
app.post('/api/webhook/test', (req: Request, res: Response) => {
  console.log('[Webhook Test Received]', req.body);
  res.json({
    status: 'success',
    receivedAt: new Date().toISOString(),
    payloadSummary: {
      keys: Object.keys(req.body || {}),
      size: JSON.stringify(req.body).length,
    },
  });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`AuraForm Server running at http://0.0.0.0:${port}`);
  });
}

startServer();
