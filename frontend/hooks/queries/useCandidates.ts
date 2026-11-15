import * as React from 'react'
import { candidatePollInterval, candidateListPollInterval } from '@/lib/scoring'
import { uploadPollInterval } from '@/lib/upload-status'
import { useQuery, useQueries, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { candidatesApi } from '@/lib/api'
import { jobKeys } from './useJobs'

export const candidateKeys = {
  all: ['candidates'] as const,
  lists: ['candidates', 'list'] as const,
  list: (params?: Record<string, string>) => ['candidates', 'list', params] as const,
  detail: (id: string) => ['candidates', id] as const,
}

/**
 * Everything a new or newly processed candidate changes: candidate lists (and
 * the sidebar count read from them), the per-job candidate counts, and the
 * dashboard numbers. Overlapping calls are merged by React Query.
 */
function invalidateCandidateViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: candidateKeys.lists })
  qc.invalidateQueries({ queryKey: jobKeys.all })
  qc.invalidateQueries({ queryKey: ['analytics'] })
}

export function useCandidates(params?: Record<string, string>) {
  return useQuery({
    queryKey: candidateKeys.list(params),
    queryFn: () => candidatesApi.list(params),
    // Stays live while anything listed is still being processed (SYN-005).
    refetchInterval: (query) => candidateListPollInterval(query.state.data?.items),
  })
}

/** Uploads one resume. The new candidate shows up in lists straight away, as "processing". */
export function useUploadResume() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, jobId }: { file: File; jobId: string }) => candidatesApi.upload(file, jobId),
    onSuccess: () => invalidateCandidateViews(qc),
  })
}

/**
 * Follows uploaded candidates until each is processed, has failed, or the
 * polling window passes — and refreshes lists and counts every time one
 * settles. Polling is React Query's, so it stops when the caller unmounts.
 * Returns, per id, the candidate as last fetched and the checks made so far.
 */
export function useUploadProgress(candidateIds: string[]) {
  const qc = useQueryClient()
  const results = useQueries({
    queries: candidateIds.map((id) => ({
      queryKey: candidateKeys.detail(id),
      queryFn: () => candidatesApi.get(id),
      refetchInterval: (query: { state: { data?: { processing_status?: string | null }; dataUpdateCount: number } }) =>
        uploadPollInterval(query.state.data?.processing_status, query.state.dataUpdateCount),
    })),
  })

  const settled = results.filter((r) => r.data && candidatePollInterval(r.data.processing_status) === false).length
  React.useEffect(() => {
    if (settled > 0) invalidateCandidateViews(qc)
  }, [settled, qc])

  return new Map(candidateIds.map((id, i) => {
    // Reading dataUpdatedAt subscribes this component to every completed check,
    // even one that returned identical data — the check count must still move.
    void results[i].dataUpdatedAt
    return [id, {
      candidate: results[i].data ?? null,
      ticks: qc.getQueryState(candidateKeys.detail(id))?.dataUpdateCount ?? 0,
    }] as const
  }))
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: candidateKeys.detail(id),
    queryFn: () => candidatesApi.get(id),
    enabled: !!id,
    // Keeps the page live while parsing/scoring runs in the background.
    refetchInterval: (query) => candidatePollInterval(query.state.data?.processing_status),
  })
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
