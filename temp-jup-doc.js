const axios = require('axios');
axios.get('https://perps-api.jup.ag/v1/docs', { timeout: 10000 })
  .then(res => {
    const html = res.data;
    const regex = /"(\/v1\/[^"]+)"/g;
    const matches = new Set();
    let match;
    while ((match = regex.exec(html)) !== null) {
      matches.add(match[1]);
      if (matches.size >= 40) {
        break;
      }
    }
    console.log(Array.from(matches));
  })
  .catch(err => {
    console.error('error', err.response ? ${err.response.status}  : err.message);
  });
