const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function validateConfig(input, requirePassword = true) {
  const config = {
    email: String(input.email || '').trim(),
    password: String(input.password || ''),
    host: String(input.host || '').trim(),
    port: Number(input.port || 993),
    folder: String(input.folder || 'INBOX').trim() || 'INBOX',
  };
  if (!/^\S+@\S+\.\S+$/.test(config.email)) throw Object.assign(new Error('Podaj poprawny adres e-mail.'), { statusCode: 400 });
  if (!config.host || config.host.includes('://')) throw Object.assign(new Error('Podaj nazwę serwera IMAP bez https://.'), { statusCode: 400 });
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw Object.assign(new Error('Nieprawidłowy port IMAP.'), { statusCode: 400 });
  if (requirePassword && !config.password) throw Object.assign(new Error('Podaj hasło aplikacyjne skrzynki.'), { statusCode: 400 });
  return config;
}

function createImap(config) {
  return new ImapFlow({ host: config.host, port: config.port, secure: config.port === 993, auth: { user: config.email, pass: config.password }, logger: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 30000 });
}

async function testConnection(config) {
  const client = createImap(config);
  try { await client.connect(); await client.mailboxOpen(config.folder, { readOnly: true }); }
  finally { if (client.usable) await client.logout().catch(() => {}); }
}

async function fetchRecent(config, limit = 25) {
  const client = createImap(config);
  const messages = [];
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(config.folder, { readOnly: true });
    if (!mailbox.exists) return messages;
    const start = Math.max(1, mailbox.exists - limit + 1);
    for await (const item of client.fetch(`${start}:*`, { uid: true, envelope: true, source: true, internalDate: true })) {
      const parsed = await simpleParser(item.source);
      messages.push({
        message_id: parsed.messageId || `${config.email}:${config.folder}:${item.uid}`,
        sender_name: parsed.from?.value?.[0]?.name || '',
        sender_email: parsed.from?.value?.[0]?.address || '',
        subject: parsed.subject || '(bez tematu)',
        received_at: (parsed.date || item.internalDate || new Date()).toISOString(),
        text_body: String(parsed.text || '').slice(0, 100000),
      });
    }
    return messages;
  } finally { if (client.usable) await client.logout().catch(() => {}); }
}

module.exports = { validateConfig, testConnection, fetchRecent };
