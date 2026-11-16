// PROPOSED Project Snapshot v1.1 extension (see proposed/ in this folder). Not an
// approved contract yet; v1 stays fully supported.
//
// project-snapshot.v1 has no fields for pull requests, CI, commit/deploy times, next
// steps, activity or links, and forbids extra properties. Rather than change the
// contract from the UI lane, v1.1 is a proposal: each project MAY carry an optional
// `insights` object of the shape below. The client accepts "1.0" (no insights, UI
// says "not available") and "1.1" (insights shown when present, "not collected"
// per project or per group when absent/null).
//
// Convention: `null` means unknown / not collected. An empty array means "checked,
// there are none". Every group carries its own observed_at so it can go stale alone.

import { isDateTime, isSafeUrl } from './text';

export { isSafeUrl };

export const PR_REVIEW_STATES = [
  'draft',
  'review_required',
  'changes_requested',
  'approved',
] as const;
export type PrReview = (typeof PR_REVIEW_STATES)[number];

export const CI_STATES = ['passing', 'failing', 'pending', 'none', 'unknown'] as const;
export type CiState = (typeof CI_STATES)[number];

export const NEXT_KINDS = ['owner_decision', 'milestone'] as const;
export type NextKind = (typeof NEXT_KINDS)[number];

export const ACTIVITY_KINDS = ['commit', 'pr', 'issue', 'ci', 'deploy', 'decision', 'note'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const LINK_KINDS = ['repo', 'live', 'issues', 'docs'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export interface OpenPr {
  /** "owner/repo#123" or the PR's https URL. */
  ref: string;
  title: string;
  review: PrReview;
  opened_at: string;
  updated_at: string;
  head_sha: string | null;
}

export interface CiEvidence {
  state: CiState;
  branch: string;
  /** Link or ref to the run, null when there is none. */
  run_ref: string | null;
  commit_sha: string | null;
  observed_at: string;
}

export interface Moment {
  at: string;
  ref: string | null;
  commit_sha: string | null;
}

export interface NextStep {
  kind: NextKind;
  text: string;
  ref: string | null;
}

export interface ActivityEvent {
  at: string;
  kind: ActivityKind;
  text: string;
  ref: string | null;
}

export interface ProjectLink {
  kind: LinkKind;
  label: string;
  url: string;
}

export interface ProjectInsights {
  /** When these insights were gathered. */
  observed_at: string;
  open_prs: { observed_at: string; items: OpenPr[] } | null;
  /** Newest commit on the default branch. */
  last_commit: (Moment & { branch: string; observed_at: string }) | null;
  /** Newest deployment with evidence. null = none recorded (never implies "not deployed"). */
  last_deploy: (Moment & { target: string; observed_at: string }) | null;
  /** Default-branch CI, reported as its own evidence source. */
  ci: CiEvidence | null;
  next: NextStep[];
  activity: ActivityEvent[];
  links: ProjectLink[];
}

export type InsightsMap = Record<string, ProjectInsights>;

// ---------- validation (strict, same style as validate.ts) ----------

const REF = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/;
const SHA = /^[a-f0-9]{7,40}$/;

function obj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function keys(o: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const k of allowed) if (!(k in o)) errors.push(`${path}: missing "${k}"`);
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${path}: unexpected "${k}"`);
}

function str(v: unknown, path: string, errors: string[], max = 300) {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    errors.push(`${path}: must be a non-empty string up to ${max} chars`);
  }
}

function time(v: unknown, path: string, errors: string[]) {
  if (!isDateTime(v)) errors.push(`${path}: must be an RFC 3339 date-time`);
}

function oneOf(v: unknown, values: readonly string[], path: string, errors: string[]) {
  if (typeof v !== 'string' || !values.includes(v)) errors.push(`${path}: must be one of ${values.join(', ')}`);
}

function shaOrNull(v: unknown, path: string, errors: string[]) {
  if (v !== null && (typeof v !== 'string' || !SHA.test(v))) errors.push(`${path}: bad sha`);
}

function strOrNull(v: unknown, path: string, errors: string[]) {
  if (v !== null) str(v, path, errors, 512);
}

function moment(v: unknown, extra: string[], path: string, errors: string[]) {
  if (v === null) return;
  if (!obj(v)) {
    errors.push(`${path}: must be an object or null`);
    return;
  }
  keys(v, ['at', 'ref', 'commit_sha', 'observed_at', ...extra], path, errors);
  time(v.at, `${path}.at`, errors);
  time(v.observed_at, `${path}.observed_at`, errors);
  strOrNull(v.ref, `${path}.ref`, errors);
  shaOrNull(v.commit_sha, `${path}.commit_sha`, errors);
  for (const k of extra) str(v[k], `${path}.${k}`, errors, 120);
}

export function validateInsights(v: unknown, path = 'insights'): string[] {
  const errors: string[] = [];
  if (!obj(v)) return [`${path}: must be an object`];
  keys(v, ['observed_at', 'open_prs', 'last_commit', 'last_deploy', 'ci', 'next', 'activity', 'links'], path, errors);
  time(v.observed_at, `${path}.observed_at`, errors);

  if (v.open_prs !== null) {
    if (!obj(v.open_prs) || !Array.isArray(v.open_prs.items)) {
      errors.push(`${path}.open_prs: must be {observed_at, items[]} or null`);
    } else {
      keys(v.open_prs, ['observed_at', 'items'], `${path}.open_prs`, errors);
      time(v.open_prs.observed_at, `${path}.open_prs.observed_at`, errors);
      v.open_prs.items.forEach((pr, i) => {
        const p = `${path}.open_prs.items[${i}]`;
        if (!obj(pr)) return errors.push(`${p}: must be an object`);
        keys(pr, ['ref', 'title', 'review', 'opened_at', 'updated_at', 'head_sha'], p, errors);
        if (typeof pr.ref !== 'string' || !(REF.test(pr.ref) || isSafeUrl(pr.ref))) {
          errors.push(`${p}.ref: must be owner/repo#n or an https URL`);
        }
        str(pr.title, `${p}.title`, errors);
        oneOf(pr.review, PR_REVIEW_STATES, `${p}.review`, errors);
        time(pr.opened_at, `${p}.opened_at`, errors);
        time(pr.updated_at, `${p}.updated_at`, errors);
        shaOrNull(pr.head_sha, `${p}.head_sha`, errors);
      });
    }
  }

  moment(v.last_commit, ['branch'], `${path}.last_commit`, errors);
  moment(v.last_deploy, ['target'], `${path}.last_deploy`, errors);

  if (v.ci !== null) {
    if (!obj(v.ci)) errors.push(`${path}.ci: must be an object or null`);
    else {
      keys(v.ci, ['state', 'branch', 'run_ref', 'commit_sha', 'observed_at'], `${path}.ci`, errors);
      oneOf(v.ci.state, CI_STATES, `${path}.ci.state`, errors);
      str(v.ci.branch, `${path}.ci.branch`, errors, 120);
      strOrNull(v.ci.run_ref, `${path}.ci.run_ref`, errors);
      shaOrNull(v.ci.commit_sha, `${path}.ci.commit_sha`, errors);
      time(v.ci.observed_at, `${path}.ci.observed_at`, errors);
    }
  }

  const list = (name: string, each: (item: Record<string, unknown>, p: string) => void) => {
    const arr = v[name];
    if (!Array.isArray(arr)) return errors.push(`${path}.${name}: must be an array`);
    arr.forEach((item, i) => {
      const p = `${path}.${name}[${i}]`;
      if (!obj(item)) errors.push(`${p}: must be an object`);
      else each(item, p);
    });
  };
  list('next', (n, p) => {
    keys(n, ['kind', 'text', 'ref'], p, errors);
    oneOf(n.kind, NEXT_KINDS, `${p}.kind`, errors);
    str(n.text, `${p}.text`, errors, 240);
    strOrNull(n.ref, `${p}.ref`, errors);
  });
  list('activity', (a, p) => {
    keys(a, ['at', 'kind', 'text', 'ref'], p, errors);
    time(a.at, `${p}.at`, errors);
    oneOf(a.kind, ACTIVITY_KINDS, `${p}.kind`, errors);
    str(a.text, `${p}.text`, errors, 240);
    strOrNull(a.ref, `${p}.ref`, errors);
  });
  list('links', (l, p) => {
    keys(l, ['kind', 'label', 'url'], p, errors);
    oneOf(l.kind, LINK_KINDS, `${p}.kind`, errors);
    str(l.label, `${p}.label`, errors, 60);
    if (!isSafeUrl(l.url)) errors.push(`${p}.url: must be an https URL`);
  });
  return errors;
}

export function validateInsightsMap(v: unknown): string[] {
  if (!obj(v)) return ['insights map: must be an object'];
  return Object.entries(v).flatMap(([id, ins]) => validateInsights(ins, `insights["${id}"]`));
}
