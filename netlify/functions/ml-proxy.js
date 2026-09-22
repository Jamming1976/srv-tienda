const CLIENT_ID = '2028127575858925';
const CLIENT_SECRET = 'VX5MqYqqweyMokqMxBPkV58yXnyUbyiz';
const REDIRECT_URI = 'https://srvtienda.netlify.app/.netlify/functions/ml-proxy?action=callback';

export default async (request) => {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing code', { status: 400 });
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: REDIRECT_URI }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return new Response(JSON.stringify(tokenData), { status: tokenRes.status, headers: corsHeaders });
    const redirectUrl = `https://srvintegral.com/?token_ok=1&ml_token=${encodeURIComponent(tokenData.access_token)}&ml_refresh=${encodeURIComponent(tokenData.refresh_token||'')}&ml_exp=${Date.now()+(tokenData.expires_in||21600)*1000}`;
    return Response.redirect(redirectUrl, 302);
  }

  const mlUrl = url.searchParams.get('url');
  if (!mlUrl || !mlUrl.startsWith('https://api.mercadolibre.com/')) return new Response('Invalid', { status: 403 });
  const authHeader = request.headers.get('Authorization');
  const fetchHeaders = { 'User-Agent': 'SRV-Tienda/1.0' };
  if (authHeader) fetchHeaders['Authorization'] = authHeader;
  const mlRes = await fetch(mlUrl, { headers: fetchHeaders });
  return new Response(await mlRes.text(), { status: mlRes.status, headers: { ...corsHeaders, 'Content-Type': mlRes.headers.get('Content-Type')||'application/json' } });
};

export const config = { path: '/.netlify/functions/ml-proxy' };
