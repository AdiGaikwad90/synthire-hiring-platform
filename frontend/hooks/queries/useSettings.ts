import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'

const settingsKeys = { types: ['settings', 'interview-types'] as const }

export function useInterviewTypes() {
  return useQuery({ queryKey: settingsKeys.types, queryFn: settingsApi.listTypes })
}

export function useCreateInterviewType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => settingsApi.createType(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.types }),
  })
}

export function useUpdateInterviewType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => settingsApi.updateType(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.types }),
  })
}

export function useDeleteInterviewType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.types }),
  })
}
