document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const errorMessage = document.getElementById('errorMessage');
  const successMessage = document.getElementById('successMessage');
  
  const showError = (message) => {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.classList.add('show');
      setTimeout(() => {
        errorMessage.classList.remove('show');
      }, 5000);
    }
  };
  
  const showSuccess = (message) => {
    if (successMessage) {
      successMessage.textContent = message;
      successMessage.classList.add('show');
      setTimeout(() => {
        successMessage.classList.remove('show');
      }, 5000);
    }
  };
  
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      if (!email || !password) {
        showError(t('required_field'));
        return;
      }
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = t('loading');
      
      try {
        await API.post('/auth/login', { email, password });
        window.location.href = '/chat.html';
      } catch (error) {
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = t('login');
      }
    });
  }
  
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      if (!email || !password || !confirmPassword) {
        showError(t('required_field'));
        return;
      }
      
      if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
      }
      
      if (password.length < 8) {
        showError(t('password_too_short'));
        return;
      }
      
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = t('loading');
      
      try {
        await API.post('/auth/register', { email, password });
        window.location.href = '/chat.html';
      } catch (error) {
        showError(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = t('register');
      }
    });
  }
  
  const langButtons = document.querySelectorAll('.lang-btn');
  langButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      setLanguage(lang);
      langButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  updatePageLanguage();
});
