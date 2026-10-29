# Release checklist

Public source repository: https://github.com/alencmanis/fasthook-n8n. The maintainer explicitly authorized direct npm publication of 0.1.0 because GitHub Actions is blocked by an account billing issue. This release has no provenance and is not eligible for n8n Cloud verification. A later version must be published through GitHub Actions with provenance before applying for verification.

For this authorized local release, `npm publish --access public` runs lint, build and tests through `prepublishOnly`. Never skip those checks. `npm run release` is a separate n8n CLI flow that also creates commits and tags and pushes them.

1. Complete real tests with a dedicated FastHook project key and test source. Check polling, no duplicate on the next poll, request/trace reads, and failure after revoking the key. Test delivery retries only on a disposable receiver.
2. The public GitHub repository is created and its URL is in package metadata. Verify the maintainer identity before npm publication.
3. Confirm npm package name availability and maintainer access. Do not put tokens in the repository. Configure trusted publishing through GitHub Actions for a future verified release.
4. Run build, lint, tests, package scan and npm pack --dry-run. Review the publish manifest. The publish lifecycle enforces lint, build and tests again at actual publication.
5. Publish using the authorized release path. For future Cloud verification, configure and review the scaffolded workflow and publish a new version through GitHub Actions with provenance.
6. Install the published package in a clean self-hosted n8n instance and repeat the real scenario.
7. Submit at https://creators.n8n.io/ following https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md . Approval is a separate milestone; do not claim Cloud availability until approved.

Keep this package focused on FastHook's own request/delivery functions, not a generic proxy for other services.
