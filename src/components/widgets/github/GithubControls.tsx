import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  githubConnect,
  githubCancel,
  githubDisconnect,
  githubOpen,
} from '../../../features/integrations/github';
import type { useGithub } from '../../../hooks/useGithub';

export type GithubController = ReturnType<typeof useGithub>;
export function GithubAccountMenu({ github }: { github: GithubController }) {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { state, run } = github;
  return (
    <div
      className="github-account"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="GitHub account menu"
        aria-expanded={menu}
        aria-controls="github-account-actions"
        onClick={() => setMenu(!menu)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setMenu(false);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu && (
        <div
          id="github-account-actions"
          className="github-menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setMenu(false);
              trigger.current?.focus();
            }
          }}
        >
          <button
            type="button"
            disabled={!state.configured}
            onClick={() => {
              setMenu(false);
              void run(() => githubOpen('authorization'));
            }}
          >
            Manage GitHub authorization
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              void run(githubDisconnect);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
export function GithubScopeNotice() {
  return (
    <p className="github-scope-notice">
      GitHub's repo grant includes write access. Aura only reads Activity and
      Work; it cannot submit reviews, merge, edit issues or rerun workflows.
    </p>
  );
}
export function GithubAuthorization({
  github,
  upgrade = false,
}: {
  github: GithubController;
  upgrade?: boolean;
}) {
  const { state, run } = github;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const code = state.authorization?.userCode;
  const connecting =
    state.status === 'requesting' || state.status === 'authorizing';
  return (
    <div className="github-onboarding">
      {connecting ? (
        <>
          <p>
            {code
              ? 'Enter this code on GitHub'
              : 'Requesting a GitHub verification code...'}
          </p>
          {code && <strong className="github-code">{code}</strong>}
          <div className="github-connect-actions">
            {code && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(code);
                      setCopied(true);
                    })
                  }
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => void run(() => githubOpen('verification'))}
                >
                  Open GitHub
                </button>
              </>
            )}
            <button type="button" onClick={() => void run(githubCancel)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="github-connect-button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void run(githubConnect).finally(() => setBusy(false));
            }}
          >
            {upgrade
              ? 'Update GitHub permissions'
              : state.status === 'reconnectRequired'
                ? 'Reconnect GitHub'
                : 'Connect GitHub'}
          </button>
          <GithubScopeNotice />
        </>
      )}
    </div>
  );
}
