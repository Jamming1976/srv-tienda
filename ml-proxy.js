const CLIENT_ID = '2028127575858925';
const CLIENT_SECRET = 'VX5MqYqqweyMokqMxBPkV58yXnyUbyiz';
const REDIRECT_URI = 'https://srvintegral.com/.netlify/functions/ml-proxy?action=callback';

export default async (request) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // OAuth callback: exchange code for token
  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      return new Response('Missing code', { status: 400, headers: corsHeaders });
    }

    try {
      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        return new Response(JSON.stringify(tokenData), {
          status: tokenRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Pasar el token como query param para que el HTML lo guarde en localStorage
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || '';
      const expiresIn = tokenData.expires_in || 21600;

      const redirectUrl = `https://srvintegral.com/?token_ok=1&ml_token=${encodeURIComponent(accessToken)}&ml_refresh=${encodeURIComponent(refreshToken)}&ml_exp=${Date.now() + expiresIn * 1000}`;
      return Response.redirect(redirectUrl, 302);

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Proxy ML API requests
  const mlUrl = url.searchParams.get('url');
  if (!mlUrl) {
    return new Response('Missing url param', { status: 400, headers: corsHeaders });
  }

  if (!mlUrl.startsWith('https://api.mercadolibre.com/')) {
    return new Response('Invalid URL', { status: 403, headers: corsHeaders });
  }

  try {
    // Aceptar token tanto por header como por query param ?token=
    // (query param evita preflight CORS en Firefox con wildcard origin)
    const authHeader = request.headers.get('Authorization');
    const tokenParam = url.searchParams.get('token');
    const fetchHeaders = { 'User-Agent': 'SRV-Tienda/1.0' };
    if (authHeader) fetchHeaders['Authorization'] = authHeader;
    else if (tokenParam) fetchHeaders['Authorization'] = 'Bearer ' + tokenParam;

    const mlRes = await fetch(mlUrl, { headers: fetchHeaders });
    const data = await mlRes.text();

    return new Response(data, {
      status: mlRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': mlRes.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/.netlify/functions/ml-proxy' };
