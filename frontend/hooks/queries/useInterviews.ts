import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { interviewsApi } from '@/lib/api'

export const interviewKeys = {
  all: ['interviews'] as const,
  list: (params?: Record<string, string>) => ['interviews', 'list', params] as const,
  detail: (id: string) => ['interviews', id] as const,
}

export function useInterviews(params?: Record<string, string>) {
  return useQuery({ queryKey: interviewKeys.list(params), queryFn: () => interviewsApi.list(params) })
}

export function useInterview(id: string) {
  return useQuery({ queryKey: interviewKeys.detail(id), queryFn: () => interviewsApi.get(id), enabled: !!id })
}

export function useScheduleInterview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => interviewsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: interviewKeys.all }),
  })
}

export function useSubmitFeedback(interviewId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => interviewsApi.submitFeedback(interviewId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: interviewKeys.all })
      qc.invalidateQueries({ queryKey: interviewKeys.detail(interviewId) })
    },
  })
}
