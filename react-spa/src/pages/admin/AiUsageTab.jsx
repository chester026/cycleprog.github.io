import React, { useState } from 'react';
import { useAdminAiUsage } from '../../data/hooks';
import { ErrorMessage, Loader } from '../../ui';

/**
 * "AI Usage" admin tab (T-6.3, new — server side added in T-4.4). Shows
 * per-user OpenAI token totals over a 7 or 30 day window from
 * `GET /api/admin/ai-usage?days=N` (see `useAdminAiUsage`,
 * `server/routes/adminAiUsage.js`).
 */
export default function AiUsageTab() {
  const [days, setDays] = useState(7);
  const { data, isLoading, error } = useAdminAiUsage(days);
  const users = data?.users || [];

  const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

  return (
    <div id="ai-usage-tab-block">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>AI Usage</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="admin-btn"
            style={{ background: days === 7 ? '#274DD3' : '#6c757d' }}
            onClick={() => setDays(7)}
          >
            Last 7 days
          </button>
          <button
            className="admin-btn"
            style={{ background: days === 30 ? '#274DD3' : '#6c757d' }}
            onClick={() => setDays(30)}
          >
            Last 30 days
          </button>
        </div>
      </div>

      {isLoading && <Loader label="Loading AI usage..." />}
      {error && <ErrorMessage>Error: {error.message}</ErrorMessage>}

      {!isLoading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>User</th>
              <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #dee2e6' }}>Requests</th>
              <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #dee2e6' }}>Prompt Tokens</th>
              <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #dee2e6' }}>Completion Tokens</th>
              <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #dee2e6' }}>Total Tokens</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.user_id}>
                <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>{row.user_id}</td>
                <td style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'right' }}>{formatNumber(row.requests)}</td>
                <td style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'right' }}>{formatNumber(row.prompt_tokens)}</td>
                <td style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'right' }}>{formatNumber(row.completion_tokens)}</td>
                <td style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'right' }}><b>{formatNumber(row.total_tokens)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && !error && users.length === 0 && (
        <p style={{ color: '#888', marginTop: '1em' }}>No AI usage recorded in this window.</p>
      )}
    </div>
  );
}
