// Apply the saved appearance before styles paint, including in private mode.
try {
  const theme = JSON.parse(localStorage.getItem('worth-the-walk-v1'))?.settings?.theme;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}
