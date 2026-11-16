// Strict runtime validation of a v1 project snapshot.
// Hand-written (no JSON-schema dependency) and kept in step with
// contracts/project-steward/project-snapshot.v1.schema.json. Any violation rejects
// the whole snapshot: the UI shows an "invalid source" state instead of partial data.

import {
  DEPLOYMENT_STATES,
  DEV_STATES,
  EVIDENCE_LEVELS,
  PRIORITIES,
  SOURCE_KINDS,
  type ProjectSnapshot,
} from './types';
import { validateInsights, type InsightsMap, type ProjectInsights } from './insights';
import { isDateTime } from './text';

export { isDateTime };

export type ValidationResult =
  | {
      ok: true;
      snapshot: ProjectSnapshot;
      /** null for v1.0 (contract has no insights). For v1.1: per-project, may be sparse. */
      insights: InsightsMap | null;
      /** v1.1 `stale_after_seconds` in ms, or null when the server did not say. */
      staleAfterMs: number | null;
    }
  | { ok: false; errors: string[] };

// 1 hour .. 30 days.
const STALE_MIN_S = 3600;
const STALE_MAX_S = 2_592_000;
const PROJECT_ID = /^[a-z0-9-]{2,64}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT_SHA = /^[a-f0-9]{7,40}$/;

