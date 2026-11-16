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

export type ValidationResult =
  | { ok: true; snapshot: ProjectSnapshot }
  | { ok: false; errors: string[] };

// RFC 3339 date-time (JSON-schema "format": "date-time"), with mandatory offset.
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
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

export function isDateTime(v: unknown): v is string {
  return typeof v === 'string' && DATE_TIME.test(v) && !Number.isNaN(Date.parse(v));
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

function validateProject(v: unknown, path: string, errors: string[]) {
  if (!isObject(v)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  checkKeys(v, PROJECT_REQUIRED, PROJECT_KEYS, path, errors);
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
  checkKeys(input, SNAPSHOT_KEYS, SNAPSHOT_KEYS, 'snapshot', errors);
  if ('version' in input && input.version !== '1.0') {
    errors.push('snapshot.version: must be "1.0"');
  }
  if ('generated_at' in input && !isDateTime(input.generated_at)) {
    errors.push('snapshot.generated_at: must be an RFC 3339 date-time');
  }
  if ('projects' in input) {
    if (!Array.isArray(input.projects)) {
      errors.push('snapshot.projects: must be an array');
    } else {
      input.projects.forEach((p, i) => validateProject(p, `projects[${i}]`, errors));
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
  return { ok: true, snapshot: input as unknown as ProjectSnapshot };
}
