import { useEffect, useState } from 'react';
import { DesktopApiError } from './lib/api/client';
import { desktopLogin, desktopGetCurrentUser, desktopLogout } from './lib/api/auth';
import type { DesktopUser } from './lib/api/auth';
import {
  desktopListQueue,
  desktopGetReview,
  desktopClaimReview,
  desktopApproveReview,
  desktopRejectReview,
} from './lib/api/reviews';
import type { DesktopReviewQueueItem, DesktopReviewDetail } from './lib/api/reviews';

type Screen = 'login' | 'queue' | 'detail';

const s = {
  bg: 'background:#0f172a;min-height:100vh;color:#e2e8f0;font-family:system-ui,sans-serif;padding:0;margin:0' as const,
  card: 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:24px' as const,
  input: 'background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 14px;color:#e2e8f0;font-size:13px;width:100%;box-sizing:border-box' as const,
  btnPrimary: 'background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.3);border-radius:12px;padding:10px 20px;color:#6ee7b7;font-size:13px;font-weight:600;cursor:pointer' as const,
  btnSky: 'background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);border-radius:12px;padding:8px 16px;color:#7dd3fc;font-size:12px;cursor:pointer' as const,
  btnRed: 'background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);border-radius:12px;padding:8px 16px;color:#fca5a5;font-size:12px;cursor:pointer' as const,
  btnGhost: 'background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:8px 16px;color:#94a3b8;font-size:12px;cursor:pointer' as const,
  label: 'display:block;font-size:11px;font-weight:500;color:#94a3b8;margin-bottom:6px' as const,
  error: 'background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:10px 14px;font-size:13px;color:#fca5a5' as const,
  badge: (status: string) => {
    const colors: Record<string, string> = {
      pending: 'background:rgba(250,204,21,0.1);border:1px solid rgba(250,204,21,0.2);color:#fde047',
      in_review: 'background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);color:#7dd3fc',
      approved: 'background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2);color:#6ee7b7',
      rejected: 'background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.2);color:#fca5a5',
    };
    return `display:inline-block;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:500;${colors[status] ?? colors.pending}`;
  },
};

function DesktopRuntimeBanner() {
  const runtime = typeof window !== 'undefined' ? window.balanceDesktop?.runtime : undefined;

  return (
    <div style={{ padding: '18px 24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.01em' }}>
            {runtime?.appName ?? 'Balance'} Desktop Workspace
          </div>
          <div style={{ marginTop: 2, fontSize: 11, letterSpacing: '0.22em', color: '#64748b' }}>
            DOCUMENT WORKFLOW PLATFORM
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Environment</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#e2e8f0' }}>
            {runtime?.environmentLabel ?? runtime?.environment?.toUpperCase?.() ?? 'LOCAL'}
          </span>
        </div>
      </div>
      <div style={{ marginTop: 14, height: 1, background: 'rgba(148,163,184,0.12)' }} />
    </div>
  );
}

