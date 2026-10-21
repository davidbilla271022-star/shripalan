import { useState, useEffect, useMemo, useRef } from 'react';
import './App.css';

// Uses VITE_API_URL in cloud production (e.g. Vercel -> Render), or relative proxy locally
const API_BASE = import.meta.env.VITE_API_URL || '';

// Helper to format YYYY-MM-DD in local time for storage
function toDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper to display any date string in Indian format: DD/MM/YYYY
function formatIndianDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Calculate live countdown to 2027
function get2027Countdown() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const targetYear = currentYear >= 2027 ? currentYear + 1 : 2027;
  const startOfYear = new Date(currentYear, 0, 1, 0, 0, 0);
  const startOfNextYear = new Date(targetYear, 0, 1, 0, 0, 0);

  const diffMs = Math.max(0, startOfNextYear - now);
  const totalYearMs = startOfNextYear - startOfYear;
  const elapsedMs = now - startOfYear;

  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minsLeft = Math.floor((diffMs / (1000 * 60)) % 60);
  const percentElapsed = Math.min(100, Math.max(0, ((elapsedMs / totalYearMs) * 100))).toFixed(1);

  const weekday = now.toLocaleDateString('en-IN', { weekday: 'short' });
  const ddmmyyyy = formatIndianDate(toDateKey(now));

  return {
    targetYear,
    daysLeft,
    hoursLeft,
    minsLeft,
    percentElapsed,
    todayFormatted: `${weekday}, ${ddmmyyyy}`,
  };
}

