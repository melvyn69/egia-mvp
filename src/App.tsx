import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseAnonKey, supabaseUrl } from './lib/supabase'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [callbackError, setCallbackError] = useState<string | null>(null)
  const [callbackLoading, setCallbackLoading] = useState(false)
  const [callbackHandled, setCallbackHandled] = useState(false)
  const isCallbackPath = window.location.pathname === '/google_oauth_callback'
  const envMissing = !supabaseUrl || !supabaseAnonKey

  useEffect(() => {
    if (!supabase) {
      return
    }

    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        console.info('Supabase auth state:', event)
        setSession(nextSession)
      }
    )

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isCallbackPath) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      setGoogleConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [isCallbackPath])

  useEffect(() => {
    if (!isCallbackPath || callbackHandled) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) {
      setCallbackError('Code OAuth manquant.')
      return
    }

    if (!supabase || !supabaseUrl || !supabaseAnonKey) {
      setCallbackError('Configuration Supabase manquante.')
      return
    }

    if (!session) {
      return
    }

    setCallbackHandled(true)
    setCallbackLoading(true)

    const runExchange = async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/google_oauth_exchange`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseAnonKey}`,
              apikey: supabaseAnonKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, jwt: session.access_token })
          }
        )

        const text = await res.text()
        if (!res.ok) {
          console.error('google_oauth_exchange error:', res.status, text)
          setCallbackError('Impossible de finaliser la connexion Google.')
          return
        }

        const json = JSON.parse(text) as { ok?: boolean; error?: string }
        if (!json.ok) {
          setCallbackError(json.error ?? 'Connexion Google échouée.')
          return
        }

       window.location.replace(window.location.origin + '/?connected=1')
      } catch (error) {
        console.error(error)
        setCallbackError('Impossible de finaliser la connexion Google.')
      } finally {
        setCallbackLoading(false)
      }
    }

    void runExchange()
  }, [
    callbackHandled,
    isCallbackPath,
    session,
    supabase,
    supabaseAnonKey,
    supabaseUrl
  ])

  useEffect(() => {
    if (!supabase || !session) {
      setGoogleConnected(null)
      return
    }

    let isMounted = true
    setGoogleError(null)

    supabase
      .from('google_connections')
      .select('user_id')
      .eq('user_id', session.user.id)
      .eq('provider', 'google')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) {
          return
        }

        if (error) {
          console.error('Google connection lookup error:', error)
          setGoogleError('Impossible de verifier la connexion Google.')
          setGoogleConnected(false)
          return
        }

        setGoogleConnected(Boolean(data))
      })

    return () => {
      isMounted = false
    }
  }, [session])

  const handleSignIn = async () => {
    setAuthError(null)

    if (!supabase) {
      const message = 'Configuration Supabase manquante.'
      console.error(message)
      setAuthError(message)
      return
    }

    console.info('Supabase auth: starting Google sign-in')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) {
      console.error('Supabase auth sign-in error:', error)
      setAuthError('Impossible de se connecter avec Google.')
    }
  }

  const handleConnectGoogle = async () => {
    setGoogleError(null)

    if (!supabase || !session || !supabaseUrl || !supabaseAnonKey) {
      setGoogleError('Connexion Supabase requise.')
      return
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/google_oauth_start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jwt: session.access_token })
      })

      const text = await res.text()

      if (!res.ok) {
        console.error('google_oauth_start error:', res.status, text)
        setGoogleError('Impossible de démarrer la connexion Google.')
        return
      }

      const json = JSON.parse(text) as { url?: string }
      if (!json.url) {
        setGoogleError('URL Google manquante.')
        return
      }

      window.location.href = json.url
    } catch (e) {
      console.error(e)
      setGoogleError('Impossible de démarrer la connexion Google.')
    }
  }

  const handleSignOut = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    console.info('Supabase auth: signed out')
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>EGIA MVP</h1>
      {isCallbackPath && (
        <p>{callbackLoading ? 'Connexion Google en cours...' : 'Connexion Google'}</p>
      )}
      {callbackError && <p>{callbackError}</p>}
      {envMissing && (
        <p>
          Variables d&apos;env Supabase manquantes. Ajoutez
          VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.
        </p>
      )}
      {authError && <p>{authError}</p>}
      {session ? (
        <div>
          <p>Statut: connecte</p>
          <p>Email: {session.user.email}</p>
          <button onClick={handleSignOut}>Se deconnecter</button>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleConnectGoogle} disabled={envMissing}>
              Connecter Google Business Profile
            </button>
            {googleConnected === true && <p>Google connecte ✅</p>}
            {googleConnected === false && <p>Google non connecte</p>}
            {googleError && <p>{googleError}</p>}
          </div>
        </div>
      ) : (
        <div>
          <p>Statut: deconnecte</p>
          <button onClick={handleSignIn} disabled={envMissing}>
            Se connecter avec Google
          </button>
        </div>
      )}
    </div>
  )
}

export default App