const SNAPSHOT_KEYS = ['version', 'generated_at', 'projects'];
const PROJECT_REQUIRED = [
  'id',
  'name',
  'priority',
  'state',
  'deployment',
  'evidence_level',
  'repositories',
  'sources',
  'blocked_by',
  'observed_at',
];
const PROJECT_KEYS = [...PROJECT_REQUIRED, 'summary'];
const SOURCE_REQUIRED = ['kind', 'ref', 'observed_at'];
const SOURCE_KEYS = [...SOURCE_REQUIRED, 'commit_sha'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkKeys(
  obj: Record<string, unknown>,
  required: string[],
  allowed: string[],
  path: string,
  errors: string[],
) {
  for (const k of required) {
    if (!(k in obj)) errors.push(`${path}: missing required "${k}"`);
  }
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${path}: unexpected property "${k}"`);
  }
}

function checkEnum(
  v: unknown,
  values: readonly string[],
  path: string,
  errors: string[],
) {
  if (typeof v !== 'string' || !values.includes(v)) {
    errors.push(`${path}: must be one of ${values.join(', ')}`);
  }
}

function checkString(
  v: unknown,
  path: string,
  errors: string[],
  opts: { min?: number; max?: number; pattern?: RegExp } = {},
) {
  if (typeof v !== 'string') {
    errors.push(`${path}: must be a string`);
    return;
  }
  // JSON-schema lengths count code points, not UTF-16 units.
  const len = Array.from(v).length;
  if (opts.min !== undefined && len < opts.min) errors.push(`${path}: too short`);
  if (opts.max !== undefined && len > opts.max) errors.push(`${path}: too long`);
  if (opts.pattern && !opts.pattern.test(v)) errors.push(`${path}: invalid format`);
}

function validateSource(v: unknown, path: string, errors: string[]) {
  if (!isObject(v)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  checkKeys(v, SOURCE_REQUIRED, SOURCE_KEYS, path, errors);
  if ('kind' in v) checkEnum(v.kind, SOURCE_KINDS, `${path}.kind`, errors);
  if ('ref' in v) checkString(v.ref, `${path}.ref`, errors, { min: 1, max: 512 });
  if ('observed_at' in v && !isDateTime(v.observed_at)) {
    errors.push(`${path}.observed_at: must be an RFC 3339 date-time`);
  }
  if ('commit_sha' in v && v.commit_sha !== null) {
    checkString(v.commit_sha, `${path}.commit_sha`, errors, { pattern: COMMIT_SHA });
  }
}

function validateProject(v: unknown, path: string, errors: string[], v11: boolean) {
  if (!isObject(v)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  checkKeys(v, PROJECT_REQUIRED, v11 ? [...PROJECT_KEYS, 'insights'] : PROJECT_KEYS, path, errors);
  if (v11 && 'insights' in v) errors.push(...validateInsights(v.insights, `${path}.insights`));
  if ('id' in v) checkString(v.id, `${path}.id`, errors, { pattern: PROJECT_ID });
  if ('name' in v) checkString(v.name, `${path}.name`, errors, { min: 1, max: 100 });
  if ('priority' in v) checkEnum(v.priority, PRIORITIES, `${path}.priority`, errors);
  if ('state' in v) checkEnum(v.state, DEV_STATES, `${path}.state`, errors);
  if ('deployment' in v) {
    checkEnum(v.deployment, DEPLOYMENT_STATES, `${path}.deployment`, errors);
  }
  if ('evidence_level' in v) {
    checkEnum(v.evidence_level, EVIDENCE_LEVELS, `${path}.evidence_level`, errors);
  }
  if ('summary' in v) checkString(v.summary, `${path}.summary`, errors, { max: 1000 });

  if ('repositories' in v) {
    if (!Array.isArray(v.repositories)) {
      errors.push(`${path}.repositories: must be an array`);
    } else {
      v.repositories.forEach((r, i) =>
        checkString(r, `${path}.repositories[${i}]`, errors, { pattern: REPO }),
      );
      if (new Set(v.repositories).size !== v.repositories.length) {
        errors.push(`${path}.repositories: items must be unique`);
      }
    }
  }
  if ('blocked_by' in v) {
    if (!Array.isArray(v.blocked_by)) {
      errors.push(`${path}.blocked_by: must be an array`);
    } else {
      v.blocked_by.forEach((b, i) =>
        checkString(b, `${path}.blocked_by[${i}]`, errors, { max: 240 }),
      );
    }
  }
  if ('sources' in v) {
    if (!Array.isArray(v.sources)) {
      errors.push(`${path}.sources: must be an array`);
    } else {
      v.sources.forEach((s, i) => validateSource(s, `${path}.sources[${i}]`, errors));
    }
  }
  if ('observed_at' in v && v.observed_at !== null && !isDateTime(v.observed_at)) {
    errors.push(`${path}.observed_at: must be an RFC 3339 date-time or null`);
  }
}

export function validateSnapshot(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ['snapshot: must be a JSON object'] };
  }
  const v11 = input.version === '1.1';
  checkKeys(
    input,
    SNAPSHOT_KEYS,
    v11 ? [...SNAPSHOT_KEYS, 'stale_after_seconds'] : SNAPSHOT_KEYS,
    'snapshot',
    errors,
  );
  if ('version' in input && input.version !== '1.0' && !v11) {
    errors.push('snapshot.version: must be "1.0" or "1.1"');
  }
  let staleAfterMs: number | null = null;
  if (v11 && 'stale_after_seconds' in input) {
    const s = input.stale_after_seconds;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < STALE_MIN_S || s > STALE_MAX_S) {
      errors.push(`snapshot.stale_after_seconds: must be an integer ${STALE_MIN_S}..${STALE_MAX_S}`);
    } else {
      staleAfterMs = s * 1000;
    }
  }
  if ('generated_at' in input && !isDateTime(input.generated_at)) {
    errors.push('snapshot.generated_at: must be an RFC 3339 date-time');
  }
  if ('projects' in input) {
    if (!Array.isArray(input.projects)) {
      errors.push('snapshot.projects: must be an array');
    } else {
      input.projects.forEach((p, i) => validateProject(p, `projects[${i}]`, errors, v11));
      // Not required by the schema, but duplicate ids would break detail routing.
      const ids = input.projects
        .filter(isObject)
        .map((p) => p.id)
        .filter((id) => typeof id === 'string');
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      for (const id of new Set(dupes)) {
        errors.push(`projects: duplicate id "${String(id)}"`);
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  if (!v11) {
    return { ok: true, snapshot: input as unknown as ProjectSnapshot, insights: null, staleAfterMs };
  }
  // Split v1.1 into the v1-shaped project list plus a per-project insights map.
  const insights: InsightsMap = {};
  const projects = (input.projects as Record<string, unknown>[]).map((p) => {
    const { insights: ins, ...rest } = p;
    if (ins !== undefined) insights[rest.id as string] = ins as ProjectInsights;
    return rest;
  });
  return {
    ok: true,
    snapshot: { ...input, projects } as unknown as ProjectSnapshot,
    insights,
    staleAfterMs,
  };
}
