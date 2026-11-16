// DEMO FIXTURE — offline sample data for the Projects UI (PS-01, gate G1).
//
// Rules for this file:
// - Every value here is illustrative. The UI shows a DEMO banner whenever it is used.
// - No current production health is claimed for any real project. Real projects use
//   `unknown` deployment unless issue #27 itself records historical evidence.
// - Blockers and refs are copied from issue #27 / PS-00 text where possible; otherwise
//   they are labelled as demo text.
// - Rows whose name starts with "UI sample" are synthetic and exist only to exercise
//   badges that no real project should show from fixture data.

import type { ProjectSnapshot } from './types';

export const DEMO_FIXTURE_LABEL = 'DEMO FIXTURE';

export const demoSnapshot: ProjectSnapshot = {
  version: '1.0',
  generated_at: '2026-11-16T00:30:00Z',
  projects: [
    {
      id: 'pesttrails',
      name: 'PestTrails',
      priority: 'p0',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'owner_report',
      summary:
        "Owner's highest overall priority (per issue #27). Development and deployment status not yet collected; shown as unknown on purpose.",
      repositories: ['brettbaysinger-boop/pest-control-platform'],
      blocked_by: [],
      sources: [
        {
          kind: 'git_issue',
          ref: 'brettbaysinger-boop/pest-control-platform#6',
          observed_at: '2026-11-15T21:00:00Z',
          commit_sha: null,
        },
        {
          kind: 'git_issue',
          ref: 'brettbaysinger-boop/lumen-app#27',
          observed_at: '2026-11-15T21:00:00Z',
        },
      ],
      observed_at: '2026-11-15T21:00:00Z',
    },
    {
      id: 'chorusfall',
      name: 'Chorusfall',
      priority: 'p1',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'owner_report',
      summary: 'First among game projects (per issue #27). No repository linked in this fixture.',
      repositories: [],
      blocked_by: [],
      sources: [
        {
          kind: 'owner_report',
          ref: 'Owner priority correction recorded in issue #27',
          observed_at: '2026-11-15T21:00:00Z',
        },
      ],
      observed_at: '2026-11-15T21:00:00Z',
    },
    {
      id: 'lumen',
      name: 'Raialume / Lumen',
      priority: 'p1',
      state: 'coded',
      deployment: 'historically_verified',
      evidence_level: 'historical',
      summary:
        'Lumen↔RMC02 operational pilot passed on Nov 15 per PR #10 (historical, not a current health check). Gold Master not released.',
      repositories: ['brettbaysinger-boop/lumen-app'],
      blocked_by: ['Full gateway restoration pending; Gold Master not released (issue #27)'],
      sources: [
        {
          kind: 'git_pr',
          ref: 'brettbaysinger-boop/lumen-app#10',
          observed_at: '2026-11-15T21:00:00Z',
        },
        {
          kind: 'git_issue',
          ref: 'brettbaysinger-boop/lumen-app#27',
          observed_at: '2026-11-15T21:00:00Z',
        },
      ],
      observed_at: '2026-11-15T21:00:00Z',
    },
    {
      id: 'project-steward',
      name: 'Project Steward',
      priority: 'p1',
      state: 'planned',
      deployment: 'not_deployed',
      evidence_level: 'git_verified',
      summary:
        'This Projects lane. Gates G0–G5 in PS-00; none passed when this fixture was written. Nothing deployed.',
      repositories: ['brettbaysinger-boop/lumen-app'],
      blocked_by: [
        'G3 needs an owner-authenticated read-only GitHub connection (PS-00)',
        'G5 shared navigation waits on Live Room + Memory Tab reconciliation',
      ],
      sources: [
        {
          kind: 'git_issue',
          ref: 'brettbaysinger-boop/lumen-app#27',
          observed_at: '2026-11-15T21:00:00Z',
        },
        {
          kind: 'git_issue',
          ref: 'brettbaysinger-boop/lumen-app#28',
          observed_at: '2026-11-15T21:00:00Z',
        },
      ],
      observed_at: '2026-11-15T21:00:00Z',
    },
    {
      id: 'brother-memory',
      name: 'Brother Memory',
      priority: 'p1',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'unverified',
      summary: 'Source-backed inventory exists (issue #27 evidence links). Status not collected.',
      repositories: [],
      blocked_by: [],
      sources: [
        {
          kind: 'owner_approved_memory',
          ref: 'bm_chat_20261116_f168d58da497182c',
          observed_at: '2026-11-15T21:00:00Z',
        },
      ],
      observed_at: '2026-11-15T21:00:00Z',
    },
    {
      id: 'bretts-games',
      name: "Brett's Games",
      priority: 'p2',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'unverified',
      summary:
        'Independent project identity even without a standalone repo (PS-00). No status collected.',
      repositories: [],
      blocked_by: [],
      sources: [
        {
          kind: 'other',
          ref: 'docs/project-steward/PS-00-COORDINATION.md',
          observed_at: '2026-11-15T21:00:00Z',
        },
      ],
      observed_at: '2026-11-15T21:00:00Z',
    },
    {
      id: 'forge',
      name: 'Forge',
      priority: 'p2',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'unverified',
      summary: 'Demo row with an old check time, to show the STALE treatment.',
      repositories: [],
      blocked_by: [],
      sources: [
        {
          kind: 'owner_report',
          ref: 'Demo: listed in the issue #27 project registry',
          observed_at: '2026-11-08T12:00:00Z',
        },
      ],
      observed_at: '2026-11-08T12:00:00Z',
    },
    {
      id: 'dreamvault',
      name: 'DreamVault',
      priority: 'p2',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'unverified',
      summary: 'Never checked and no sources cited. Shown as unknown rather than guessed.',
      repositories: [],
      blocked_by: [],
      sources: [],
      observed_at: null,
    },
    {
      id: 'wisdom-of-the-crowd',
      name: 'Wisdom of the Crowd',
      priority: 'p3',
      state: 'unknown',
      deployment: 'unknown',
      evidence_level: 'unverified',
      summary: 'Never checked. Listed in the issue #27 registry.',
      repositories: [],
      blocked_by: [],
      sources: [],
      observed_at: null,
    },
    {
      id: 'ui-sample-verified',
      name: 'UI sample: verified deployment',
      priority: 'p3',
      state: 'owner_accepted',
      deployment: 'verified_current',
      evidence_level: 'host_verified',
      summary:
        'Synthetic row, not a real project. Exists only to show how a host-verified current deployment would look.',
      repositories: [],
      blocked_by: [],
      sources: [
        {
          kind: 'host_receipt',
          ref: 'synthetic-fixture://ui-sample/host-receipt',
          observed_at: '2026-11-16T00:00:00Z',
          commit_sha: 'abc1234',
        },
      ],
      observed_at: '2026-11-16T00:00:00Z',
    },
    {
      id: 'ui-sample-reported',
      name: 'UI sample: reported deployment',
      priority: 'on_hold',
      state: 'on_hold',
      deployment: 'reported',
      evidence_level: 'owner_report',
      summary:
        'Synthetic row, not a real project. Shows a deployment that was only reported, never verified.',
      repositories: [],
      blocked_by: [],
      sources: [
        {
          kind: 'owner_report',
          ref: 'synthetic-fixture://ui-sample/owner-report',
          observed_at: '2026-11-16T00:00:00Z',
        },
      ],
      observed_at: '2026-11-16T00:00:00Z',
    },
  ],
};
