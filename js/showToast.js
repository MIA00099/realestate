function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// Export for CommonJS environment (Jest) without breaking in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { showToast };
}
