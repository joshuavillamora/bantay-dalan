// A classic script can explain why opening index.html directly fails before
// the browser tries to load modules and fetch the road datasets.
if (location.protocol === 'file:') {
  document.getElementById('lt').textContent = 'Start the local server';
  document.getElementById('mapSource').textContent = 'Map requires the local server';
  const message = document.getElementById('msg');
  message.textContent = 'Run python3 scripts/serve.py in the CHOKEPOINT folder, then open the address printed in Terminal.';
  message.hidden = false;
} else {
  import('./main.js').catch(error => {
    console.error('Application startup failed', error);
    document.getElementById('lt').textContent = 'Application startup failed';
    const message = document.getElementById('msg');
    message.textContent = 'Could not load the application. Reload to fetch the latest local files.';
    message.hidden = false;
    const retry = document.getElementById('graphRetry');
    retry.textContent = 'Reload application';
    retry.hidden = false;
    retry.onclick = () => location.reload();
  });
}
