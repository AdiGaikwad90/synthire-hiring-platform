import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '@/lib/api'

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params?: Record<string, string>) => ['jobs', 'list', params] as const,
  detail: (id: string) => ['jobs', id] as const,
}

export function useJobs(params?: Record<string, string>) {
  return useQuery({ queryKey: jobKeys.list(params), queryFn: () => jobsApi.list(params) })
}

export function useJob(id: string) {
  return useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobsApi.get(id), enabled: !!id })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) => jobsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.all }),
  })
}

export function useUpdateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => jobsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: jobKeys.all })
      qc.invalidateQueries({ queryKey: jobKeys.detail(id) })
    },
  })
}
