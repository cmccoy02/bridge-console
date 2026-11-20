export function workflowYaml(consoleUrl: string): string {
  return `name: Bridge
on:
  schedule:
    - cron: '17 13 * * 1-5'
  workflow_dispatch:

jobs:
  bridge:
    uses: cmccoy02/bridge-cli/.github/workflows/bridge.yml@main
    permissions:
      contents: read
      id-token: write
    with:
      api-url: ${consoleUrl}`;
}

export function WorkflowSnippet({ consoleUrl }: { consoleUrl: string }) {
  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-slate">
        Save this as <code>.github/workflows/bridge.yml</code> in the repository. It runs every weekday
        morning and whenever you start it from the Actions tab. No secrets are needed.
      </p>
      <pre className="overflow-x-auto rounded border border-rule bg-white p-4 text-[0.85rem] leading-relaxed">
        <code>{workflowYaml(consoleUrl)}</code>
      </pre>
    </div>
  );
}
