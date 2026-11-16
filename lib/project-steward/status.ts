// Pure presentation logic: labels, tones, freshness, attention queue, search/filter.
// No React Native imports, so it is unit tested directly in Node.

import type {
  DeploymentState,
  DevState,
  EvidenceLevel,
  Priority,
  Project,
  Source,
  SourceKind,
} from './types';

export type Tone = 'good' | 'info' | 'warn' | 'bad' | 'muted';

/**
 * A finding older than this is shown as STALE. The v1 contract does not define a
 * threshold, so this is a UI assumption (documented in the PR).
 */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export const PRIORITY_LABEL: Record<Priority, string> = {
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
  p3: 'P3',
  on_hold: 'On hold',
  unranked: 'Unranked',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
  p3: 3,
  unranked: 4,
  on_hold: 5,
};

export const DEV_STATE_LABEL: Record<DevState, string> = {
  planned: 'Planned',
  coded: 'Coded',
  tested: 'Tested',
  owner_accepted: 'Owner accepted',
  blocked: 'Blocked',
  on_hold: 'On hold',
  unknown: 'Unknown',
};

export const DEV_STATE_TONE: Record<DevState, Tone> = {
  planned: 'muted',
  coded: 'info',
  tested: 'info',
  owner_accepted: 'good',
  blocked: 'bad',
  on_hold: 'muted',
  unknown: 'warn',
};

export const DEPLOYMENT_LABEL: Record<DeploymentState, string> = {
  verified_current: 'Verified current',
  historically_verified: 'Verified (historical)',
  reported: 'Reported, not verified',
  not_deployed: 'Not deployed',
  unknown: 'Unknown',
};

export const DEPLOYMENT_TONE: Record<DeploymentState, Tone> = {
  verified_current: 'good',
  historically_verified: 'info',
  reported: 'warn',
  not_deployed: 'muted',
  unknown: 'warn',
};

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  host_verified: 'Host verified',
  git_verified: 'Git verified',
  owner_report: 'Owner report',
  historical: 'Historical',
  unverified: 'Unverified',
};

export const EVIDENCE_TONE: Record<EvidenceLevel, Tone> = {
  host_verified: 'good',
  git_verified: 'good',
  owner_report: 'info',
  historical: 'info',
  unverified: 'warn',
};

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  git_repo: 'Git repo',
  git_pr: 'Pull request',
  git_issue: 'Issue',
  owner_approved_memory: 'Approved memory',
  host_receipt: 'Host receipt',
  owner_report: 'Owner report',
  other: 'Other',
};

export type Freshness = 'fresh' | 'stale' | 'unknown';

export function freshness(
  observedAt: string | null | undefined,
  now: number,
  staleAfterMs = STALE_AFTER_MS,
): Freshness {
  if (!observedAt) return 'unknown';
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return 'unknown';
  return now - t > staleAfterMs ? 'stale' : 'fresh';
}

/** Short relative age such as "3h ago"; future timestamps say so instead of lying. */
export function relativeAge(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never checked';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unreadable time';
  const diff = now - t;
  if (diff < -60_000) return 'in the future (clock skew?)';
  const mins = Math.max(0, Math.round(diff / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Absolute UTC timestamp, deterministic across devices: "2026-11-15 18:00 UTC". */
export function absoluteUtc(iso: string | null | undefined): string {
  if (!iso) return 'not recorded';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unreadable time';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Newest source timestamp, or null when the project cites no sources. */
export function latestSourceAt(project: Project): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const s of project.sources) {
    const t = Date.parse(s.observed_at);
    if (!Number.isNaN(t) && (best === null || t > best)) {
      best = t;
      bestIso = s.observed_at;
    }
  }
  return bestIso;
}

/**
 * Turns a source ref into an https link when it is unambiguous. Only https URLs and
 * GitHub "owner/repo#123" or "owner/repo" refs are linked; anything else is text.
 */
export function sourceUrl(source: Source): string | null {
  const ref = source.ref.trim();
  if (/^https:\/\/[^\s]+$/i.test(ref)) return ref;
  const m = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#(\d+))?$/.exec(ref);
  if (!m) return null;
  const [, repo, num] = m;
  if (!num) return source.kind === 'git_repo' ? `https://github.com/${repo}` : null;
  if (source.kind === 'git_pr') return `https://github.com/${repo}/pull/${num}`;
  if (source.kind === 'git_issue') return `https://github.com/${repo}/issues/${num}`;
  return null;
}

export type AttentionReason =
  | 'blocked'
  | 'stale'
  | 'never_checked'
  | 'no_sources'
  | 'deployment_unverified';

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  blocked: 'Blocked',
  stale: 'Status is stale',
  never_checked: 'Never checked',
  no_sources: 'No cited sources',
  deployment_unverified: 'Deployment only reported',
};

export function attentionReasons(project: Project, now: number): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (project.state === 'blocked' || project.blocked_by.length > 0) reasons.push('blocked');
  const f = freshness(project.observed_at, now);
  if (f === 'stale') reasons.push('stale');
  if (f === 'unknown') reasons.push('never_checked');
  if (project.sources.length === 0) reasons.push('no_sources');
  if (project.deployment === 'reported') reasons.push('deployment_unverified');
  return reasons;
}

