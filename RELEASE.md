# Release checklist

This package is a private npm development preview. Its public source repository is https://github.com/alencmanis/fasthook-n8n. The initial source commit and push were authorized; npm publication and a release are separate steps. Do not run `npm run release` without release approval: the n8n release tool creates commits and tags and pushes them.

1. Complete real tests with a dedicated FastHook project key and test source. Check polling, no duplicate on the next poll, request/trace reads, and failure after revoking the key. Test delivery retries only on a disposable receiver.
2. The public GitHub repository is created and its URL is in package metadata. Verify the maintainer identity before npm publication.
3. Confirm npm package name availability and maintainer access. Configure trusted publishing through GitHub Actions; do not put tokens in the repository.
4. Remove private:true. Run clean install, build, lint, tests, package scan and npm pack --dry-run. Review the publish manifest.
5. Publish through GitHub Actions with provenance; configure and review the scaffolded publish workflow first.
6. Install the published package in a clean self-hosted n8n instance and repeat the real scenario.
7. Submit at https://creators.n8n.io/ following https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines.md . Approval is a separate milestone; do not claim Cloud availability until approved.

Keep this package focused on FastHook's own request/delivery functions, not a generic proxy for other services.
