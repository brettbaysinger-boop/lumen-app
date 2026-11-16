// Types mirroring contracts/project-steward/project-snapshot.v1.schema.json.
// Keep these in lockstep with the schema; validate.ts enforces them at runtime.
// This module must stay free of React Native imports so it can be unit tested in Node.

export const SOURCE_KINDS = [
  'git_repo',
  'git_pr',
  'git_issue',
  'owner_approved_memory',
  'host_receipt',
  'owner_report',
  'other',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const PRIORITIES = ['p0', 'p1', 'p2', 'p3', 'on_hold', 'unranked'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Development stage. Never implies anything about deployment. */
export const DEV_STATES = [
  'planned',
  'coded',
  'tested',
  'owner_accepted',
  'blocked',
  'on_hold',
  'unknown',
] as const;
export type DevState = (typeof DEV_STATES)[number];

/** Deployment evidence. Independent of development stage. */
export const DEPLOYMENT_STATES = [
  'verified_current',
  'historically_verified',
  'reported',
  'not_deployed',
  'unknown',
] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

export const EVIDENCE_LEVELS = [
  'host_verified',
  'git_verified',
  'owner_report',
  'historical',
  'unverified',
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export interface Source {
  kind: SourceKind;
  ref: string;
  observed_at: string;
  commit_sha?: string | null;
}

export interface Project {
  id: string;
  name: string;
  priority: Priority;
  state: DevState;
  deployment: DeploymentState;
  evidence_level: EvidenceLevel;
  summary?: string;
  repositories: string[];
  blocked_by: string[];
  sources: Source[];
  observed_at: string | null;
}

export interface ProjectSnapshot {
  version: '1.0';
  generated_at: string;
  projects: Project[];
}

/**
 * Where the data on screen came from. This lives OUTSIDE the snapshot because the
 * v1 schema forbids extra properties; the UI must always show it.
 */
export type DataOrigin = 'demo-fixture' | 'live-api';
