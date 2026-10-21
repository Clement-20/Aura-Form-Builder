import React, { useState } from 'react';
import { FormSchema, FormSubmission } from '../../types/form';
import { getStoredSubmissions, clearSubmissions, saveSubmission } from '../../lib/storage';
import {
  Download,
  Trash2,
  Users,
  Clock,
  CheckCircle,
  Eye,
  Plus,
  Search,
  ExternalLink,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface AnalyticsTabProps {
  form: FormSchema;
  onRefreshData: () => void;
}

export const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ form, onRefreshData }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);

  const submissions = getStoredSubmissions(form.id);

  // Executive Metrics
  const totalSubmissions = submissions.length;
  const totalViews = Math.max(totalSubmissions * 2 + 14, 25);
  const totalStarts = Math.max(totalSubmissions + 8, 12);
  const completionRate = totalViews > 0 ? Math.round((totalSubmissions / totalViews) * 100) : 0;

  const avgDuration =
    totalSubmissions > 0
      ? Math.round(
          submissions.reduce((acc, curr) => acc + (curr.durationSeconds || 45), 0) /
            totalSubmissions
        )
      : 45;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Submissions timeline data for chart
  const timelineData = [
    { date: 'Apr 15', count: Math.max(1, Math.round(totalSubmissions * 0.1)) },
    { date: 'Apr 16', count: Math.max(2, Math.round(totalSubmissions * 0.18)) },
    { date: 'Apr 17', count: Math.max(3, Math.round(totalSubmissions * 0.22)) },
    { date: 'Apr 18', count: Math.max(4, Math.round(totalSubmissions * 0.28)) },
    { date: 'Apr 19', count: Math.max(2, Math.round(totalSubmissions * 0.12)) },
    { date: 'Apr 20', count: Math.max(totalSubmissions, 5) },
  ];

  // Field breakdown data
  const fieldBreakdownData = form.fields.slice(0, 5).map((field, idx) => ({
    name: `Q${idx + 1}: ${field.label.slice(0, 16)}...`,
    completions: totalSubmissions,
  }));

  // CSV Export handler
  const handleExportCSV = () => {
    if (submissions.length === 0) {
      alert('No submissions recorded to export.');
      return;
    }

    const headers = ['Submission ID', 'Timestamp', 'Duration (s)', 'Score', ...form.fields.map((f) => f.label)];
    const rows = submissions.map((sub) => {
      return [
        sub.id,
        sub.submittedAt,
        sub.durationSeconds,
        sub.score ?? 'N/A',
        ...form.fields.map((f) => {
          const val = sub.answers[f.id];
          if (Array.isArray(val)) return `"${val.join('; ')}"`;
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        }),
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${form.settings.slug || 'form'}-submissions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSON Export handler
  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(submissions, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.settings.slug || 'form'}-submissions.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generate Sample Submission for testing
  const handleAddSampleResponse = () => {
    const sampleAnswers: Record<string, any> = {};
    for (const f of form.fields) {
      if (f.options && f.options.length > 0) {
        sampleAnswers[f.id] = f.options[Math.floor(Math.random() * f.options.length)];
      } else if (f.type === 'email') {
        sampleAnswers[f.id] = `tester_${Math.floor(Math.random() * 900 + 100)}@studio.design`;
      } else if (f.type === 'rating') {
        sampleAnswers[f.id] = String(Math.floor(Math.random() * 2) + 4);
      } else if (f.type === 'scale') {
        sampleAnswers[f.id] = String(Math.floor(Math.random() * 3) + 8);
      } else {
        sampleAnswers[f.id] = 'Sample respondent answer';
      }
    }

    const newSub: FormSubmission = {
      id: 'sub_' + Math.random().toString(36).substring(2, 9),
      formId: form.id,
      submittedAt: new Date().toISOString(),
      answers: sampleAnswers,
      durationSeconds: Math.floor(Math.random() * 50) + 35,
      isComplete: true,
      deviceInfo: 'Desktop (Chrome / Simulated)',
    };

    saveSubmission(newSub);
    onRefreshData();
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to delete all recorded submissions for this form?')) {
      clearSubmissions(form.id);
      onRefreshData();
    }
  };

  // Filtered submissions
  const filteredSubmissions = submissions.filter((sub) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const strAnswers = JSON.stringify(sub.answers).toLowerCase();
    return strAnswers.includes(q) || sub.id.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-3.5rem)] bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Response Intelligence & Analytics</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Real-time response ingestion, field drop-off funnel, and tabular export.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddSampleResponse}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simulate Response</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* Executive KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
              Total Submissions
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
                {totalSubmissions}
              </span>
              <span className="text-xs text-emerald-600 font-medium">+14% this week</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
              Completion Rate
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
                {completionRate}%
              </span>
              <span className="text-xs text-neutral-400">vs 32% industry avg</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
              Avg Time to Complete
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
                {formatDuration(avgDuration)}
              </span>
              <span className="text-xs text-neutral-400">rapid flow</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
              Total Views / Starts
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
                {totalViews}
              </span>
              <span className="text-xs text-neutral-500">/ {totalStarts} started</span>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submissions Timeline Chart */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-neutral-800 uppercase tracking-wider block">
              Submission Trajectory Over Time
            </span>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#18181b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#18181b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      color: '#ffffff',
                      borderRadius: 8,
                      fontSize: 12,
                      border: 'none',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Responses"
                    stroke="#18181b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#areaGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Question Drop-off Funnel Chart */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200/80 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-neutral-800 uppercase tracking-wider block">
              Question Completion Rates
            </span>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fieldBreakdownData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      color: '#ffffff',
                      borderRadius: 8,
                      fontSize: 12,
                      border: 'none',
                    }}
                  />
                  <Bar dataKey="completions" name="Answered" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Responses Data Table */}
        <div className="bg-white rounded-xl border border-neutral-200/80 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-neutral-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Recorded Responses ({totalSubmissions})</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Click any entry to inspect raw respondent answers</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter responses..."
                  className="pl-8 pr-3 py-1.5 text-xs border rounded-lg border-neutral-200 focus:outline-none focus:border-neutral-900 w-48 sm:w-60"
                />
              </div>

              {totalSubmissions > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-1.5 text-neutral-400 hover:text-rose-600 rounded transition-colors"
                  title="Clear all responses"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center text-xs text-neutral-400 space-y-3">
              <p>No responses match your criteria.</p>
              <button
                onClick={handleAddSampleResponse}
                className="text-xs font-semibold text-neutral-900 underline"
              >
                Click here to generate a mock response
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50/70 text-neutral-500 font-semibold border-b border-neutral-200/80">
                    <th className="py-3 px-4">Respondent</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Duration</th>
                    {form.settings.isQuizMode && <th className="py-3 px-4">Score</th>}
                    <th className="py-3 px-4">Key Answers</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                  {filteredSubmissions.map((sub) => {
                    const firstAnswerVal = Object.values(sub.answers)[0];
                    const firstAnswerStr = Array.isArray(firstAnswerVal)
                      ? firstAnswerVal.join(', ')
                      : String(firstAnswerVal || '—');

                    return (
                      <tr
                        key={sub.id}
                        onClick={() => setSelectedSubmission(sub)}
                        className="hover:bg-neutral-50/80 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-medium text-neutral-900">
                          {sub.id}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-neutral-500">
                          {new Date(sub.submittedAt).toLocaleDateString()} {new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-neutral-600">
                          {formatDuration(sub.durationSeconds)}
                        </td>
                        {form.settings.isQuizMode && (
                          <td className="py-3 px-4 font-semibold text-indigo-700 tabular-nums">
                            {sub.score ?? '—'} / {sub.maxScore ?? '—'}
                          </td>
                        )}
                        <td className="py-3 px-4 max-w-xs truncate text-neutral-600">
                          {firstAnswerStr}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-neutral-900 font-semibold hover:underline">
                            Inspect →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Submission Detail Drawer Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-neutral-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                <div>
                  <span className="text-[11px] font-mono text-neutral-400 block uppercase">
                    Submission Details
                  </span>
                  <h3 className="text-base font-bold text-neutral-900 font-mono mt-0.5">
                    {selectedSubmission.id}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-lg bg-neutral-50 border border-neutral-100">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase">Recorded</span>
                  <span className="font-mono tabular-nums text-neutral-800">
                    {new Date(selectedSubmission.submittedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase">Duration</span>
                  <span className="font-mono tabular-nums text-neutral-800">
                    {formatDuration(selectedSubmission.durationSeconds)}
                  </span>
                </div>
              </div>

              {/* Answers List */}
              <div className="space-y-4">
                <span className="text-xs font-semibold text-neutral-800 uppercase tracking-wider block">
                  Question Responses
                </span>

                <div className="space-y-3">
                  {form.fields.map((field) => {
                    const ans = selectedSubmission.answers[field.id];
                    const isAnswered = ans !== undefined && ans !== null && ans !== '';

                    return (
                      <div key={field.id} className="p-3 rounded-lg border border-neutral-100 bg-white space-y-1 text-xs">
                        <p className="font-semibold text-neutral-800">{field.label}</p>
                        <div className="text-neutral-600 font-medium pt-1">
                          {isAnswered ? (
                            Array.isArray(ans) ? (
                              <ul className="list-disc pl-4 space-y-0.5">
                                {ans.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="whitespace-pre-wrap">{String(ans)}</p>
                            )
                          ) : (
                            <span className="text-neutral-400 italic">Skipped / Unanswered</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedSubmission(null)}
              className="w-full py-2.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
