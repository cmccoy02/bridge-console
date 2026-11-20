'use client';

import { useActionState } from 'react';

import { createApiKeyAction, saveSlackWebhook, sendSlackTest, type ActionState } from './actions';

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p role="status" className={`mt-2 text-sm ${state.ok ? 'text-clear' : 'text-failed'}`}>
      {state.message}
    </p>
  );
}

export function SlackForm({ accountId, connected }: { accountId: number; connected: boolean }) {
  const [saveState, save, saving] = useActionState(saveSlackWebhook, {});
  const [testState, test, testing] = useActionState(sendSlackTest, {});

  return (
    <div>
      <form action={save} className="flex max-w-2xl flex-wrap gap-2">
        <input type="hidden" name="accountId" value={accountId} />
        <label htmlFor={`webhook-${accountId}`} className="sr-only">
          Slack incoming webhook URL
        </label>
        <input
          id={`webhook-${accountId}`}
          name="webhookUrl"
          type="url"
          required
          placeholder={connected ? 'Paste a new webhook URL to replace the current one' : 'https://hooks.slack.com/services/…'}
          className="field flex-1"
        />
        <button type="submit" className="button" disabled={saving}>
          {connected ? 'Replace webhook' : 'Connect Slack'}
        </button>
      </form>
      <Feedback state={saveState} />
      {connected ? (
        <form action={test} className="mt-3">
          <input type="hidden" name="accountId" value={accountId} />
          <button type="submit" className="button button-quiet" disabled={testing}>
            Send a test message
          </button>
          <Feedback state={testState} />
        </form>
      ) : null}
    </div>
  );
}

export function CreateKeyForm({ accountId, consoleUrl }: { accountId: number; consoleUrl: string }) {
  const [state, create, creating] = useActionState(createApiKeyAction, {});

  return (
    <div>
      <form action={create} className="flex max-w-xl flex-wrap gap-2">
        <input type="hidden" name="accountId" value={accountId} />
        <label htmlFor={`key-name-${accountId}`} className="sr-only">
          Key name
        </label>
        <input id={`key-name-${accountId}`} name="name" placeholder="Name, for example Connor's laptop" className="field flex-1" />
        <button type="submit" className="button" disabled={creating}>
          Create key
        </button>
      </form>
      {state.key ? (
        <div className="mt-3 max-w-2xl border-l-4 border-signal bg-white px-4 py-3">
          <p className="text-sm">{state.message}</p>
          <pre className="mt-2 overflow-x-auto text-sm">
            <code>{`export BRIDGE_API_URL=${consoleUrl}\nexport BRIDGE_API_TOKEN=${state.key}`}</code>
          </pre>
        </div>
      ) : (
        <Feedback state={state} />
      )}
    </div>
  );
}
