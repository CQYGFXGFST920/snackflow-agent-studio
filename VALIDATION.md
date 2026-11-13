# Validation record — 2026-11-13

Base: Sites v5 source revision `e84113a5b8a889dc15dfaff7b244f1b5c2167ae7`.
Application code, dependencies, lockfile, assets and deployment configuration preserved. Documentation and ignore rules updated in an isolated copy. No production deployment or production database writes performed.

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| Existing unit tests | 26 passed |
| Existing route/source checks | 4 passed (these are not browser rendering tests) |
| vinext production build | Passed |
| Local homepage | HTTP 200 |
| Local API integration suite | Passed using deterministic fixture provider and isolated local D1 |
| Recommendation, price and fraud evaluation cases | 3 passed, 0 failed/review/error |
| Evaluation CRUD, annotations, handoff, skill snapshots | Passed |
| Missing provider configuration behavior | Passed |
| New token: domestic Coze workspace API | HTTP 200, code 0 |
| New token: international Coze workspace API | HTTP 401, code 4100 |
| Live Coze model/customer service generation | Not verified: Coding integration endpoints and model were not provided |
| Staged source credential scan | 116 files scanned before adding this report; no exact new-token or common credential-pattern matches |
| Real environment file | Ignored; not staged or packaged |
| GitHub HTTPS access | No available credentials |
| GitHub SSH access | Permission denied (publickey) |
| GitHub push | Pending authorization; remote contents/privacy not yet verified |

The new token is stored only in the ignored local `.env` under the existing server-side `COZE_WORKLOAD_IDENTITY_API_KEY` name. No hardcoded old key was found in this v5 source snapshot. This storage does not establish compatibility between a Coze Open Platform PAT and the existing Coze Coding SDK. The provider remains in fixture mode until matching Coding credentials/endpoints/model can be verified.

No native Coze workflow export exists in the v5 snapshot. No claim of workflow re-importability is made. Production database records and historical credentials are not part of this source transfer.

The credential scan checks the exact supplied token and common PAT, GitHub token, API key, bearer and private-key formats. It is not a guarantee against every possible secret format. Original Git history is not packaged; the import starts from a source-only snapshot.
