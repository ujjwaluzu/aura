import { useState, type ReactNode } from 'react';
import privacy from '../../../PRIVACY.md?raw';
import terms from '../../../MUSIC_TERMS.md?raw';
import policy from '../../../src-tauri/music-policy.json';
import { openMusicPolicy } from '../../features/integrations/music';
import { DialogPanel } from '../ui/DialogPanel';

type Props = {
  connecting: boolean;
  onClose: () => void;
  onAccept: () => void;
  onError: (error: unknown) => void;
};

function linkedText(text: string, onError: Props['onError']): ReactNode[] {
  const result: ReactNode[] = [];
  let position = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    result.push(text.slice(position, match.index));
    const target = (
      Object.keys(policy.links) as (keyof typeof policy.links)[]
    ).find((key) => policy.links[key] === match[2]);
    result.push(
      target ? (
        <button
          key={match.index}
          type="button"
          className="music-policy-link"
          onClick={() => void openMusicPolicy(target).catch(onError)}
        >
          {match[1]}
        </button>
      ) : (
        match[1]
      ),
    );
    position = match.index + match[0].length;
  }
  result.push(text.slice(position));
  return result;
}

// These two bundled documents use only headings, paragraphs and link lists.
// Render that subset as React text, with fixed native link destinations.
function PolicyDocument({
  text,
  onError,
}: {
  text: string;
  onError: Props['onError'];
}) {
  return text
    .replace(/\r/g, '')
    .trim()
    .split(/\n\n+/)
    .map((block, index) => {
      if (block.startsWith('#'))
        return <h3 key={index}>{block.replace(/^#+\s*/, '')}</h3>;
      if (block.startsWith('- '))
        return (
          <ul key={index}>
            {block.split('\n').map((line, item) => (
              <li key={item}>{linkedText(line.replace(/^- /, ''), onError)}</li>
            ))}
          </ul>
        );
      return (
        <p key={index}>{linkedText(block.replace(/\n/g, ' '), onError)}</p>
      );
    });
}

export function MusicPolicy({ connecting, onClose, onAccept, onError }: Props) {
  const [document, setDocument] = useState<'privacy' | 'terms'>('privacy');
  const [accepted, setAccepted] = useState(false);
  return (
    <DialogPanel title="Privacy and Music terms" onClose={onClose}>
      <div className="settings-music-actions" aria-label="Policy documents">
        <button
          type="button"
          aria-pressed={document === 'privacy'}
          onClick={() => setDocument('privacy')}
        >
          Privacy policy
        </button>
        <button
          type="button"
          aria-pressed={document === 'terms'}
          onClick={() => setDocument('terms')}
        >
          Music terms
        </button>
      </div>
      <article
        className="music-policy-document"
        tabIndex={0}
        aria-label={
          document === 'privacy' ? 'Privacy policy text' : 'Music terms text'
        }
        key={document}
      >
        <PolicyDocument
          text={document === 'privacy' ? privacy : terms}
          onError={onError}
        />
      </article>
      {connecting && (
        <>
          <label className="music-policy-consent">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            I agree to Aura’s privacy policy and Music terms.
          </label>
          <button type="button" disabled={!accepted} onClick={onAccept}>
            Continue to Google
          </button>
        </>
      )}
    </DialogPanel>
  );
}
