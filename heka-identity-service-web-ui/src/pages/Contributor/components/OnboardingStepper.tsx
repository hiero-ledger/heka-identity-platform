import React from 'react'

export interface OnboardingStep {
  id: string
  label: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'github-login', label: 'GitHub Login' },
  { id: 'gpg-challenge', label: 'GPG Challenge' },
  { id: 'sign', label: 'Sign & Submit' },
  { id: 'credential', label: 'Credential' },
]

interface Props {
  currentStep: number  // 0-indexed
  completedSteps: number[]
  errorStep?: number
}

export const OnboardingStepper: React.FC<Props> = ({
  currentStep,
  completedSteps,
  errorStep,
}) => {
  return (
    <div style={styles.wrapper}>
      {ONBOARDING_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(index)
        const isCurrent = index === currentStep
        const isError = index === errorStep
        const isUpcoming = index > currentStep && !isCompleted

        return (
          <React.Fragment key={step.id}>
            {/* Step circle */}
            <div style={styles.stepCol}>
              <div
                style={{
                  ...styles.circle,
                  ...(isCompleted ? styles.circleCompleted : {}),
                  ...(isCurrent && !isError ? styles.circleCurrent : {}),
                  ...(isError ? styles.circleError : {}),
                  ...(isUpcoming ? styles.circleUpcoming : {}),
                }}
              >
                {isCompleted ? '✓' : isError ? '✗' : index + 1}
              </div>
              <span
                style={{
                  ...styles.label,
                  ...(isCurrent ? styles.labelCurrent : {}),
                  ...(isUpcoming ? styles.labelUpcoming : {}),
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line (except after last step) */}
            {index < ONBOARDING_STEPS.length - 1 && (
              <div
                style={{
                  ...styles.connector,
                  ...(isCompleted ? styles.connectorDone : {}),
                }}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    padding: '20px 0 8px',
  },
  stepCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    minWidth: 64,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    border: '2px solid #334155',
    color: '#475569',
    background: '#0f172a',
    transition: 'all 0.25s',
  },
  circleCompleted: {
    background: '#16a34a',
    border: '2px solid #16a34a',
    color: '#fff',
    boxShadow: '0 0 10px rgba(22, 163, 74, 0.3)',
  },
  circleCurrent: {
    background: 'rgba(99, 102, 241, 0.15)',
    border: '2px solid #6366f1',
    color: '#818cf8',
    boxShadow: '0 0 12px rgba(99, 102, 241, 0.25)',
  },
  circleError: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '2px solid #ef4444',
    color: '#f87171',
  },
  circleUpcoming: {
    border: '2px solid #1e293b',
    color: '#334155',
  },
  label: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: 500,
    lineHeight: 1.2,
  },
  labelCurrent: { color: '#a5b4fc', fontWeight: 700 },
  labelUpcoming: { color: '#334155' },
  connector: {
    flex: 1,
    height: 2,
    background: '#1e293b',
    marginTop: 15,
    transition: 'background 0.25s',
    minWidth: 16,
  },
  connectorDone: { background: '#16a34a' },
}
