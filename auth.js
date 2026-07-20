const tabs = document.querySelectorAll('[data-auth-tab]');
const client = window.lmSupabase;

function showAuth(view) {
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.authTab === view));
  document.querySelectorAll('.auth-view').forEach(panel => panel.classList.remove('active'));
  document.querySelector(`#${view}Panel`)?.classList.add('active');
}

function userKey(email, suffix) {
  return `lm_user_${email.toLowerCase()}_${suffix}`;
}

function readableAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return ['Nieprawidłowe dane logowania', 'Sprawdź adres e-mail i hasło.'];
  if (message.includes('already registered') || message.includes('already been registered')) return ['Konto już istnieje', 'Zaloguj się używając tego adresu e-mail.'];
  if (message.includes('email not confirmed')) return ['Potwierdź adres e-mail', 'Otwórz wiadomość wysłaną przez Supabase i kliknij link aktywacyjny.'];
  if (message.includes('password')) return ['Hasło nie spełnia wymagań', error.message];
  return ['Nie udało się wykonać operacji', error?.message || 'Spróbuj ponownie za chwilę.'];
}

tabs.forEach(tab => tab.onclick = () => showAuth(tab.dataset.authTab));
document.querySelector('[data-switch-register]').onclick = () => showAuth('register');
document.querySelector('[data-switch-login]').onclick = () => showAuth('login');
document.querySelectorAll('.toggle-password').forEach(button => button.onclick = () => {
  const input = button.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? '◉' : '○';
});

document.querySelector('#registerForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const email = data.email.trim().toLowerCase();
  const submit = form.querySelector('.auth-submit');
  submit.disabled = true;
  submit.textContent = 'Tworzę konto…';
  try {
    const { data: result, error } = await client.auth.signUp({
      email,
      password: data.password,
      options: {
        emailRedirectTo: `${location.origin}/auth.html`,
        data: {
          first_name: data.firstName.trim(),
          last_name: data.lastName.trim(),
          phone: data.phone.trim(),
          role: 'Dyspozytor',
        },
      },
    });
    if (error) throw error;
    localStorage.setItem(userKey(email, 'onboarding_pending'), 'true');
    document.querySelectorAll('.auth-view,.auth-tabs').forEach(element => element.classList.remove('active'));
    const success = document.querySelector('#authSuccess');
    success.classList.add('show');
    if (result.session) {
      window.syncLogisticMasterSession(result.session);
      setTimeout(() => location.href = 'index.html', 900);
    } else {
      success.querySelector('h2').textContent = 'Potwierdź adres e-mail';
      success.querySelector('p').textContent = 'Wysłaliśmy link aktywacyjny. Po potwierdzeniu wróć do logowania.';
    }
  } catch (error) {
    const [title, message] = readableAuthError(error);
    submit.disabled = false;
    submit.textContent = 'Utwórz konto →';
    showToast(title, message);
  }
};

document.querySelector('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('.auth-submit');
  submit.disabled = true;
  submit.textContent = 'Sprawdzam…';
  try {
    const { data: result, error } = await client.auth.signInWithPassword({
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });
    if (error) throw error;
    window.syncLogisticMasterSession(result.session);
    location.href = 'index.html';
  } catch (error) {
    const [title, message] = readableAuthError(error);
    submit.disabled = false;
    submit.textContent = 'Zaloguj się →';
    showToast(title, message);
  }
};

document.querySelector('.forgot-link').onclick = async () => {
  const email = document.querySelector('#loginForm input[name="email"]').value.trim().toLowerCase();
  if (!email) {
    showToast('Podaj adres e-mail', 'Wpisz e-mail konta, a następnie kliknij resetowanie hasła.');
    return;
  }
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth.html` });
  if (error) {
    const [title, message] = readableAuthError(error);
    showToast(title, message);
    return;
  }
  showToast('Wiadomość została wysłana', 'Sprawdź skrzynkę i kliknij link resetujący hasło.');
};

client?.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    window.syncLogisticMasterSession(session);
    location.replace('index.html');
  }
});

function showToast(title, message) {
  const toast = document.querySelector('#toast');
  toast.querySelector('b').textContent = title;
  toast.querySelector('p').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4200);
}