export interface AttentionItem {
  project: Project;
  reasons: AttentionReason[];
}

/** Needs-attention queue: blocked first, then by priority, then by name. */
export function attentionQueue(projects: Project[], now: number): AttentionItem[] {
  return projects
    .map((project) => ({ project, reasons: attentionReasons(project, now) }))
    .filter((item) => item.reasons.length > 0 && item.project.priority !== 'on_hold')
    .sort((a, b) => {
      const ab = a.reasons.includes('blocked') ? 0 : 1;
      const bb = b.reasons.includes('blocked') ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return compareProjects(a.project, b.project);
    });
}

export function compareProjects(a: Project, b: Project): number {
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (p !== 0) return p;
  return a.name.localeCompare(b.name);
}

export type QuickFilter = 'all' | 'attention' | 'blocked' | 'stale' | 'deployed_evidence';

export const QUICK_FILTER_LABEL: Record<QuickFilter, string> = {
  all: 'All',
  attention: 'Needs attention',
  blocked: 'Blocked',
  stale: 'Stale / unchecked',
  deployed_evidence: 'Has deploy evidence',
};

export interface ProjectQuery {
  text: string;
  quick: QuickFilter;
  priority: Priority | 'any';
}

export const EMPTY_QUERY: ProjectQuery = { text: '', quick: 'all', priority: 'any' };

function haystack(p: Project): string {
  return [
    p.name,
    p.id,
    p.summary ?? '',
    ...p.repositories,
    ...p.blocked_by,
    ...p.sources.map((s) => s.ref),
    DEV_STATE_LABEL[p.state],
    DEPLOYMENT_LABEL[p.deployment],
    EVIDENCE_LABEL[p.evidence_level],
  ]
    .join('\n')
    .toLowerCase();
}

export function filterProjects(
  projects: Project[],
  query: ProjectQuery,
  now: number,
): Project[] {
  const terms = query.text.toLowerCase().split(/\s+/).filter(Boolean);
  return projects
    .filter((p) => {
      if (query.priority !== 'any' && p.priority !== query.priority) return false;
      switch (query.quick) {
        case 'attention':
          // Same rule as attentionQueue(): on-hold projects do not ask for attention.
          if (p.priority === 'on_hold' || attentionReasons(p, now).length === 0) return false;
          break;
        case 'blocked':
          if (!(p.state === 'blocked' || p.blocked_by.length > 0)) return false;
          break;
        case 'stale':
          if (freshness(p.observed_at, now) === 'fresh') return false;
          break;
        case 'deployed_evidence':
          if (!(p.deployment === 'verified_current' || p.deployment === 'historically_verified')) {
            return false;
          }
          break;
        case 'all':
          break;
      }
      if (terms.length === 0) return true;
      const h = haystack(p);
      return terms.every((t) => h.includes(t));
    })
    .sort(compareProjects);
}

export interface FactSplit {
  known: string[];
  unknown: string[];
}

/** Separates what the snapshot actually establishes from what it leaves open. */
export function knownAndUnknown(p: Project, now: number): FactSplit {
  const known: string[] = [];
  const unknown: string[] = [];

  if (p.state === 'unknown') unknown.push('Development stage has not been determined.');
  else known.push(`Development stage: ${DEV_STATE_LABEL[p.state]}.`);

  if (p.deployment === 'unknown') {
    unknown.push('Deployment status is unknown. Nothing is assumed from Git activity.');
  } else if (p.deployment === 'reported') {
    known.push('Deployment was reported by the owner.');
    unknown.push('That deployment report has not been verified on a host.');
  } else {
    known.push(`Deployment: ${DEPLOYMENT_LABEL[p.deployment]}.`);
  }
  if (p.deployment === 'historically_verified') {
    unknown.push('Whether the historically verified deployment is still running now.');
  }

  if (p.repositories.length > 0) {
    known.push(`Linked repositories: ${p.repositories.join(', ')}.`);
  } else {
    unknown.push('No repository linked (the project may not have a standalone repo).');
  }

  if (p.sources.length === 0) unknown.push('No sources cited for any of these facts.');
  if (p.evidence_level === 'unverified') {
    unknown.push('Evidence level is unverified; treat every status here as a placeholder.');
  }

  const f = freshness(p.observed_at, now);
  if (f === 'unknown') unknown.push('This project has never been checked.');
  else if (f === 'stale') unknown.push(`Last check is stale (${relativeAge(p.observed_at, now)}).`);

  if (p.blocked_by.length > 0) {
    known.push(`${p.blocked_by.length} open blocker${p.blocked_by.length > 1 ? 's' : ''}.`);
  }
  return { known, unknown };
}
