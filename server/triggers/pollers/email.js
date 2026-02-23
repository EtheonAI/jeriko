const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Track seen message UIDs per trigger to avoid re-firing
const seenUIDs = new Map();

async function pollEmail(config) {
  const {
    host, port, user, password, tls,
    mailbox, filter, markSeen, maxResults,
  } = {
    host: config.host || 'imap.gmail.com',
    port: config.port || 993,
    user: config.user,
    password: config.password,
    tls: config.tls !== false,
    mailbox: config.mailbox || 'INBOX',
    filter: config.filter || 'UNSEEN',
    markSeen: config.markSeen !== false,
    maxResults: config.maxResults || 5,
  };

  if (!user || !password) {
    throw new Error('Email trigger requires user and password in config');
  }

  return new Promise((resolve, reject) => {
    const imap = new Imap({ user, password, host, port, tls, tlsOptions: { rejectUnauthorized: false } });
    const results = [];

    imap.once('ready', () => {
      imap.openBox(mailbox, false, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        // Build search criteria
        const criteria = buildCriteria(filter, config);

        imap.search(criteria, (err, uids) => {
          if (err) { imap.end(); return reject(err); }
          if (!uids || uids.length === 0) { imap.end(); return resolve([]); }

          // Filter out already-seen UIDs
          const key = `${user}:${mailbox}`;
          const seen = seenUIDs.get(key) || new Set();
          const newUIDs = uids.filter(uid => !seen.has(uid)).slice(-maxResults);

          if (newUIDs.length === 0) { imap.end(); return resolve([]); }

          // Mark as seen in our tracker
          for (const uid of newUIDs) seen.add(uid);
          // Keep set bounded
          if (seen.size > 1000) {
            const arr = [...seen];
            seenUIDs.set(key, new Set(arr.slice(-500)));
          } else {
            seenUIDs.set(key, seen);
          }

          const fetch = imap.fetch(newUIDs, {
            bodies: '',
            markSeen,
            struct: true,
          });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, mail) => {
                if (err) return;
                results.push({
                  from: mail.from?.text || '',
                  to: mail.to?.text || '',
                  subject: mail.subject || '',
                  date: mail.date?.toISOString() || '',
                  text: mail.text || '',
                  html: mail.html || '',
                });
              });
            });
          });

          fetch.once('end', () => {
            // Give simpleParser a moment to finish
            setTimeout(() => {
              imap.end();
              resolve(results);
            }, 500);
          });

          fetch.once('error', (err) => {
            imap.end();
            reject(err);
          });
        });
      });
    });

    imap.once('error', (err) => reject(err));
    imap.connect();
  });
}

function buildCriteria(filter, config) {
  const criteria = [];

  if (filter === 'UNSEEN') {
    criteria.push('UNSEEN');
  } else if (filter === 'ALL') {
    criteria.push('ALL');
  } else if (filter === 'RECENT') {
    // Last 24 hours
    const since = new Date();
    since.setDate(since.getDate() - 1);
    criteria.push(['SINCE', since]);
  }

  if (config.from) {
    criteria.push(['FROM', config.from]);
  }

  if (config.subject) {
    criteria.push(['SUBJECT', config.subject]);
  }

  return criteria.length > 0 ? criteria : ['UNSEEN'];
}

module.exports = { pollEmail };
