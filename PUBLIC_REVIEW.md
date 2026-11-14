# Public portfolio package review

Prepared locally for user review on 2026-11-13. No files were pushed or published. No private repository or live deployment was modified.

## Source and remote documentation comparison

The application starts from the complete v5 source-only snapshot; no original Git history is included. The public repository was read at commit `271a1a109b22a9913d6e4f3ca8f15667123e4459`. At that revision it contains only `README.md`, `VALIDATION.md` and `package.json`, not the runtime implementation those documents describe.

| File | Relationship to the current public repository |
| --- | --- |
| package.json | Byte-for-byte identical; versions, dependency declarations and scripts unchanged. `private: true` prevents accidental npm publication; it does not make a GitHub repository private. |
| README.md | Based on the public README. Removed the personally identifying live-demo URL; replaced the unverified named Chatflow backup claim with the actual no-export-included scope; documented local SQLite test prerequisite, sanitized hosting configuration, demo data and illustrative artwork. Core capability and fixture limitations preserved. |
| VALIDATION.md | Replaced the earlier private-transfer/authentication report with checks rerun on this sanitized package. Removed personal-token test history, private source identifiers and pending-private-push wording. |

The public repository was not changed. Review this archive before manually uploading any of its contents. Do not treat the README's capability table as evidence of real external model verification.

## Scope and safety review

- Retained Planner, Validator, Executor, Tools, Skills, run tracing, rule scoring, batch evaluation/comparison, APIs, UI and local D1 setup.
- Removed the production Sites project ID from `.openai/hosting.json`; retained only logical `DB` and null R2 bindings. This intentionally removes the original deployment target while preserving local functionality.
- Preserved `package.json`, `pnpm-lock.yaml` and all original application code, tests, migrations and fixture data. Only public-facing documentation, ignore rules and hosting identity were changed; a source-audit utility was added.
- Reviewed source, tests, SQL migrations, fixture JSON, configuration, lockfile and assets. Keys/tokens, email/phone formats, device paths, private project/version/deployment identifiers and private live-site addresses were searched. Blank environment variables and provider documentation are intentional.
- The two orders use “演示用户” and synthetic order IDs. The logistics record uses a `DEMO` tracking number, a city-level transit message and no recipient address or contact information. No production run database or customer conversation export is included. Historical origin cannot be independently proven; classification is based on the supplied fixture content.
- SVGs contain markup only. The PNG social card was visually inspected; its product IDs, price and trace examples are illustrative. Its C2PA provenance records AI generation and public signing-certificate material; these are not private keys or deployment credentials. It contains no visible personal identity, secret or private deployment address. Contact/path checks scan PNG metadata rather than compressed pixel bytes; exact secret and token patterns also scan the full file. This is not steganography analysis.
- No `.git`, real `.env`, `.dev.vars`, installed dependencies, generated build output, local D1 state, logs, private keys or Coze workflow ZIP is included. `.env.example` is the only environment file in the package and contains no actual key.

## File inventory

The deliverables include a machine-readable SHA-256 inventory with each packaged path and size. The archive contains application directories `app/`, `components/`, `lib/agent/`, `lib/eval/`, `db/`, `drizzle/`, `worker/`, `build/`, `scripts/`, `tests/`, `public/`, `examples/`, sanitized `.openai/`, configuration, lockfile, environment template and review documents. `scripts/audit-public.mjs` can repeat the pattern checks and list the reviewed source paths.

## Remaining limitations

Real Coze model generation, OpenAI-compatible calls, external business systems and Coze workflow import were not tested. All customer-service integration checks use the deterministic fixture provider and isolated local D1. No Coze export was available for review, so no workflow ZIP is shipped.

This remains a prototype. Do not expose write APIs or administration screens to untrusted visitors without adding appropriate authentication/authorization, rate limits and operational controls. Platform identity helpers depend on trusted hosting headers. The package is intended for local demonstration, not a security-hardened production service.

Existing reset tests call `/usr/bin/sqlite3`; they were preserved and may need environment setup on other operating systems. Verification was performed on macOS with Node 22.16.0; other operating systems have not been independently tested. Dependency installation requires network access, and fonts may be fetched during build. No dependency vulnerability audit or license-compliance audit is claimed. No project license was added without an explicit owner choice; choose a license before inviting reuse.

Pattern scanning plus manual review cannot prove the absence of every secret or personal identifier. Review the final ZIP and any future additions, particularly model credentials, workflow exports, customer logs and database backups, before publication.
