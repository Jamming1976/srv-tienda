const CLIENT_ID = '2596819080389090';
const CLIENT_SECRET = '2xlErTwqsjvd6aljZ1jn1ap3hlqmC4P2';
const REDIRECT_URI = 'https://srvtienda.netlify.app/.netlify/functions/ml-proxy';

export default async (request) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // OAuth callback — intercambiar code por token
  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      return new Response(JSON.stringify({ error: 'No code' }), { status: 400, headers: corsHeaders });
    }
    try {
      const r = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI
        })
      });
      const data = await r.json();
      // Devolver token embebido en HTML para que la app lo capture
      const html = `<!DOCTYPE html><html><body>
        <script>
          localStorage.setItem('ml_token', '${data.access_token}');
          localStorage.setItem('ml_token_exp', Date.now() + ${(data.expires_in || 21600) * 1000});
          window.location.href = 'https://srvtienda.netlify.app/?token_ok=1';
        </script>
        <p>Autenticando... <a href="https://srvtienda.netlify.app">volver</a></p>
      </body></html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  // Proxy normal — pasar requests a ML con token opcional
  const target = url.searchParams.get('url');
  const token = url.searchParams.get('token');
  if (!target) {
    return new Response(JSON.stringify({ error: 'Falta URL' }), { status: 400, headers: corsHeaders });
  }

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(decodeURIComponent(target), { headers });
    const text = await response.text();
    return new Response(text, { status: 200, headers: corsHeaders });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
};

export const config = { path: '/.netlify/functions/ml-proxy' };
