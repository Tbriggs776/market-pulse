import { supabase } from '../supabase'

async function getSpendingOverview() {
  const { data, error } = await supabase.functions.invoke('spending-data', {
    body: { type: 'all' },
  })
  if (error) throw new Error(error.message || 'Spending data unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

async function getAgencies() {
  const { data, error } = await supabase.functions.invoke('spending-data', {
    body: { type: 'agencies' },
  })
  if (error) throw new Error(error.message || 'Agency data unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

async function getAgencyDetail(agency) {
  const { data, error } = await supabase.functions.invoke('agency-detail', {
    body: {
      toptierCode: agency.toptierCode,
      agencyName: agency.name,
      abbreviation: agency.abbreviation,
      budget: agency.budget,
      obligated: agency.obligated,
      outlays: agency.outlays,
    },
  })
  if (error) throw new Error(error.message || 'Agency detail unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

export const spendingService = {
  getSpendingOverview,
  getAgencies,
  getAgencyDetail,
}