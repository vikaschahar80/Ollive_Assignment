import React, { useState, useEffect } from 'react';
import { Activity, Clock, Zap, AlertTriangle, DollarSign, Database, ShieldAlert, RefreshCw } from 'lucide-react';
import { API_BASE } from '../config';

function Dashboard({ showToast }) {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch telemetry logs and statistics
  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      showToast('Could not sync dashboard analytics.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    // Poll analytics every 5 seconds for a real-time hot-reloading dashboard experience
    const interval = setInterval(fetchAnalytics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <RefreshCw className="typing-dot" size={32} style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-primary)' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading live telemetry metrics...</p>
      </div>
    );
  }

  const { aggregates, modelBreakdown, timeline, recentLogs } = analyticsData || {
    aggregates: { totalRequests: 0, totalTokens: 0, totalCost: 0, avgLatencyMs: 0, avgTps: 0, errorRate: 0 },
    modelBreakdown: [],
    timeline: [],
    recentLogs: []
  };

  return (
    <div className="dashboard-view">
      {/* Upper header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-header)', fontSize: '1.8rem', fontWeight: 800 }}>Inference Telemetry</h1>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '2px' }}>Real-time telemetry and API performance metrics</p>
        </div>
        <button 
          onClick={fetchAnalytics}
          className="submit-btn" 
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
        >
          <RefreshCw size={14} />
          <span>Refresh Traces</span>
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="stats-grid">
        <div className="stat-card emerald">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="stat-label">Total Traces</span>
            <Database size={16} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <span className="stat-value">{aggregates.totalRequests}</span>
          <span className="stat-subtext">Inference calls logged</span>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="stat-label">Avg Latency</span>
            <Clock size={16} style={{ color: 'var(--accent-secondary)' }} />
          </div>
          <span className="stat-value">{aggregates.avgLatencyMs}ms</span>
          <span className="stat-subtext">Prompt execution speed</span>
        </div>

        <div className="stat-card purple">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="stat-label">Throughput</span>
            <Zap size={16} style={{ color: 'var(--accent-purple)' }} />
          </div>
          <span className="stat-value">{aggregates.avgTps}</span>
          <span className="stat-subtext">Average tokens / sec</span>
        </div>

        <div className="stat-card orange">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="stat-label">Billing Cost</span>
            <DollarSign size={16} style={{ color: 'var(--accent-orange)' }} />
          </div>
          <span className="stat-value">${aggregates.totalCost.toFixed(5)}</span>
          <span className="stat-subtext">Calculated API expenditure</span>
        </div>

        <div className="stat-card" style={{ borderColor: aggregates.errorRate > 5 ? 'var(--danger)' : '' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className="stat-label">Error Rate</span>
            <AlertTriangle size={16} style={{ color: aggregates.errorRate > 0 ? 'var(--danger)' : 'var(--text-muted)' }} />
          </div>
          <span className="stat-value" style={{ color: aggregates.errorRate > 0 ? 'var(--danger)' : '' }}>
            {aggregates.errorRate}%
          </span>
          <span className="stat-subtext">Inference failure ratio</span>
        </div>
      </div>

      {/* SVG Charts Area */}
      <div className="charts-grid">
        {/* Latency History */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">
              <Clock size={16} style={{ color: 'var(--accent-secondary)' }} />
              <span>Latency Timeline (ms)</span>
            </h3>
          </div>
          <div className="chart-body">
            <SvgTimelineChart 
              data={timeline} 
              valueKey="latencyMs" 
              labelKey="timestamp" 
              strokeColor="var(--accent-secondary)" 
              fillColor="rgba(6, 182, 212, 0.08)"
            />
          </div>
        </div>

        {/* Throughput History */}
        <div className="chart-card">
          <div className="chart-header">
            <h3 className="chart-title">
              <Zap size={16} style={{ color: 'var(--accent-primary)' }} />
              <span>Throughput Speed (Tokens/s)</span>
            </h3>
          </div>
          <div className="chart-body">
            <SvgTimelineChart 
              data={timeline} 
              valueKey="throughputTps" 
              labelKey="timestamp" 
              strokeColor="var(--accent-primary)" 
              fillColor="rgba(16, 185, 129, 0.08)"
            />
          </div>
        </div>
      </div>

      {/* Mid panel: Model Breakdown & Stats */}
      <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* Model Breakdown Metrics */}
        <div className="chart-card" style={{ gridColumn: 'span 2' }}>
          <h3 className="chart-title">
            <Activity size={16} style={{ color: 'var(--accent-purple)' }} />
            <span>Model Performance Matrix</span>
          </h3>
          <div style={{ marginTop: '8px' }}>
            <div className="breakdown-row" style={{ borderBottom: '2px solid var(--border-color)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              <span>MODEL & PROVIDER</span>
              <div style={{ display: 'flex', gap: '32px' }}>
                <span style={{ width: '60px', textAlign: 'right' }}>CALLS</span>
                <span style={{ width: '80px', textAlign: 'right' }}>LATENCY</span>
                <span style={{ width: '80px', textAlign: 'right' }}>SPEED</span>
                <span style={{ width: '70px', textAlign: 'right' }}>COST</span>
              </div>
            </div>
            {modelBreakdown.length === 0 ? (
              <div style={{ padding: '16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No statistics compiled.</div>
            ) : (
              modelBreakdown.map((row, idx) => (
                <div key={idx} className="breakdown-row">
                  <div className="breakdown-name">
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{row.model}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{row.provider}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '32px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    <span style={{ width: '60px', textAlign: 'right', fontWeight: 600 }}>{row.requests}</span>
                    <span style={{ width: '80px', textAlign: 'right', color: 'var(--accent-secondary)' }}>{row.avgLatencyMs}ms</span>
                    <span style={{ width: '80px', textAlign: 'right', color: 'var(--accent-primary)' }}>{row.avgTps} t/s</span>
                    <span style={{ width: '70px', textAlign: 'right', color: 'var(--accent-orange)' }}>${row.totalCost.toFixed(4)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tracer Table Feed */}
      <div className="logs-table-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="chart-title">
            <Database size={16} />
            <span>Telemetry Log Stream (Last 50 events)</span>
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }}></span>
            Ingestion active (Auto-refreshing)
          </span>
        </div>

        <div className="logs-table-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Provider/Model</th>
                <th>Latency</th>
                <th>Tokens (P+C)</th>
                <th>Cost</th>
                <th>Input Preview</th>
                <th>Response Preview</th>
                <th>PII Redacted</th>
                <th>Logged At</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                    No inference logs captured yet. Send chat queries to populate telemetry.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className={`badge-status ${log.status === 'success' ? 'success' : 'error'}`}>
                        {log.status === 'success' ? 'SUCCESS' : 'ERROR'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{log.model}</span>
                        <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{log.provider}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{log.latency_ms}ms</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {log.total_tokens} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({log.prompt_tokens}+{log.completion_tokens})</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>${parseFloat(log.cost).toFixed(5)}</td>
                    <td>
                      <div className="preview-text-block" title={log.prompt_preview}>{log.prompt_preview}</div>
                    </td>
                    <td>
                      <div className="preview-text-block" title={log.response_preview}>{log.response_preview}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {log.pii_redacted ? (
                        <span style={{ color: 'var(--accent-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(6,182,212,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(6,182,212,0.15)' }}>
                          <ShieldAlert size={12} />
                          <span>REDACTED</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable, High-Performance Custom SVG Timeline Chart
 * Eliminates version peer issues of external frameworks while drawing rich glass curves.
 */
function SvgTimelineChart({ data, valueKey, labelKey, strokeColor, fillColor }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        Insufficient historical telemetry. Need at least 2 trace points to trace timeline.
      </div>
    );
  }

  const width = 450;
  const height = 180;
  const padding = 20;

  // Find boundaries
  const yValues = data.map(d => d[valueKey] || 0);
  const minVal = 0;
  const maxVal = Math.max(...yValues) * 1.15 || 10;

  // Generate plot coordinates
  const points = data.map((item, index) => {
    const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((item[valueKey] || 0) / maxVal) * (height - 2 * padding);
    return { x, y, value: item[valueKey] || 0 };
  });

  // Assemble path lines
  const pathD = `M ${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  
  // Assemble closed area for gradient fill
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)},${(height - padding).toFixed(1)} L ${points[0].x.toFixed(1)},${(height - padding).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`grad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>

      {/* Grid Lines */}
      <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} />

      {/* Max value text label */}
      <text x={padding + 4} y={padding + 10} fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)">
        {Math.round(maxVal)}
      </text>
      
      {/* Min value text label */}
      <text x={padding + 4} y={height - padding - 4} fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)">
        0
      </text>

      {/* Gradient Fill under path */}
      <path d={areaD} fill={`url(#grad-${valueKey})`} />

      {/* Glowing Path Stroke */}
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Interactive Trace Dots */}
      {points.map((p, i) => (
        <circle 
          key={i} 
          cx={p.x} 
          cy={p.y} 
          r={i === points.length - 1 ? 4 : 2} 
          fill={strokeColor} 
          stroke="var(--bg-surface)" 
          strokeWidth={i === points.length - 1 ? 2 : 1}
        >
          <title>{`${p.value.toFixed(1)} on trace bucket`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default Dashboard;
