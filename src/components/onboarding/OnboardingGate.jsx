import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { investmentRulesApi } from '../../lib/supabase'
import { suggestionsService } from '../../lib/api'
import OnboardingWizard from './OnboardingWizard'

/**
 * Mounts once on authed routes. Watches investment_rules for the current
 * user; auto-fires the OnboardingWizard exactly when a row is missing.
 *
 * "Skip for now" writes a dismissed row so the popup never re-fires until
 * the user explicitly edits Rules from /profile. "Save & Generate" writes
 * the row, kicks off suggestion generation in the background, and closes.
 */
export default function OnboardingGate() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  // Local dismiss-this-session flag so the popup doesn't reappear on the
  // next route change before the DB write reflects in the React Query cache.
  const [sessionDismissed, setSessionDismissed] = useState(false)

  const rulesQ = useQuery({
    queryKey: ['investment-rules'],
    queryFn: investmentRulesApi.get,
    enabled: !!user,
    staleTime: 60 * 1000,
  })

  // Reset session-dismiss when the user switches accounts.
  useEffect(() => { setSessionDismissed(false); setError('') }, [user?.id])

  const saveMutation = useMutation({
    mutationFn: investmentRulesApi.save,
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['investment-rules'] })
      try {
        await suggestionsService.generate()
        queryClient.invalidateQueries({ queryKey: ['investment-suggestions'] })
      } catch (_) { /* best-effort; user can regenerate from /suggestions */ }
    },
    onError: (err) => setError(err.message || 'Could not save rules'),
  })

  const dismissMutation = useMutation({
    mutationFn: investmentRulesApi.dismiss,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment-rules'] })
      setSessionDismissed(true)
    },
  })

  if (!user) return null
  if (rulesQ.isLoading || rulesQ.isFetching) return null
  if (sessionDismissed) return null
  // Row exists -- whether completed or explicitly dismissed, leave them alone.
  if (rulesQ.data) return null

  return (
    <OnboardingWizard
      open
      pending={saveMutation.isPending}
      error={error}
      title="Welcome to Market Pulse"
      subtitle="Set your Investment Rules in about a minute. The advisor reads them and tailors your suggested ideas."
      onComplete={(values) => {
        setError('')
        saveMutation.mutate(values)
      }}
      onDismiss={() => dismissMutation.mutate()}
    />
  )
}