// Wrapper to hold selectedId in state at App level
function AppWithState() {
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<DesktopUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  useEffect(() => {
    desktopGetCurrentUser()
      .then(async (u) => {
        if (u.role === 'consumer') {
          await desktopLogout().catch(() => undefined);
          setAuthLoading(false);
          return;
        }
        setUser(u);
        setScreen('queue');
        setAuthLoading(false);
      })
      .catch(() => { setAuthLoading(false); });
  }, []);

  async function handleLogout() {
    await desktopLogout();
    setUser(null);
    setScreen('login');
    setSelectedReviewId(null);
  }

  if (authLoading) {
    return (
      <div style={{ background: '#0f172a', minHeight: '100vh' }}>
        <DesktopRuntimeBanner />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 24px' }}>
          <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:'#0f172a', minHeight:'100vh', color:'#e2e8f0', fontFamily:'system-ui,sans-serif' }}>
      <DesktopRuntimeBanner />
      {screen === 'login' && (
        <LoginScreen onSuccess={(u) => { setUser(u); setScreen('queue'); }} />
      )}
      {screen === 'queue' && user && (
        <QueueScreen
          user={user}
          onLogout={handleLogout}
          onSelectReview={(id) => { setSelectedReviewId(id); setScreen('detail'); }}
        />
      )}
      {screen === 'detail' && user && selectedReviewId && (
        <ReviewDetailScreen
          reviewId={selectedReviewId}
          _user={user}
          onBack={() => setScreen('queue')}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

// Re-export AppWithState as the real App
export { AppWithState as default, AppWithState as App };

// ── Login Screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: (u: DesktopUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password) { setError('Password is required.'); return; }

    setLoading(true);
    try {
      const u = await desktopLogin(email.trim(), password);
      if (u.role === 'consumer') {
        await desktopLogout().catch(() => undefined);
        setError('This client is for reviewers and admins only.');
        return;
      }
      onSuccess(u);
    } catch (err) {
      if (err instanceof DesktopApiError && err.status === 401) setError('Invalid email or password.');
      else if (err instanceof DesktopApiError && err.status >= 500) setError('Service unavailable. Please try again.');
      else setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth:420, margin:'0 auto', padding:'80px 24px' }}>
      <div style={parseStyle(s.card)}>
        <div style={{ marginBottom:24 }}>
          <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.2em', color:'#7dd3fc', textTransform:'uppercase' }}>Balance Desktop</span>
          <h1 style={{ margin:'8px 0 4px', fontSize:28, fontWeight:600 }}>Reviewer Sign In</h1>
          <p style={{ color:'#64748b', fontSize:13 }}>Enterprise review workflow client</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={parseStyle(s.label)}>Email</label>
            <input style={parseStyle(s.input)} type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} placeholder="reviewer@balance.local" />
          </div>
          <div>
            <label style={parseStyle(s.label)}>Password</label>
            <input style={parseStyle(s.input)} type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} placeholder="••••••••" />
          </div>
          {error && <div style={parseStyle(s.error)}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...parseStyle(s.btnPrimary), opacity: loading ? 0.5 : 1 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Queue Screen ──────────────────────────────────────────────────────────────

function QueueScreen({ user, onLogout, onSelectReview }: {
  user: DesktopUser;
  onLogout: () => void;
  onSelectReview: (id: string) => void;
}) {
  const [reviews, setReviews] = useState<DesktopReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    desktopListQueue()
      .then(res => { setReviews(res.reviews); setLoading(false); })
      .catch(err => { setError(err instanceof DesktopApiError ? err.error.message : 'Failed to load queue.'); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:32 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.2em', color:'#7dd3fc', textTransform:'uppercase' }}>Balance Desktop</span>
          <h1 style={{ margin:'4px 0', fontSize:22, fontWeight:600 }}>Review Queue</h1>
          <p style={{ color:'#64748b', fontSize:12 }}>{user.displayName} · {user.role}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load} disabled={loading} style={{ ...parseStyle(s.btnGhost), opacity: loading ? 0.5 : 1 }}>Refresh</button>
          <button onClick={onLogout} style={parseStyle(s.btnGhost)}>Sign out</button>
        </div>
      </div>

      {loading && <p style={{ color:'#64748b', fontSize:13 }}>Loading queue…</p>}
      {error && <div style={parseStyle(s.error)}>{error}</div>}

      {!loading && !error && reviews.length === 0 && (
        <div style={{ ...parseStyle(s.card), textAlign:'center', color:'#64748b', fontSize:13 }}>
          No items in the review queue.
        </div>
      )}

      {!loading && reviews.map(review => (
        <button
          key={review.id}
          onClick={() => onSelectReview(review.id)}
          style={{ display:'block', width:'100%', textAlign:'left', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:16, marginBottom:8, cursor:'pointer', color:'#e2e8f0' }}
        >
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div style={{ minWidth:0 }}>
              <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{review.originalFilename}</p>
              <p style={{ margin:0, fontSize:11, color:'#64748b' }}>
                {review.consumerName} · {review.merchantName ?? '-'}
                {review.amountMinor != null ? ` · ${(review.amountMinor / 100).toFixed(2)} ${review.currency ?? ''}` : ''}
              </p>
            </div>
            <span style={parseStyle(s.badge(review.status))}>{review.status.replace(/_/g, ' ')}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Review Detail Screen ──────────────────────────────────────────────────────

function ReviewDetailScreen({ reviewId, _user: _user, onBack, onLogout }: {
  reviewId: string;
  _user: DesktopUser;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [review, setReview] = useState<DesktopReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  function loadReview() {
    setLoading(true);
    desktopGetReview(reviewId)
      .then(res => { setReview(res.review); setLoading(false); })
      .catch(err => {
        if (err instanceof DesktopApiError && err.status === 404) setError('Review not found.');
        else if (err instanceof DesktopApiError && err.status === 403) setError('Access denied.');
        else setError('Failed to load review.');
        setLoading(false);
      });
  }

  useEffect(() => { loadReview(); }, [reviewId]);

  async function handleClaim() {
    setActionError(null); setClaiming(true);
    try { await desktopClaimReview(reviewId); loadReview(); }
    catch (err) { setActionError(err instanceof DesktopApiError ? err.error.message : 'Failed to claim review.'); }
    finally { setClaiming(false); }
  }

  async function handleApprove() {
    setActionError(null); setApproving(true);
    try { await desktopApproveReview(reviewId); onBack(); }
    catch (err) { setActionError(err instanceof DesktopApiError ? err.error.message : 'Failed to approve.'); setApproving(false); }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    if (!rejectNote.trim()) { setActionError('Rejection reason is required.'); return; }
    setRejecting(true);
    try { await desktopRejectReview(reviewId, rejectNote.trim()); onBack(); }
    catch (err) { setActionError(err instanceof DesktopApiError ? err.error.message : 'Failed to reject.'); setRejecting(false); }
  }

  if (loading) return <div style={{ padding:32, color:'#64748b', fontSize:13 }}>Loading review…</div>;

  return (
    <div style={{ maxWidth:720, margin:'0 auto', padding:32 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <button onClick={onBack} style={parseStyle(s.btnGhost)}>← Back to queue</button>
        <button onClick={onLogout} style={parseStyle(s.btnGhost)}>Sign out</button>
      </div>

      {error && <div style={parseStyle(s.error)}>{error}</div>}

      {review && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
            <div>
              <h1 style={{ margin:'0 0 4px', fontSize:20, fontWeight:600 }}>{review.document.originalFilename}</h1>
              <p style={{ margin:0, color:'#64748b', fontSize:12 }}>{review.claim.purpose}</p>
            </div>
            <span style={parseStyle(s.badge(review.status))}>{review.status.replace(/_/g, ' ')}</span>
          </div>

          {/* Document fields */}
          {review.document.fields.length > 0 && (
            <div style={parseStyle(s.card)}>
              <p style={{ margin:'0 0 12px', fontSize:11, fontWeight:600, letterSpacing:'0.15em', color:'#64748b', textTransform:'uppercase' }}>Extracted fields</p>
              {review.document.fields.map(f => (
                <div key={f.id} style={{ display:'flex', gap:16, fontSize:13, marginBottom:8 }}>
                  <span style={{ color:'#64748b', width:120, flexShrink:0 }}>{f.label}</span>
                  <span>{f.correctedValue ?? f.value}</span>
                  {f.correctedValue && <span style={{ color:'#64748b', textDecoration:'line-through', fontSize:11 }}>{f.value}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Claim */}
          <div style={parseStyle(s.card)}>
            <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:600, letterSpacing:'0.15em', color:'#64748b', textTransform:'uppercase' }}>Claim</p>
            <p style={{ margin:'0 0 4px', fontSize:13 }}>{review.claim.purpose}</p>
            {review.claim.note && <p style={{ margin:'0 0 4px', fontSize:12, color:'#94a3b8' }}>{review.claim.note}</p>}
            <span style={parseStyle(s.badge(review.claim.status))}>{review.claim.status.replace(/_/g, ' ')}</span>
          </div>

          {/* Audit */}
          {review.auditEvents.length > 0 && (
            <div style={parseStyle(s.card)}>
              <p style={{ margin:'0 0 12px', fontSize:11, fontWeight:600, letterSpacing:'0.15em', color:'#64748b', textTransform:'uppercase' }}>Audit timeline</p>
              {review.auditEvents.map(ev => (
                <div key={ev.id} style={{ display:'flex', gap:12, fontSize:11, marginBottom:6, color:'#94a3b8' }}>
                  <span style={{ color:'#475569', width:140, flexShrink:0 }}>{new Date(ev.createdAt).toLocaleString()}</span>
                  <span>{ev.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {review.status !== 'approved' && review.status !== 'rejected' && (
            <div style={parseStyle(s.card)}>
              <p style={{ margin:'0 0 12px', fontSize:11, fontWeight:600, letterSpacing:'0.15em', color:'#64748b', textTransform:'uppercase' }}>Actions</p>
              {actionError && <div style={{ ...parseStyle(s.error), marginBottom:12 }}>{actionError}</div>}

              {review.status === 'pending' && (
                <button onClick={handleClaim} disabled={claiming} style={{ ...parseStyle(s.btnSky), opacity: claiming ? 0.5 : 1 }}>
                  {claiming ? 'Claiming…' : 'Start review'}
                </button>
              )}

              {review.status === 'in_review' && !showRejectForm && (
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={handleApprove} disabled={approving} style={{ ...parseStyle(s.btnPrimary), opacity: approving ? 0.5 : 1, fontSize:12 }}>
                    {approving ? 'Approving…' : 'Approve'}
                  </button>
                  <button onClick={() => setShowRejectForm(true)} disabled={approving} style={parseStyle(s.btnRed)}>
                    Reject
                  </button>
                </div>
              )}

              {review.status === 'in_review' && showRejectForm && (
                <form onSubmit={handleReject} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div>
                    <label style={parseStyle(s.label)}>Rejection reason *</label>
                    <textarea
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value)}
                      disabled={rejecting}
                      rows={3}
                      placeholder="Explain the reason for rejection…"
                      style={{ ...parseStyle(s.input), resize:'vertical' }}
                    />
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button type="submit" disabled={rejecting} style={{ ...parseStyle(s.btnRed), opacity: rejecting ? 0.5 : 1 }}>
                      {rejecting ? 'Rejecting…' : 'Confirm rejection'}
                    </button>
                    <button type="button" onClick={() => { setShowRejectForm(false); setRejectNote(''); setActionError(null); }} disabled={rejecting} style={parseStyle(s.btnGhost)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {(review.status === 'approved' || review.status === 'rejected') && (
            <div style={{ background: review.status === 'approved' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${review.status === 'approved' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius:16, padding:16 }}>
              <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:500, color: review.status === 'approved' ? '#6ee7b7' : '#fca5a5' }}>
                Review {review.status}
              </p>
              {review.decisionNote && <p style={{ margin:0, fontSize:13, color:'#94a3b8' }}>{review.decisionNote}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseStyle(cssString: string): React.CSSProperties {
  const result: Record<string, string> = {};
  cssString.split(';').forEach(rule => {
    const [prop, ...valueParts] = rule.split(':');
    if (prop && valueParts.length) {
      const camel = prop.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      result[camel] = valueParts.join(':').trim();
    }
  });
  return result as React.CSSProperties;
}
