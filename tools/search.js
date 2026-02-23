const https = require('https');

function webSearch(query, opts = {}) {
  return new Promise((resolve, reject) => {
    // Use DuckDuckGo instant answer API (free, no key)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = [];

          if (json.AbstractText) {
            results.push({
              title: json.Heading || query,
              snippet: json.AbstractText,
              url: json.AbstractURL,
              source: json.AbstractSource,
            });
          }

          if (json.RelatedTopics) {
            for (const topic of json.RelatedTopics.slice(0, 8)) {
              if (topic.Text) {
                results.push({
                  title: topic.Text.split(' - ')[0]?.slice(0, 80),
                  snippet: topic.Text,
                  url: topic.FirstURL,
                });
              }
            }
          }

          resolve(results.length > 0 ? results : [{ title: 'No instant results', snippet: `Try searching directly: https://duckduckgo.com/?q=${encodeURIComponent(query)}` }]);
        } catch (err) {
          reject(new Error(`Search parse error: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

module.exports = { webSearch };
