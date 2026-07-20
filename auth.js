const tabs = document.querySelectorAll('[data-auth-tab]');

function safeJson(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { localStorage.removeItem(key); return fallback; }
}
function showAuth(view) {
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.authTab === view));
  document.querySelectorAll('.auth-view').forEach(panel => panel.classList.remove('active'));
  document.querySelector(`#${view}Panel`)?.classList.add('active');
}
function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
async function passwordHash(password, saltBase64) {
  const encoder = new TextEncoder();
  const salt = saltBase64 ? Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, 256);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(bits)) };
}
function saveSession(profile, remember = false) {
  localStorage.removeItem('lm_session'); sessionStorage.removeItem('lm_session');
  const store = remember ? localStorage : sessionStorage;
  store.setItem('lm_session', JSON.stringify({ id: profile.id, email: profile.email, authenticatedAt: new Date().toISOString() }));
}
function accounts() { return safeJson('lm_accounts', []); }
function saveAccount(profile) {
  const list = accounts().filter(account => account.email !== profile.email);
  list.push(profile); localStorage.setItem('lm_accounts', JSON.stringify(list));
}
function userKey(email, suffix) { return `lm_user_${email.toLowerCase()}_${suffix}`; }

tabs.forEach(tab => tab.onclick = () => showAuth(tab.dataset.authTab));
document.querySelector('[data-switch-register]').onclick = () => showAuth('register');
document.querySelector('[data-switch-login]').onclick = () => showAuth('login');
document.querySelectorAll('.toggle-password').forEach(btn => btn.onclick = () => {
  const input = btn.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '◉' : '○';
});

document.querySelector('#registerForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const email = data.email.trim().toLowerCase();
  if (accounts().some(account => account.email === email)) {
    showAuth('login'); document.querySelector('#loginForm input[name="email"]').value = email;
    showToast('Konto już istnieje', 'Zaloguj się zapisanym hasłem.'); return;
  }
  const submit = form.querySelector('.auth-submit'); submit.disabled = true; submit.textContent = 'Tworzę konto…';
  try {
    const credential = await passwordHash(data.password);
    const profile = { id: crypto.randomUUID(), firstName: data.firstName.trim(), lastName: data.lastName.trim(), email, phone: data.phone.trim(), role: 'Dyspozytor', ...credential, createdAt: new Date().toISOString() };
    saveAccount(profile); saveSession(profile, true);
    localStorage.setItem(userKey(email, 'onboarding_pending'), 'true');
    document.querySelectorAll('.auth-view,.auth-tabs').forEach(element => element.classList.remove('active'));
    document.querySelector('#authSuccess').classList.add('show');
    setTimeout(() => location.href = 'index.html', 900);
  } catch { submit.disabled = false; submit.textContent = 'Utwórz konto →'; showToast('Nie udało się utworzyć konta', 'Odśwież stronę i spróbuj ponownie.'); }
};

document.querySelector('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const email = data.email.trim().toLowerCase();
  const profile = accounts().find(account => account.email === email);
  if (!profile) {
    showAuth('register'); document.querySelector('#registerForm input[name="email"]').value = email;
    showToast('Nie znaleźliśmy tego konta', 'Uzupełnij dane, aby utworzyć konto.'); return;
  }
  if (!profile.hash || !profile.salt) {
    const upgraded = await passwordHash(data.password);
    Object.assign(profile, upgraded, { id: profile.id || crypto.randomUUID(), passwordUpgradedAt: new Date().toISOString() });
    saveAccount(profile);
    showToast('Konto zostało zabezpieczone', 'Od teraz logowanie wymaga właśnie podanego hasła.');
  }
  const submit = form.querySelector('.auth-submit'); submit.disabled = true; submit.textContent = 'Sprawdzam…';
  const credential = await passwordHash(data.password, profile.salt);
  if (credential.hash !== profile.hash) {
    submit.disabled = false; submit.textContent = 'Zaloguj się →';
    showToast('Nieprawidłowe hasło', 'Sprawdź hasło i spróbuj ponownie.'); return;
  }
  saveSession(profile, Boolean(data.remember)); location.href = 'index.html';
};

document.querySelector('.forgot-link').onclick = () => showToast('Resetowanie nie jest jeszcze aktywne', 'Do tej funkcji potrzebujemy backendu i usługi wysyłki e-mail.');
function showToast(title, message) {
  const toast = document.querySelector('#toast');
  toast.querySelector('b').textContent = title; toast.querySelector('p').textContent = message;
  toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4200);
}
