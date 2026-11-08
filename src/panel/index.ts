import { verifySiteAccess } from './site-access';

const form = document.getElementById('site-access') as HTMLFormElement;
const input = document.getElementById('site-url') as HTMLInputElement;
const button = document.getElementById('verify-site') as HTMLButtonElement;
const status = document.getElementById('site-status') as HTMLElement;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '';
  try {
    status.textContent = await verifySiteAccess(input.value);
  } catch {
    status.textContent = 'Chromium no permitió comprobar el acceso al sitio.';
  } finally {
    button.disabled = false;
  }
});
