document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value.trim();
  const msg = document.getElementById('msg');

  msg.textContent = 'Verificando...';

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      window.location.href = 'dashboard.html';
    } else {
      msg.textContent = data.error || 'Credenciais inválidas';
    }
  } catch {
    msg.textContent = 'Erro de conexão com o servidor.';
  }
});
