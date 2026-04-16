/**
 * Financial Statements Service -- Supabase Edge Function wrapper
 */

import { supabase } from '../supabase'

async function getIncomeStatement() {
  const { data, error } = await supabase.functions.invoke('treasury-statements', {
    body: { statement: 'income' },
  })
  if (error) throw new Error(error.message || 'Income statement unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

async function getBalanceSheet() {
  const { data, error } = await supabase.functions.invoke('treasury-statements', {
    body: { statement: 'balance_sheet' },
  })
  if (error) throw new Error(error.message || 'Balance sheet unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

async function getCashFlow() {
  const { data, error } = await supabase.functions.invoke('treasury-statements', {
    body: { statement: 'cash_flow' },
  })
  if (error) throw new Error(error.message || 'Cash flow unavailable')
  if (data?.error) throw new Error(data.error)
  return data
}

export const statementsService = {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
}