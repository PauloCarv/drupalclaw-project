import { create } from 'zustand'
import { listPlans, getPlan, type PlanSummary, type PlanDetail } from '@/api/plans'

interface PlansState {
  plans: PlanSummary[]
  selectedPlanId: string | null
  selectedPlan: PlanDetail | null
  loading: boolean
  loadingDetail: boolean
  runningPlanId: string | null

  loadPlans: () => Promise<void>
  selectPlan: (id: string | null) => Promise<void>
  refreshSelectedPlan: () => Promise<void>
  setRunning: (id: string | null) => void
  removePlan: (id: string) => void
  addOrUpdateSummary: (summary: PlanSummary) => void
}

export const usePlansStore = create<PlansState>((set, get) => ({
  plans: [],
  selectedPlanId: null,
  selectedPlan: null,
  loading: false,
  loadingDetail: false,
  runningPlanId: null,

  loadPlans: async () => {
    set({ loading: true })
    try {
      const plans = await listPlans()
      set({ plans, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  selectPlan: async (id) => {
    if (!id) { set({ selectedPlanId: null, selectedPlan: null }); return }
    set({ selectedPlanId: id, loadingDetail: true })
    try {
      const plan = await getPlan(id)
      set({ selectedPlan: plan, loadingDetail: false })
    } catch {
      set({ loadingDetail: false })
    }
  },

  refreshSelectedPlan: async () => {
    const { selectedPlanId } = get()
    if (!selectedPlanId) return
    try {
      const plan = await getPlan(selectedPlanId)
      if (!plan) return
      set({ selectedPlan: plan })
      // also update the summary in the list
      const { plans } = get()
      set({ plans: plans.map((p) => p.id === plan.meta.id ? { ...p, ...plan.meta } : p) })
    } catch { /* keep stale */ }
  },

  setRunning: (id) => set({ runningPlanId: id }),

  removePlan: (id) => set((s) => ({
    plans: s.plans.filter((p) => p.id !== id),
    selectedPlanId: s.selectedPlanId === id ? null : s.selectedPlanId,
    selectedPlan: s.selectedPlanId === id ? null : s.selectedPlan,
  })),

  addOrUpdateSummary: (summary) => set((s) => {
    const exists = s.plans.some((p) => p.id === summary.id)
    if (exists) return { plans: s.plans.map((p) => p.id === summary.id ? summary : p) }
    return { plans: [summary, ...s.plans] }
  }),
}))
