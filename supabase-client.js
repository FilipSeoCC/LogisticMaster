(function () {
  const SUPABASE_URL = 'https://lupbogfmojkxbtexqlqo.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OzSGIKNPOZmvlftZ7lljJA_VqgcrB97';

  if (!window.supabase?.createClient) {
    console.error('Nie udało się załadować klienta Supabase.');
    return;
  }

  window.lmSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  window.syncLogisticMasterSession = function (session) {
    if (!session?.user) return null;
    const metadata = session.user.user_metadata || {};
    const profile = {
      id: session.user.id,
      email: session.user.email,
      firstName: metadata.first_name || metadata.firstName || '',
      lastName: metadata.last_name || metadata.lastName || '',
      phone: metadata.phone || session.user.phone || '',
      role: metadata.role || 'Dyspozytor',
      authenticatedAt: new Date().toISOString(),
    };
    localStorage.setItem('lm_session', JSON.stringify(profile));
    sessionStorage.removeItem('lm_session');
    const accounts = JSON.parse(localStorage.getItem('lm_accounts') || '[]').filter(item => item.id !== profile.id && item.email !== profile.email);
    accounts.push(profile);
    localStorage.setItem('lm_accounts', JSON.stringify(accounts));
    return profile;
  };
})();
