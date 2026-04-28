export default async (request, context) => {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return new Response(JSON.stringify({ error: "Falta URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const response = await fetch(decodeURIComponent(target), {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    const text = await response.text();
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};

export const config = { path: "/.netlify/functions/ml-proxy" };
