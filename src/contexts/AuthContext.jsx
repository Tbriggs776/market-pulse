import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const profileFetchedFor = useRef(null)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[auth]', event)
        if (!mounted) return

        const currentUser = session?.user || null
        setUser(currentUser)

        // Always stop loading immediately - do not wait for profile
        setLoading(false)

        // Fetch profile in background, only once per user
        if (currentUser && profileFetchedFor.current !== currentUser.id) {
          profileFetchedFor.current = currentUser.id
          supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle()
            .then(({ data, error }) => {
              if (mounted && data) {
                console.log('[auth] profile loaded:', data.display_name)
                setProfile(data)
              }
              if (error) console.warn('[auth] profile error:', error.message)
            })
        }

        if (!currentUser) {
          setProfile(null)
          profileFetchedFor.current = null
        }
      }
    )

    // Safety timeout in case onAuthStateChange never fires
    const timer = setTimeout(() => {
      if (mounted && loading) {
        console.warn('[auth] timeout')
        setLoading(false)
      }
    }, 3000)

    return () => {
      mounted = false
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  async function signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
      },
    })
    if (error) throw error
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setProfile(null)
    profileFetchedFor.current = null
  }

  async function updateProfile(updates) {
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    setProfile(data)
    return data
  }

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}