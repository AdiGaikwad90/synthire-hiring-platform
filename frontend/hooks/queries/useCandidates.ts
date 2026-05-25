import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { candidatesApi } from '@/lib/api'

export const candidateKeys = {
  all: ['candidates'] as const,
  list: (params?: Record<string, string>) => ['candidates', 'list', params] as const,
  detail: (id: string) => ['candidates', id] as const,
}

export function useCandidates(params?: Record<string, string>) {
  return useQuery({ queryKey: candidateKeys.list(params), queryFn: () => candidatesApi.list(params) })
}

export function useCandidate(id: string) {
  return useQuery({ queryKey: candidateKeys.detail(id), queryFn: () => candidatesApi.get(id), enabled: !!id })
}

export function useUpdateCandidateStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => candidatesApi.update(id, { status }),
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: candidateKeys.all })
      const prev = qc.getQueriesData({ queryKey: candidateKeys.all })
      qc.setQueriesData({ queryKey: candidateKeys.all }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const data = old as { items?: unknown[] }
        if (!data.items) return old
        return { ...data, items: data.items.map((c: unknown) => {
          const candidate = c as { id: string }
          return candidate.id === id ? { ...candidate, status } : candidate
        })}
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, val]) => qc.setQueryData(key, val))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: candidateKeys.all }),
  })
}


export function useInterviewQuestions(candidateId: string) {
  return useQuery({
    queryKey: ['candidates', candidateId, 'questions'],
    queryFn: () => candidatesApi.generateQuestions(candidateId),
    enabled: false, // only fetch on demand
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days — matches backend KV cache
    gcTime: 7 * 24 * 60 * 60 * 1000,
  })
}

export function useGenerateQuestions(candidateId: string) {
  return useMutation({
    mutationFn: () => candidatesApi.generateQuestions(candidateId),
  })
}