function App() {
  // 1. Live 2027 Horizon Countdown state
  const [countdown, setCountdown] = useState(() => get2027Countdown());

  // 2. Auth state (persisted in localStorage)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('kronos_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup' | 'forgot' | 'reset'
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Change old password state (for logged-in user)
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPwInput, setOldPwInput] = useState('');
  const [changeNewPwInput, setChangeNewPwInput] = useState('');
  const [changePwMsg, setChangePwMsg] = useState('');
  const [changePwError, setChangePwError] = useState('');

  // 3. Calendar state
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(''); // '' means show all dates

  // 4. Todo state
  const [todos, setTodos] = useState([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [apiError, setApiError] = useState('');

  // Composer inputs
  const [titleInput, setTitleInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('Personal');
  const [priorityInput, setPriorityInput] = useState('medium');
  const [dueDateInput, setDueDateInput] = useState(() => toDateKey(new Date()));
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'done'

  // Inline editing state
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Easter Egg / Motivational spotlight state (hidden by default until clicked)
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [easterEggClicks, setEasterEggClicks] = useState(0);

  const formWrapRef = useRef(null);

  // Update countdown every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(get2027Countdown());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Modern Web Guidance: Sync aria-invalid & WeakMap fallback for :user-invalid
  useEffect(() => {
    const root = formWrapRef.current || document;
    const dirtyState = new WeakMap();

    const syncAria = (el) => {
      if (!el || typeof el.matches !== 'function' || !el.checkValidity) return;
      try {
        const isInvalid = el.matches(':user-invalid') || el.classList.contains('user-invalid-fallback');
        el.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
      } catch {
        // Fallback if selector not supported
      }
    };

    const updateFallbackState = (input) => {
      if (!input || !input.checkValidity) return;
      const isValid = input.checkValidity();
      input.classList.toggle('user-invalid-fallback', !isValid);
      input.classList.toggle('user-valid-fallback', isValid);
      if (!isValid) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    };

    const handleBlur = (e) => {
      const input = e.target;
      if (!input || !input.checkValidity) return;
      if (!CSS.supports('selector(:user-invalid)')) {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasBlurred = true;
        dirtyState.set(input, state);
        if (state.hasInteracted) updateFallbackState(input);
      }
      syncAria(input);
    };

    const handleInput = (e) => {
      const input = e.target;
      if (!input || !input.checkValidity) return;
      if (!CSS.supports('selector(:user-invalid)')) {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasInteracted = true;
        dirtyState.set(input, state);
        if (state.hasBlurred) updateFallbackState(input);
      }
      if (input.hasAttribute('aria-invalid')) syncAria(input);
    };

    root.addEventListener('blur', handleBlur, true);
    root.addEventListener('input', handleInput);
    return () => {
      root.removeEventListener('blur', handleBlur, true);
      root.removeEventListener('input', handleInput);
    };
  }, [authMode, user, showChangePw]);

  // Fetch Todos when user logs in
  const fetchTodos = async (currentUser) => {
    if (!currentUser) return;
    try {
      setLoadingTodos(true);
      setApiError('');
      const res = await fetch(`${API_BASE}/todos?user_id=${currentUser.id}`);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTodos(data);
    } catch {
      setApiError('Cannot reach Flask server on port 5000. Make sure python app.py is running.');
    } finally {
      setLoadingTodos(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTodos(user);
    }
  }, [user]);

  // ---------------- AUTH & RECOVERY HANDLERS ---------------- //
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    const endpoint = authMode === 'signup' ? '/auth/signup' : '/auth/login';
    const payload =
      authMode === 'signup'
        ? { name: authName, email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      localStorage.setItem('kronos_user', JSON.stringify(data.user));
      setUser(data.user);
      setAuthPassword('');
    } catch {
      setAuthError('Could not connect to Flask backend on port 5000.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 1 of Forgot Password: Request 6-digit recovery code via email
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Could not send recovery code');
        return;
      }

      setAuthSuccess(data.message);
      if (data.dev_otp) {
        setOtpCode(data.dev_otp);
      }
      setAuthMode('reset');
    } catch {
      setAuthError('Could not connect to Flask backend.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2 of Forgot Password: Verify 6-digit OTP and save new password
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          otp_code: otpCode,
          new_password: newPasswordInput,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Password reset failed');
        return;
      }

      localStorage.setItem('kronos_user', JSON.stringify(data.user));
      setUser(data.user);
      setOtpCode('');
      setNewPasswordInput('');
      setAuthMode('login');
    } catch {
      setAuthError('Could not connect to Flask backend.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Signed-in user changing old password to new password
  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setChangePwError('');
    setChangePwMsg('');

    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          old_password: oldPwInput,
          new_password: changeNewPwInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChangePwError(data.error || 'Could not change password');
        return;
      }
      setChangePwMsg(data.message || 'Password updated!');
      setOldPwInput('');
      setChangeNewPwInput('');
    } catch {
      setChangePwError('Could not connect to Flask backend.');
    }
  };

  // Instant 1-Click Demo Login
  const handleDemoAccess = async () => {
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);
    const demoCreds = {
      name: 'Shri',
      email: 'shri@kronos26.app',
      password: 'Password123!',
    };
    try {
      let res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoCreds.email, password: demoCreds.password }),
      });
      if (res.status === 401) {
        res = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(demoCreds),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Demo login failed');
        return;
      }
      localStorage.setItem('kronos_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch {
      setAuthError('Could not connect to Flask backend on port 5000.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('kronos_user');
    setUser(null);
    setTodos([]);
    setShowChangePw(false);
  };

  // ---------------- TODO CRUD HANDLERS ---------------- //
  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!titleInput.trim() || !user) return;

    const targetDate = selectedDate || dueDateInput || todayKey;

    try {
      const res = await fetch(`${API_BASE}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          title: titleInput.trim(),
          category: categoryInput,
          priority: priorityInput,
          due_date: targetDate,
          completed: false,
        }),
      });
      if (!res.ok) throw new Error('Could not create task');
      const created = await res.json();
      setTodos([created, ...todos]);
      setTitleInput('');
    } catch (err) {
      setApiError(err.message);
    }
  };

  const handleToggleTodo = async (todo) => {
    try {
      const res = await fetch(`${API_BASE}/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      if (!res.ok) throw new Error('Could not update task');
      const updated = await res.json();
      setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));
    } catch (err) {
      setApiError(err.message);
    }
  };

  const handleSaveEdit = async (todo) => {
    if (!editingTitle.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      if (!res.ok) throw new Error('Could not update task title');
      const updated = await res.json();
      setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));
      setEditingId(null);
      setEditingTitle('');
    } catch (err) {
      setApiError(err.message);
    }
  };

  const handleDeleteTodo = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/todos/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Could not delete task');
      setTodos(todos.filter((t) => t.id !== id));
    } catch (err) {
      setApiError(err.message);
    }
  };

  // ---------------- CALENDAR COMPUTATION ---------------- //
  const calendarDays = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ empty: true, key: `empty-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasTask = todos.some((t) => t.due_date === dateStr && !t.completed);
      cells.push({
        empty: false,
        day,
        dateStr,
        hasTask,
        isToday: dateStr === todayKey,
        isSelected: dateStr === selectedDate,
        key: dateStr,
      });
    }
    return cells;
  }, [calMonth, todos, todayKey, selectedDate]);

  // Filtered tasks
  const filteredTodos = useMemo(() => {
    return todos.filter((t) => {
      if (selectedDate && t.due_date !== selectedDate) return false;
      if (statusFilter === 'active' && t.completed) return false;
      if (statusFilter === 'done' && !t.completed) return false;
      return true;
    });
  }, [todos, selectedDate, statusFilter]);

  const completedCount = useMemo(() => todos.filter((t) => t.completed).length, [todos]);

  // 90-dot sprint visualization for the end of the year
  const sprintDots = useMemo(() => {
    const totalDots = 90;
    const activeRemaining = Math.min(totalDots, countdown.daysLeft);
    const passedInSprint = Math.max(0, totalDots - activeRemaining);
    return Array.from({ length: totalDots }, (_, idx) => {
      if (idx < passedInSprint) return 'passed';
      if (idx === passedInSprint) return 'today-pulse';
      return 'remaining';
    });
  }, [countdown.daysLeft]);

  return (
    <div className="app-shell" ref={formWrapRef}>
      {/* ====================================================================
          ALWAYS-PRESENT 2027 HORIZON BANNER (VISIBLE ON EVERY SCREEN)
          ==================================================================== */}
      <section className="horizon-banner" aria-label="Countdown to 2027">
        <div className="horizon-left">
          <div className="countdown-stamp">
            <span className="countdown-number">{countdown.daysLeft}</span>
            <span className="countdown-unit">Days Left</span>
          </div>
          <div className="horizon-copy">
            <h2>{countdown.daysLeft} days left for {countdown.targetYear}</h2>
            <p>
              {countdown.todayFormatted} · {countdown.hoursLeft}h {countdown.minsLeft}m remaining today
            </p>
          </div>
        </div>

        <div className="horizon-right">
          <div className="year-progress-meta">
            <span>YEAR SPRINT</span>
            <span>{countdown.percentElapsed}% OF 2026 ELAPSED</span>
          </div>
          <div className="year-progress-track">
            <div
              className="year-progress-fill"
              style={{ width: `${countdown.percentElapsed}%` }}
            />
          </div>
        </div>
      </section>

      {/* ====================================================================
          TOP HEADER BAR
          ==================================================================== */}
      <header className="topbar">
        <div className="brand-lockup">
          <h1 className="brand-title">ShriPalan</h1>
          <span className="brand-edition">2026–2027 Horizon</span>
        </div>

        {user && (
          <div className="user-pill-group">
            <div className="user-badge">
              <span className="user-dot" />
              <span>{user.name || user.email}</span>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShowChangePw((prev) => !prev);
                setChangePwError('');
                setChangePwMsg('');
              }}
            >
              {showChangePw ? 'Close' : 'Change Password'}
            </button>
            <button type="button" className="btn-ghost" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Change Old Password Panel for Signed-In User */}
      {user && showChangePw && (
        <section className="change-pw-panel">
          <form className="auth-form" onSubmit={handleChangePasswordSubmit}>
            <div>
              <h3 className="auth-heading" style={{ fontSize: '1.15rem' }}>
                Change Your Password ({user.email})
              </h3>
              <p className="auth-subtext" style={{ marginBottom: '8px' }}>
                Enter your current password and choose a new password (minimum 6 characters).
              </p>
            </div>

            {changePwError && <div className="alert-banner">{changePwError}</div>}
            {changePwMsg && <div className="success-banner">{changePwMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div className="field">
                <label htmlFor="change-old-password">Old Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="change-old-password"
                  name="old-password"
                  required
                  autoComplete="current-password"
                  value={oldPwInput}
                  onChange={(e) => setOldPwInput(e.target.value)}
                  placeholder="Current password"
                />
              </div>

              <div className="field">
                <label htmlFor="change-new-password">New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="change-new-password"
                  name="new-password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={changeNewPwInput}
                  onChange={(e) => setChangeNewPwInput(e.target.value)}
                  placeholder="New password (6+ chars)"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="submit" className="btn-primary" style={{ padding: '10px 16px' }}>
                Update Password
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowPassword((p) => !p)}
              >
                {showPassword ? 'Hide Passwords' : 'Show Passwords'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ====================================================================
          VIEW 1: AUTHENTICATION (WHEN NOT LOGGED IN)
          ==================================================================== */}
      {!user ? (
        <main className="auth-layout">
          {/* Left Column: Editorial Sign In / Sign Up / Password Recovery Card */}
          <section className="paper-card">
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'login'}
                className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthSuccess('');
                }}
              >
                Log In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signup'}
                className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError('');
                  setAuthSuccess('');
                }}
              >
                Create Account
              </button>
            </div>

            {authError && <div className="alert-banner">{authError}</div>}
            {authSuccess && <div className="success-banner">{authSuccess}</div>}

            {authMode === 'login' && (
              <form className="auth-form" onSubmit={handleAuthSubmit}>
                <div>
                  <h2 className="auth-heading">Welcome back to your desk.</h2>
                  <p className="auth-subtext">
                    Sign in with your email to sync your daily tasks and 2027 countdown calendar.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="login-email">Email Address</label>
                  <span id="login-email-hint" className="hint">
                    Format: you@example.com
                  </span>
                  <input
                    type="email"
                    id="login-email"
                    name="email"
                    required
                    autoComplete="username"
                    enterKeyHint="next"
                    aria-describedby="login-email-hint"
                    aria-errormessage="login-email-error"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <div id="login-email-error" className="error-msg">
                    <span aria-hidden="true">!</span> Please enter a valid email address.
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="current-password">Password</label>
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="current-password"
                      name="password"
                      required
                      autoComplete="current-password"
                      enterKeyHint="done"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      className="toggle-pw-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="error-msg">
                    <span aria-hidden="true">!</span> Password is required to sign in.
                  </div>
                </div>

                <div className="forgot-row">
                  <button
                    type="button"
                    className="btn-text-link"
                    onClick={() => {
                      setAuthMode('forgot');
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                  >
                    Forgot password? Recover via email →
                  </button>
                </div>

                <button type="submit" className="btn-primary" disabled={authLoading}>
                  {authLoading ? 'Opening Journal...' : 'Sign In to Workspace →'}
                </button>
              </form>
            )}

            {authMode === 'signup' && (
              <form className="auth-form" onSubmit={handleAuthSubmit}>
                <div>
                  <h2 className="auth-heading">Start your 2027 sprint.</h2>
                  <p className="auth-subtext">
                    Create your personal account stored directly in your PostgreSQL database.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="signup-name">Your Name</label>
                  <span id="signup-name-hint" className="hint">
                    How should we address your journal?
                  </span>
                  <input
                    type="text"
                    id="signup-name"
                    name="name"
                    required
                    autoComplete="name"
                    enterKeyHint="next"
                    aria-describedby="signup-name-hint"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="e.g., Shri"
                  />
                </div>

                <div className="field">
                  <label htmlFor="signup-email">Email Address</label>
                  <span id="signup-email-hint" className="hint">
                    Format: you@example.com
                  </span>
                  <input
                    type="email"
                    id="signup-email"
                    name="email"
                    required
                    autoComplete="username"
                    enterKeyHint="next"
                    aria-describedby="signup-email-hint"
                    aria-errormessage="signup-email-error"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <div id="signup-email-error" className="error-msg">
                    <span aria-hidden="true">!</span> Please enter a valid email address.
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="new-password">Create Password</label>
                  <ul id="password-rules" className="rules-list">
                    <li>At least 6 characters long</li>
                  </ul>
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="new-password"
                      name="new-password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      enterKeyHint="done"
                      aria-describedby="password-rules"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                    <button
                      type="button"
                      className="toggle-pw-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="error-msg">
                    <span aria-hidden="true">!</span> Password must be at least 6 characters.
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={authLoading}>
                  {authLoading ? 'Creating Account...' : 'Create My Account →'}
                </button>
              </form>
            )}

            {authMode === 'forgot' && (
              <form className="auth-form" onSubmit={handleForgotSubmit}>
                <div>
                  <h2 className="auth-heading">Recover Your Password</h2>
                  <p className="auth-subtext">
                    Enter your registered email address and we will send a 6-digit recovery code to reset your password.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="forgot-email">Registered Email Address</label>
                  <span id="forgot-email-hint" className="hint">
                    Enter the email you used to sign up
                  </span>
                  <input
                    type="email"
                    id="forgot-email"
                    name="email"
                    required
                    autoComplete="username"
                    enterKeyHint="done"
                    aria-describedby="forgot-email-hint"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <div className="error-msg">
                    <span aria-hidden="true">!</span> Please enter a valid email address.
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={authLoading}>
                  {authLoading ? 'Sending Recovery Code...' : 'Send 6-Digit Recovery Code →'}
                </button>

                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                >
                  ← Back to Log In
                </button>
              </form>
            )}

            {authMode === 'reset' && (
              <form className="auth-form" onSubmit={handleResetSubmit}>
                <div>
                  <h2 className="auth-heading">Enter Recovery Code</h2>
                  <p className="auth-subtext">
                    Enter the 6-digit code for <strong>{authEmail}</strong> and choose your new password.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="reset-otp">6-Digit Recovery Code</label>
                  <span id="reset-otp-hint" className="hint">
                    6-digit numeric code sent to your email
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    id="reset-otp"
                    name="otp"
                    required
                    autoComplete="one-time-code"
                    enterKeyHint="next"
                    aria-describedby="reset-otp-hint"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                  />
                  <div className="error-msg">
                    <span aria-hidden="true">!</span> Please enter the 6-digit numeric code.
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="reset-new-password">New Password</label>
                  <ul id="reset-pw-rules" className="rules-list">
                    <li>At least 6 characters long</li>
                  </ul>
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="reset-new-password"
                      name="new-password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      enterKeyHint="done"
                      aria-describedby="reset-pw-rules"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="Enter your new password"
                    />
                    <button
                      type="button"
                      className="toggle-pw-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="error-msg">
                    <span aria-hidden="true">!</span> New password must be at least 6 characters.
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={authLoading}>
                  {authLoading ? 'Updating Password...' : 'Save New Password & Sign In →'}
                </button>
              </form>
            )}

            <button
              type="button"
              className="btn-demo"
              onClick={handleDemoAccess}
              disabled={authLoading}
            >
              ⚡ Instant 1-Click Demo Sign In (shri@kronos26.app)
            </button>
          </section>

          {/* Right Column on Auth Page: Live Calendar Preview & 90-Day Dot Grid */}
          <aside className="calendar-card">
            <div className="calendar-header">
              <h3 className="calendar-month-title">
                {calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="cal-nav-group">
                <button
                  type="button"
                  className="cal-nav-btn"
                  onClick={() =>
                    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                  }
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="cal-nav-btn"
                  onClick={() =>
                    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                  }
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="calendar-weekdays">
              <span>SU</span>
              <span>MO</span>
              <span>TU</span>
              <span>WE</span>
              <span>TH</span>
              <span>FR</span>
              <span>SA</span>
            </div>

            <div className="calendar-days-grid">
              {calendarDays.map((cell) =>
                cell.empty ? (
                  <div key={cell.key} className="cal-day empty" />
                ) : (
                  <button
                    key={cell.key}
                    type="button"
                    className={`cal-day ${cell.isToday ? 'is-today' : ''}`}
                  >
                    <span>{cell.day}</span>
                  </button>
                )
              )}
            </div>

            <div className="dot-matrix-box">
              <div className="dot-matrix-title">
                <span>FINAL 90-DAY SPRINT TO {countdown.targetYear}</span>
                <span>{countdown.daysLeft}d LEFT</span>
              </div>
              <div className="dot-grid">
                {sprintDots.map((status, idx) => (
                  <div key={idx} className={`day-dot ${status}`} />
                ))}
              </div>
            </div>
          </aside>
        </main>
      ) : (
        /* ====================================================================
           VIEW 2: LOGGED-IN WORKSPACE (CALENDAR + TASK JOURNAL)
           ==================================================================== */
        <main className="workspace-grid">
          {/* Left Column: Persistent Interactive Calendar & 2027 Sprint Matrix */}
          <aside className="calendar-card">
            <div className="calendar-header">
              <h3 className="calendar-month-title">
                {calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="cal-nav-group">
                <button
                  type="button"
                  className="cal-nav-btn"
                  onClick={() =>
                    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                  }
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="cal-nav-btn"
                  onClick={() =>
                    setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                  }
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="calendar-weekdays">
              <span>SU</span>
              <span>MO</span>
              <span>TU</span>
              <span>WE</span>
              <span>TH</span>
              <span>FR</span>
              <span>SA</span>
            </div>

            <div className="calendar-days-grid">
              {calendarDays.map((cell) =>
                cell.empty ? (
                  <div key={cell.key} className="cal-day empty" />
                ) : (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      const nextDate = selectedDate === cell.dateStr ? '' : cell.dateStr;
                      setSelectedDate(nextDate);
                      if (nextDate) setDueDateInput(nextDate);
                    }}
                    className={`cal-day ${cell.isToday ? 'is-today' : ''} ${
                      cell.isSelected ? 'is-selected' : ''
                    }`}
                  >
                    <span>{cell.day}</span>
                    {cell.hasTask && <span className="cal-dot" />}
                  </button>
                )
              )}
            </div>

            <div className="calendar-footer-meta">
              <span>
                {selectedDate
                  ? `Filtering: ${formatIndianDate(selectedDate)}`
                  : 'Showing all scheduled dates'}
              </span>
              {selectedDate && (
                <button
                  type="button"
                  className="btn-text-link"
                  onClick={() => setSelectedDate('')}
                >
                  Show All
                </button>
              )}
            </div>

            <div className="dot-matrix-box">
              <div className="dot-matrix-title">
                <span>90-DAY SPRINT TO {countdown.targetYear}</span>
                <span>{countdown.daysLeft} DAYS</span>
              </div>
              <div className="dot-grid">
                {sprintDots.map((status, idx) => (
                  <div key={idx} className={`day-dot ${status}`} />
                ))}
              </div>
            </div>
          </aside>

          {/* Right Column: Task Composer & Task List */}
          <section className="tasks-panel">
            {apiError && <div className="alert-banner">{apiError}</div>}

            {/* Task Composer */}
            <form className="composer-card" onSubmit={handleAddTodo}>
              <div className="composer-main-row">
                <input
                  type="text"
                  className="composer-input"
                  placeholder="Write your next priority before 2027..."
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  enterKeyHint="done"
                />
                <button type="submit" className="btn-primary">
                  Add Task
                </button>
              </div>

              <div className="composer-options-row">
                <div className="composer-selects">
                  <select
                    className="pill-select"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    aria-label="Task category"
                  >
                    <option value="Personal">📂 Personal</option>
                    <option value="Work">💼 Work</option>
                    <option value="Goals">🎯 2027 Goal</option>
                    <option value="Health">⚡ Health</option>
                  </select>

                  <select
                    className="pill-select"
                    value={priorityInput}
                    onChange={(e) => setPriorityInput(e.target.value)}
                    aria-label="Task priority"
                  >
                    <option value="high">🔥 High Priority</option>
                    <option value="medium">● Medium</option>
                    <option value="low">○ Low</option>
                  </select>

                  <label className="indian-date-pill" title="Select task date (DD/MM/YYYY)">
                    <span>📅 {formatIndianDate(selectedDate || dueDateInput)}</span>
                    <input
                      type="date"
                      className="hidden-native-date"
                      value={selectedDate || dueDateInput}
                      onChange={(e) => {
                        setDueDateInput(e.target.value);
                        if (selectedDate) setSelectedDate(e.target.value);
                      }}
                      onClick={(e) => e.target.showPicker && e.target.showPicker()}
                      aria-label="Due date in DD/MM/YYYY format"
                    />
                  </label>
                </div>
              </div>
            </form>

            {/* Filter & Status Bar */}
            <div className="filter-bar">
              <div className="filter-tabs">
                <button
                  type="button"
                  className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  All ({todos.length})
                </button>
                <button
                  type="button"
                  className={`filter-chip ${statusFilter === 'active' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('active')}
                >
                  Open ({todos.length - completedCount})
                </button>
                <button
                  type="button"
                  className={`filter-chip ${statusFilter === 'done' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('done')}
                >
                  Completed ({completedCount})
                </button>
              </div>

              <span className="stats-summary">
                {completedCount}/{todos.length} COMPLETED
              </span>
            </div>

            {/* Task List */}
            {loadingTodos ? (
              <div className="empty-journal">
                <h3>Syncing your journal...</h3>
                <p>Reading tasks from PostgreSQL</p>
              </div>
            ) : filteredTodos.length === 0 ? (
              <div className="empty-journal">
                <h3>Clear horizon.</h3>
                <p>
                  {selectedDate
                    ? `No tasks scheduled for ${formatIndianDate(selectedDate)}. Add one above!`
                    : 'Your task journal is empty. Add your first priority above.'}
                </p>
              </div>
            ) : (
              <ul className="task-list">
                {filteredTodos.map((todo) => (
                  <li
                    key={todo.id}
                    className={`task-card ${todo.completed ? 'is-done' : ''}`}
                  >
                    <div className="task-left">
                      <input
                        type="checkbox"
                        className="task-checkbox"
                        checked={Boolean(todo.completed)}
                        onChange={() => handleToggleTodo(todo)}
                        aria-label={`Mark "${todo.title}" as completed`}
                      />
                      <div className="task-body">
                        {editingId === todo.id ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              className="composer-input"
                              style={{ padding: '6px 10px', fontSize: '0.9rem' }}
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(todo);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => handleSaveEdit(todo)}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <span className="task-title">{todo.title}</span>
                        )}

                        <div className="task-badges">
                          <span className="badge badge-cat">
                            {todo.category || 'Personal'}
                          </span>
                          <span
                            className={`badge badge-priority-${
                              todo.priority || 'medium'
                            }`}
                          >
                            {todo.priority || 'medium'}
                          </span>
                          {todo.due_date && (
                            <span className="badge badge-date">
                              📅 {formatIndianDate(todo.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit task"
                        onClick={() => {
                          setEditingId(todo.id);
                          setEditingTitle(todo.title);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn delete"
                        title="Delete task"
                        onClick={() => handleDeleteTodo(todo.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}

      {/* ====================================================================
          MOTIVATIONAL VAULT & EASTER EGG SECTION (BOTTOM OF WEBSITE)
          ==================================================================== */}
      <footer className="motivation-section">
        <div className="easter-egg-trigger-bar">
          <button
            type="button"
            className="easter-egg-btn"
            onClick={() => {
              setShowEasterEgg((prev) => !prev);
              setEasterEggClicks((c) => c + 1);
            }}
          >
            <span>🏆</span>
            <span>
              {showEasterEgg ? 'Hide Champion Vault' : 'Unlock Champion Easter Egg'}
            </span>
          </button>
          <span className="stats-summary">
            MINDSET FUEL · {countdown.daysLeft} DAYS TO MAKE 2026 COUNT
          </span>
        </div>

        {showEasterEgg && (
          <div className="motivation-card">
            <div className="motivation-img-frame">
              <img
                src="/motivation.png"
                alt="Champion holding trophy motivation"
                loading="lazy"
              />
            </div>
            <div>
              <span className="motivation-kicker">
                ★ HALL OF PERSISTENCE · EASTER EGG #{easterEggClicks + 1}
              </span>
              <blockquote className="motivation-quote">
                “Shri always wanted to be like Ajithkumar”
              </blockquote>
              <p className="motivation-sub">
                Dhanraj my friend since my childhood. Billa is my Role model for this birth,
                stay consistent when nobody is watching.
              </p>
              <div className="motivation-stats-row">
                <span className="trophy-pill">
                  🏆 {completedCount} Tasks Conquered
                </span>
                <span className="trophy-pill">
                  ⏳ {countdown.daysLeft} Days Until {countdown.targetYear}
                </span>
                <span className="trophy-pill">🔥 Never Give Up</span>
              </div>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
