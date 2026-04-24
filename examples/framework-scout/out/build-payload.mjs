import fs from 'node:fs';
const html = fs.readFileSync(new URL('./scout-email-body.html', import.meta.url), 'utf8');
const date = new Date().toISOString().slice(0, 10);
const payload = {
  from: 'noreply@reducibl.com',
  to: 'david.paul.crowe@googlemail.com',
  subject: `ACP Framework Scout — ${date}`,
  html,
};
fs.writeFileSync(new URL('./scout-email-payload.json', import.meta.url), JSON.stringify(payload));
console.log('payload bytes:', fs.statSync(new URL('./scout-email-payload.json', import.meta.url)).size);
