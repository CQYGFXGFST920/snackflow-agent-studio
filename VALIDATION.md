# Public-package validation — 2026-11-13

These checks were rerun on the sanitized public portfolio source, not copied from the previous private-transfer report. Environment: macOS arm64, Node.js 22.16.0, pnpm 11.9.0. No real credentials or production database were loaded into the public application.

| Check | Actual result |
| --- | --- |
| Independent dependency installation | Passed: pnpm 11.9.0 `install --frozen-lockfile`, fresh local store, 544 installed packages; lockfile unchanged |
| TypeScript | Passed: `./node_modules/.bin/tsc --noEmit`, exit 0 |
| Existing unit tests | Passed: `node --experimental-strip-types --test tests/*.unit.test.mjs`, 26 passed, 0 failed |
| Existing route/source checks | Passed: `node --test tests/rendered-html.test.mjs`, 4 passed, 0 failed; these are not browser rendering tests |
| Production build | Passed: `./node_modules/.bin/vinext build`, exit 0 |
| Local development server | Passed: started with fresh local D1 state and no real `.env` |
| Local homepage | HTTP 200 |
| API integration | Passed: `SNACKOPS_BASE_URL=http://127.0.0.1:3107 node tests/api.integration.mjs` |
| Batch evaluation | Recommendation, price and fraud cases: 3 passed, 0 failed, 0 review, 0 error |
| API behaviors | Case CRUD, batch IDs/counts, handoff without business tools, invalid simulation rejection, annotation validation, missing-provider handling and skill snapshots passed |
| Sensitive-content review | No unresolved matches in reviewed package; final file-level SHA-256 inventory supplied separately |
| package.json vs public repository | Byte-identical at the reviewed remote revision |
| Original runtime source/tests/assets/lockfile | Preserved byte-for-byte; private hosting target removed separately |
| Live Coze / OpenAI-compatible generation | NOT TESTED; no claim of successful real model integration |
| Coze workflow ZIP / import | NOT INCLUDED / NOT TESTED |
| Browser visual/interaction E2E, other operating systems | NOT TESTED |
| Dependency vulnerabilities and license compliance | NOT AUDITED |
| Deployment or GitHub push | NOT PERFORMED |

Initial dependency installation encountered a non-writable user cache and a Cloudflare binary download error. A fresh project-local cache/temp/store retry completed successfully without modifying dependencies or the lockfile. The final build emitted experimental Node glob and vinext route-classification notices; these were warnings, not failed checks. Failed required checks remaining: none in the local scope above; untested items are explicitly listed.

Only fixture-mode business functionality was exercised. Missing real-provider settings are expected and were tested as an error path, not counted as a successful model request. The public package contains only a blank credential template; previously supplied secrets remain outside this package.

The privacy review covers source, tests, demo JSON, SQL, configuration, lockfile, SVG and PNG assets. Automated checks include common key/token/private-key formats, the previously supplied exact token (loaded only by the external review process), email/phone patterns, local user-directory paths, private project identifiers and private site domains. Manual review classified sample orders/logistics as fixtures and inspected the social card plus its PNG metadata. Generic schema keys, environment-variable names, local loopback URLs, provider URLs, dependency hashes and the all-zero local D1 placeholder are intentional public configuration, not deployment secrets.

See [PUBLIC_REVIEW.md](PUBLIC_REVIEW.md) for remote-document differences and remaining risks. This report is scoped local evidence, not a production reliability or security certification.
