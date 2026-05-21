import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailApi } from '@/lib/api'

export function useEmailLogs(params?: Record<string, string>) {
  return useQuery({ queryKey: ['email', 'logs', params], queryFn: () => emailApi.logs(params) })
}

export function useEmailPreferences() {
  return useQuery({ queryKey: ['email', 'preferences'], queryFn: emailApi.preferences })
}

export function useUpdateEmailPreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: emailApi.updatePreferences,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email', 'preferences'] }),
  })
}
