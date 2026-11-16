// DEMO FIXTURE — insights for the offline sample (see insights.ts for the shape).
//
// Raialume/Lumen and Project Steward rows are a dated copy of public GitHub metadata for
// brettbaysinger-boop/lumen-app read on 2026-11-16 02:03 UTC (open PRs, newest commit on
// main, and "no CI runs on main"). They are a frozen sample, not a live reading, and
// the UI labels them DEMO. No deployment is recorded for any real project.
// Projects without an entry here show "not collected". "UI sample" rows are synthetic.

import type { InsightsMap } from './insights';

export const demoInsights: InsightsMap = {
  pesttrails: {
    observed_at: '2026-11-15T21:00:00Z',
    open_prs: null,
    last_commit: null,
    last_deploy: null,
    ci: null,
    next: [],
    activity: [],
    links: [
      {
        kind: 'repo',
        label: 'Repository',
        url: 'https://github.com/brettbaysinger-boop/pest-control-platform',
      },
      {
        kind: 'issues',
        label: 'Issue #6',
        url: 'https://github.com/brettbaysinger-boop/pest-control-platform/issues/6',
      },
    ],
  },
  lumen: {
    observed_at: '2026-11-16T02:03:10Z',
    open_prs: {
      observed_at: '2026-11-16T02:03:10Z',
      items: [
        {
          ref: 'brettbaysinger-boop/lumen-app#36',
          title:
            'Live Room: turning the phone shows Theater by itself (guarded native rotation)',
          review: 'draft',
          opened_at: '2026-11-16T01:49:43Z',
          updated_at: '2026-11-16T01:49:45Z',
          head_sha: '1f19b5e',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#35',
          title: 'RMC Memories tab — LIVE PASS (D01-62S), UI review pending',
          review: 'draft',
          opened_at: '2026-11-16T01:33:16Z',
          updated_at: '2026-11-16T01:46:10Z',
          head_sha: 'ca45253',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#26',
          title:
            'Live Room: Video Chat + Companion Theater in the in-app view (Option C)',
          review: 'draft',
          opened_at: '2026-11-16T01:19:19Z',
          updated_at: '2026-11-16T02:02:04Z',
          head_sha: 'd0bea7d',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#25',
          title:
            'SUPERSEDED — RMC Memories panel (older Lumen baseline; use #35)',
          review: 'draft',
          opened_at: '2026-11-16T01:13:23Z',
          updated_at: '2026-11-16T01:36:10Z',
          head_sha: 'd7185a9',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#24',
          title:
            'design: Live Room — Video Chat + Companion Theater (GOLD V2 preserved)',
          review: 'draft',
          opened_at: '2026-11-16T00:55:54Z',
          updated_at: '2026-11-16T00:55:54Z',
          head_sha: 'e33278a',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#22',
          title:
            'docs: Raialume/Lumen working baseline and unfinished backlog — Nov 15',
          review: 'draft',
          opened_at: '2026-11-15T23:36:59Z',
          updated_at: '2026-11-15T23:36:59Z',
          head_sha: '7a85c8c',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#20',
          title:
            'Android: Live video inside the app (guarded, probed) and phone layout',
          review: 'draft',
          opened_at: '2026-11-15T23:28:28Z',
          updated_at: '2026-11-15T23:44:38Z',
          head_sha: '67e8613',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#18',
          title:
            'Animated Companion: scene selector (Original + Midnight Sanctuary, unavailable until ready)',
          review: 'draft',
          opened_at: '2026-11-15T14:52:36Z',
          updated_at: '2026-11-15T23:07:42Z',
          head_sha: '5c9ecfa',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#17',
          title:
            'Android refresh: Live video from the phone, safe APK update and rollback',
          review: 'draft',
          opened_at: '2026-11-15T14:48:59Z',
          updated_at: '2026-11-15T23:28:31Z',
          head_sha: '1113817',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#14',
          title: 'Animated Companion: Wide Theater (uncropped 3:2)',
          review: 'draft',
          opened_at: '2026-11-15T03:56:14Z',
          updated_at: '2026-11-15T04:18:11Z',
          head_sha: 'f23d112',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#12',
          title: 'Animated Companion: Compact, Large and Theater display sizes',
          review: 'draft',
          opened_at: '2026-11-15T03:13:09Z',
          updated_at: '2026-11-15T03:13:09Z',
          head_sha: '9882fb4',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#11',
          title: 'Optional Animated Companion mode (development preview)',
          review: 'draft',
          opened_at: '2026-11-14T18:13:39Z',
          updated_at: '2026-11-15T01:13:20Z',
          head_sha: '4bcd114',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#10',
          title: 'RMC adapter for Lumen — D01 pilot PASS; release still draft',
          review: 'draft',
          opened_at: '2026-11-02T08:28:57Z',
          updated_at: '2026-11-16T00:54:46Z',
          head_sha: '71c519e',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#5',
          title:
            'fix(memory): total extraction budget and evidence-gated auto-save (corrective, draft)',
          review: 'draft',
          opened_at: '2026-10-25T23:25:31Z',
          updated_at: '2026-10-25T23:55:27Z',
          head_sha: '63c1eb0',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#3',
          title:
            'fix(memory): fail-closed observation preflight and whole-batch validation',
          review: 'draft',
          opened_at: '2026-10-24T23:24:31Z',
          updated_at: '2026-10-25T22:44:13Z',
          head_sha: 'c3c88d7',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#2',
          title:
            'docs: reconcile five-node AI stack and Oct 13 recovery status',
          review: 'draft',
          opened_at: '2026-10-13T16:15:27Z',
          updated_at: '2026-10-13T16:15:28Z',
          head_sha: '9dc8f4e',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#1',
          title: 'Feat/lumen UI refresh',
          review: 'review_required',
          opened_at: '2026-10-05T00:22:33Z',
          updated_at: '2026-10-05T00:22:33Z',
          head_sha: '33b8133',
        },
      ],
    },
    last_commit: {
      at: '2026-10-03T08:26:19Z',
      ref: null,
      commit_sha: '38cc92a',
      branch: 'main',
      observed_at: '2026-11-16T02:03:10Z',
    },
    last_deploy: null,
    ci: {
      state: 'none',
      branch: 'main',
      run_ref: null,
      commit_sha: '38cc92a',
      observed_at: '2026-11-16T02:03:10Z',
    },
    next: [
      {
        kind: 'milestone',
        text: 'Gold Master release. Full gateway restoration is still pending.',
        ref: 'brettbaysinger-boop/lumen-app#27',
      },
    ],
    activity: [
      {
        at: '2026-11-16T02:02:04Z',
        kind: 'pr',
        text: 'PR #26 updated: Live Room: Video Chat + Companion Theater in the in-app view (Option C)',
        ref: 'brettbaysinger-boop/lumen-app#26',
      },
      {
        at: '2026-11-16T01:49:45Z',
        kind: 'pr',
        text: 'PR #36 updated: Live Room: turning the phone shows Theater by itself (guarded native rotation)',
        ref: 'brettbaysinger-boop/lumen-app#36',
      },
      {
        at: '2026-11-16T01:46:10Z',
        kind: 'pr',
        text: 'PR #35 updated: RMC Memories tab — LIVE PASS (D01-62S), UI review pending',
        ref: 'brettbaysinger-boop/lumen-app#35',
      },
      {
        at: '2026-11-16T01:36:10Z',
        kind: 'pr',
        text: 'PR #25 updated: SUPERSEDED — RMC Memories panel (older Lumen baseline; use #35)',
        ref: 'brettbaysinger-boop/lumen-app#25',
      },
      {
        at: '2026-11-16T00:55:54Z',
        kind: 'pr',
        text: 'PR #24 updated: design: Live Room — Video Chat + Companion Theater (GOLD V2 preserved)',
        ref: 'brettbaysinger-boop/lumen-app#24',
      },
      {
        at: '2026-11-16T00:54:46Z',
        kind: 'pr',
        text: 'PR #10 updated: RMC adapter for Lumen — D01 pilot PASS; release still draft',
        ref: 'brettbaysinger-boop/lumen-app#10',
      },
      {
        at: '2026-11-15T23:44:38Z',
        kind: 'pr',
        text: 'PR #20 updated: Android: Live video inside the app (guarded, probed) and phone layout',
        ref: 'brettbaysinger-boop/lumen-app#20',
      },
      {
        at: '2026-11-15T23:36:59Z',
        kind: 'pr',
        text: 'PR #22 updated: docs: Raialume/Lumen working baseline and unfinished backlog — Nov 15',
        ref: 'brettbaysinger-boop/lumen-app#22',
      },
    ],
    links: [
      {
        kind: 'repo',
        label: 'Repository',
        url: 'https://github.com/brettbaysinger-boop/lumen-app',
      },
      {
        kind: 'issues',
        label: 'Issues',
        url: 'https://github.com/brettbaysinger-boop/lumen-app/issues',
      },
    ],
  },
  'project-steward': {
    observed_at: '2026-11-16T02:03:10Z',
    open_prs: {
      observed_at: '2026-11-16T02:03:10Z',
      items: [
        {
          ref: 'brettbaysinger-boop/lumen-app#34',
          title:
            'PS-03 [Muse] DRAFT — Independent security audit lane (assignment only)',
          review: 'draft',
          opened_at: '2026-11-16T01:27:44Z',
          updated_at: '2026-11-16T01:59:50Z',
          head_sha: '2072686',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#33',
          title:
            'PS-02 [Gemini] DRAFT — Read-only project registry + hardened GitHub evidence collector',
          review: 'draft',
          opened_at: '2026-11-16T01:27:42Z',
          updated_at: '2026-11-16T01:45:40Z',
          head_sha: '1b0709f',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#32',
          title:
            'PS-01 [Claude] DRAFT — standalone Projects UI (demo-fixture preview, G1 candidate)',
          review: 'draft',
          opened_at: '2026-11-16T01:27:40Z',
          updated_at: '2026-11-16T01:51:56Z',
          head_sha: 'a1ca13b',
        },
        {
          ref: 'brettbaysinger-boop/lumen-app#31',
          title:
            'PS-00 [DRAFT] Project Steward approved scope + data contract (no implementation)',
          review: 'draft',
          opened_at: '2026-11-16T01:26:05Z',
          updated_at: '2026-11-16T01:26:05Z',
          head_sha: '4310036',
        },
      ],
    },
    last_commit: null,
    last_deploy: null,
    ci: {
      state: 'none',
      branch: 'main',
      run_ref: null,
      commit_sha: '38cc92a',
      observed_at: '2026-11-16T02:03:10Z',
    },
    next: [
      {
        kind: 'owner_decision',
        text: 'Authorize an owner preview of the Projects UI (gate G4).',
        ref: 'brettbaysinger-boop/lumen-app#28',
      },
      {
        kind: 'milestone',
        text: 'G1: offline fixture UI works.',
        ref: 'brettbaysinger-boop/lumen-app#27',
      },
    ],
    activity: [
      {
        at: '2026-11-16T01:59:50Z',
        kind: 'pr',
        text: 'PR #34 updated: PS-03 [Muse] DRAFT — Independent security audit lane (assignment only)',
        ref: 'brettbaysinger-boop/lumen-app#34',
      },
      {
        at: '2026-11-16T01:51:56Z',
        kind: 'pr',
        text: 'PR #32 updated: PS-01 [Claude] DRAFT — standalone Projects UI (demo-fixture preview, G1 candidate)',
        ref: 'brettbaysinger-boop/lumen-app#32',
      },
      {
        at: '2026-11-16T01:45:40Z',
        kind: 'pr',
        text: 'PR #33 updated: PS-02 [Gemini] DRAFT — Read-only project registry + hardened GitHub evidence collector',
        ref: 'brettbaysinger-boop/lumen-app#33',
      },
      {
        at: '2026-11-16T01:26:05Z',
        kind: 'pr',
        text: 'PR #31 updated: PS-00 [DRAFT] Project Steward approved scope + data contract (no implementation)',
        ref: 'brettbaysinger-boop/lumen-app#31',
      },
    ],
    links: [
      {
        kind: 'repo',
        label: 'Repository',
        url: 'https://github.com/brettbaysinger-boop/lumen-app',
      },
      {
        kind: 'issues',
        label: 'Tracking issue',
        url: 'https://github.com/brettbaysinger-boop/lumen-app/issues/27',
      },
      {
        kind: 'docs',
        label: 'Scope rules',
        url: 'https://github.com/brettbaysinger-boop/lumen-app/blob/feat/project-steward-coordination-20261115/docs/project-steward/PS-00-COORDINATION.md',
      },
    ],
  },
  'ui-sample-verified': {
    observed_at: '2026-11-16T00:00:00Z',
    open_prs: {
      observed_at: '2026-11-16T00:00:00Z',
      items: [],
    },
    last_commit: {
      at: '2026-11-15T22:00:00Z',
      ref: null,
      commit_sha: 'abc1234',
      branch: 'main',
      observed_at: '2026-11-16T00:00:00Z',
    },
    last_deploy: {
      at: '2026-11-15T23:00:00Z',
      ref: 'synthetic-fixture://ui-sample/host-receipt',
      commit_sha: 'abc1234',
      target: 'synthetic host',
      observed_at: '2026-11-16T00:00:00Z',
    },
    ci: {
      state: 'passing',
      branch: 'main',
      run_ref: null,
      commit_sha: 'abc1234',
      observed_at: '2026-11-16T00:00:00Z',
    },
    next: [],
    activity: [
      {
        at: '2026-11-15T23:00:00Z',
        kind: 'deploy',
        text: 'Synthetic: deployment verified on host.',
        ref: null,
      },
      {
        at: '2026-11-15T22:00:00Z',
        kind: 'commit',
        text: 'Synthetic: commit abc1234 on main.',
        ref: null,
      },
    ],
    links: [
      {
        kind: 'live',
        label: 'Live site (synthetic)',
        url: 'https://example.com/',
      },
    ],
  },
  'ui-sample-reported': {
    observed_at: '2026-11-16T00:00:00Z',
    open_prs: {
      observed_at: '2026-11-16T00:00:00Z',
      items: [
        {
          ref: 'example/repo#1',
          title: 'Synthetic: PR with changes requested',
          review: 'changes_requested',
          opened_at: '2026-11-12T00:00:00Z',
          updated_at: '2026-11-14T00:00:00Z',
          head_sha: 'abc1234',
        },
      ],
    },
    last_commit: null,
    last_deploy: null,
    ci: {
      state: 'failing',
      branch: 'main',
      run_ref: null,
      commit_sha: 'abc1234',
      observed_at: '2026-11-16T00:00:00Z',
    },
    next: [],
    activity: [],
    links: [],
  },
};
