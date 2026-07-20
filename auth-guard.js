(async function () {
  try {
    if (!window.lmSupabase) throw new Error('Supabase client unavailable');
    const { data: { session }, error } = await window.lmSupabase.auth.getSession();
    if (error || !session) {
      localStorage.removeItem('lm_session');
      sessionStorage.removeItem('lm_session');
      window.location.replace('auth.html');
      return;
    }
    window.syncLogisticMasterSession(session);
    document.documentElement.classList.remove('auth-checking');
    const startApplication = () => {
      const script = document.createElement('script');
      script.src = 'app.js';
      document.body.appendChild(script);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApplication, { once: true });
    else startApplication();
  } catch (error) {
    console.error(error);
    window.location.replace('auth.html');
  }
})();
