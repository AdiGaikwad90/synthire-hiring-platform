import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/lib/api'

export function useFunnel() {
  return useQuery({ queryKey: ['analytics', 'funnel'], queryFn: analyticsApi.funnel })
}

export function useTimeToHire() {
  return useQuery({ queryKey: ['analytics', 'time-to-hire'], queryFn: analyticsApi.timeToHire })
}

export function useAnalyticsSummary() {
  return useQuery({ queryKey: ['analytics', 'summary'], queryFn: analyticsApi.summary })
}

export function useActivity() {
  return useQuery({ queryKey: ['analytics', 'activity'], queryFn: analyticsApi.activity, refetchInterval: 30_000 })
}

export function useEmailStats() {
  return useQuery({ queryKey: ['analytics', 'email-stats'], queryFn: analyticsApi.emailStats })
}
