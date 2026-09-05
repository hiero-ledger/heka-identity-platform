import React, { useCallback, useState } from 'react';

import type { ContributorGpgChallenge } from '@/entities/User/model/services/requestContributorGpgChallenge';
import { verifyContributorGpgChallenge } from '@/entities/User/model/services/verifyContributorGpgChallenge';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import * as cls from './Step.module.scss';

interface Props {
  challenge: ContributorGpgChallenge;
  onVerified: () => void;
}

const SignStep: React.FC<Props> = ({ challenge, onVerified }) => {
  const dispatch = useAppDispatch();
  const [signature, setSignature] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const gpgCommand = `echo -n "${challenge.nonce}" | gpg --clearsign --armor`;

  const handleCopyCommand = useCallback(async () => {
    await navigator.clipboard.writeText(gpgCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [gpgCommand]);

  const handleSubmit = useCallback(async () => {
    if (!signature.trim()) return;
    setIsSubmitting(true);
    try {
      await dispatch(
        verifyContributorGpgChallenge({
          challengeId: challenge.challengeId,
          signature: signature.trim(),
        }),
      ).unwrap();
      onVerified();
    } catch {
      // Error handled in slice
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, challenge.challengeId, signature, onVerified]);

  const expiresAt = new Date(challenge.expiresAt);
  const minutesLeft = Math.max(
    0,
    Math.round((expiresAt.getTime() - Date.now()) / 60000),
  );

  return (
    <div className={cls.step}>
      <div className={cls.stepIcon}>✍️</div>

      <h2 className={cls.stepHeading}>Sign the challenge with your GPG key</h2>

      <p className={cls.stepDescription}>
        Run the command below in your terminal to sign the challenge nonce with your GPG
        key. Then paste the full signed output into the field below.
      </p>

      {/* Challenge nonce display */}
      <div className={cls.nonceCard}>
        <div className={cls.nonceHeader}>
          <span className={cls.nonceLabel}>Challenge Nonce</span>
          <span className={cls.nonceExpiry}>
            ⏱ Expires in ~{minutesLeft} min
          </span>
        </div>
        <code className={cls.nonceValue}>{challenge.nonce}</code>
      </div>

      {/* GPG command */}
      <div className={cls.commandCard}>
        <div className={cls.commandHeader}>
          <span className={cls.commandLabel}>Run in terminal</span>
          <button
            className={cls.copyBtn}
            onClick={() => void handleCopyCommand()}
            id="copy-gpg-command-btn"
          >
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
        </div>
        <pre className={cls.commandCode}>{gpgCommand}</pre>
      </div>

      {/* Help callout */}
      <div className={cls.helpBox}>
        <strong>Don't have a GPG key on GitHub?</strong>
        <p>
          Follow{' '}
          <a
            href="https://docs.github.com/en/authentication/managing-commit-signature-verification/generating-a-new-gpg-key"
            target="_blank"
            rel="noopener noreferrer"
            className={cls.link}
          >
            GitHub's GPG key guide
          </a>{' '}
          to generate and add a key, then come back here.
        </p>
      </div>

      {/* Signature textarea */}
      <div className={cls.signatureGroup}>
        <label htmlFor="gpg-signature" className={cls.fieldLabel}>
          Paste the signed output here
        </label>
        <textarea
          id="gpg-signature"
          className={cls.signatureTextarea}
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={'-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA512\n\n...\n-----END PGP SIGNATURE-----'}
          rows={8}
          disabled={isSubmitting}
          spellCheck={false}
        />
      </div>

      {/* Error states */}
      <div className={cls.errorHints}>
        <p className={cls.errorHintsTitle}>Common errors:</p>
        <ul>
          <li>
            <strong>invalid signature</strong> — Make sure you are using the GPG key linked to
            your GitHub account (check with <code>gpg --list-secret-keys</code>)
          </li>
          <li>
            <strong>expired challenge</strong> — Challenges expire after 10 minutes. Click
            "Generate Challenge" again to get a fresh one.
          </li>
          <li>
            <strong>missing GPG key</strong> — Your GitHub account must have at least one
            verified GPG key at{' '}
            <a
              href="https://github.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className={cls.link}
            >
              github.com/settings/keys
            </a>
          </li>
        </ul>
      </div>

      <button
        id="submit-signature-btn"
        className={cls.primaryBtn}
        onClick={() => void handleSubmit()}
        disabled={!signature.trim() || isSubmitting}
      >
        {isSubmitting ? 'Verifying…' : 'Submit Signature'}
      </button>
    </div>
  );
};

export default SignStep;
