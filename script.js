const API_BASE = 'https://dashboard-api-ccba.onrender.com';

const naira = n => '₦' + n.toLocaleString('en-NG');
const getToken = () => localStorage.getItem('token');
const setToken = t => localStorage.setItem('token', t);

async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Login failed (status ${res.status})`);
  setToken(body.token);
}

async function signup(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Signup failed (status ${res.status})`);
  setToken(body.token);
}

async function loadDashboard() {
  const token = getToken();
  if (!token) return showAuthForm();

  const res = await fetch(`${API_BASE}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) { localStorage.removeItem('token'); return showAuthForm(); }

  renderDashboard(await res.json());
}

function renderDashboard(data) {
  document.getElementById('balance').textContent = naira(data.balance);
  document.getElementById('spend').textContent = naira(data.monthlySpend);
  document.getElementById('revenue').textContent = naira(data.revenue);
  document.getElementById('orders').textContent = data.orders;

  const pct = Math.round((data.savingsGoal.current / data.savingsGoal.target) * 100);
  document.getElementById('savingsPct').textContent = pct + '%';
  requestAnimationFrame(() => { document.getElementById('savingsFill').style.width = pct + '%'; });

  const delta = data.trend[data.trend.length - 1] - data.trend[0];
  document.getElementById('trendDelta').textContent = (delta >= 0 ? '+' : '') + delta + ' orders';

  const svg = document.getElementById('trendChart');
  const vals = data.trend;
  const max = Math.max(...vals), min = Math.min(...vals);
  const stepX = 260 / (vals.length - 1);
  const points = vals.map((v, i) => [i * stepX, 60 - ((v - min) / (max - min || 1)) * 50]);
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  svg.innerHTML = '<path d="' + pathD + '" fill="none" stroke="#e3a542" stroke-width="2"/>' +
    points.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5" fill="#e3a542"/>').join('');
}

async function loadEntries() {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${API_BASE}/api/entries`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return;
  renderEntries(await res.json());
}

function renderEntries(entries) {
  const list = document.getElementById('entryList');
  if (entries.length === 0) {
    list.innerHTML = '<p class="lede">No entries yet — add one above.</p>';
    return;
  }
  list.innerHTML = entries.map(e => {
    const amt = Number(e.amount);
    const sign = amt < 0 ? 'negative' : 'positive';
    const dateStr = new Date(e.entry_date).toLocaleDateString('en-NG');
    return `
      <div class="entry-row">
        <span class="meta">${dateStr} · ${e.type} · ${e.category}</span>
        <span class="amt ${sign}">${naira(Math.abs(amt))}</span>
        <button class="del-btn" data-id="${e.id}" type="button">Delete</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
  });
}

async function deleteEntry(id) {
  const res = await fetch(`${API_BASE}/api/entries/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (res.ok) {
    loadDashboard();
    loadEntries();
  }
}

function showAuthForm() {
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('authForm').style.display = 'block';
}
function showDashboard() {
  document.getElementById('authForm').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadDashboard();
  loadEntries();
}

document.getElementById('authSubmit').addEventListener('click', async e => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const mode = document.getElementById('authSubmit').dataset.mode;
  document.getElementById('authError').textContent = '';
  try {
    mode === 'login' ? await login(email, password) : await signup(email, password);
    showDashboard();
  } catch (err) {
    // Shows the real reason now: a server validation message, a status
    // code, or "Failed to fetch" if the request never reached the API
    // at all (usually a CORS block or a wrong API_BASE URL).
    document.getElementById('authError').textContent = err.message;
  }
});

document.getElementById('authToggle').addEventListener('click', () => {
  const btn = document.getElementById('authSubmit');
  const toLogin = btn.dataset.mode === 'signup';
  btn.dataset.mode = toLogin ? 'login' : 'signup';
  document.getElementById('authTitle').textContent = toLogin ? 'Log in' : 'Create account';
  btn.textContent = toLogin ? 'Log in' : 'Sign up';
  document.getElementById('authToggle').textContent = toLogin ? 'New here? Sign up' : 'Have an account? Log in';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  document.getElementById('authEmail').value = '';
  document.getElementById('authPassword').value = '';
  document.getElementById('authError').textContent = '';
  showAuthForm();
});

document.getElementById('entryForm').addEventListener('submit', async e => {
  e.preventDefault();
  const type = document.getElementById('entryType').value;
  const direction = document.getElementById('entryDirection').value;
  const category = document.getElementById('entryCategory').value;
  const rawAmount = parseFloat(document.getElementById('entryAmount').value);
  const amount = direction === 'expense' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const entry_date = document.getElementById('entryDate').value || undefined;
  document.getElementById('entryError').textContent = '';

  try {
    const res = await fetch(`${API_BASE}/api/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({ type, category, amount, entry_date })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Could not add entry (status ${res.status})`);

    document.getElementById('entryForm').reset();
    loadDashboard();
    loadEntries();
  } catch (err) {
    document.getElementById('entryError').textContent = err.message;
  }
});

loadDashboard(); // checks for an existing session on page load
loadEntries();
