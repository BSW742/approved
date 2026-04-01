const PASSWORD = 'Ben123';
const ALLOWED_ORIGINS = ['https://approved-ayr.pages.dev', 'http://localhost:4321', 'http://localhost:4322', 'http://localhost:4323', 'http://localhost:3000', 'http://localhost:3001'];

export default {
  async fetch(request, env) {
    // CORS handling
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Password',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Password check for writes
    if (request.method !== 'GET') {
      const password = request.headers.get('X-Auth-Password');
      if (password !== PASSWORD) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }
    }

    const url = new URL(request.url);
    const file = url.searchParams.get('file');

    try {
      // GET - fetch file from R2
      if (request.method === 'GET' && file) {
        const object = await env.BUCKET.get(file);
        if (!object) {
          return new Response('Not found', { status: 404, headers: corsHeaders });
        }

        const contentType = file.endsWith('.pdf') ? 'application/pdf' : 'application/json';
        return new Response(object.body, {
          headers: { ...corsHeaders, 'Content-Type': contentType }
        });
      }

      // POST - upload file to R2
      if (request.method === 'POST') {
        const contentType = request.headers.get('Content-Type') || '';

        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file');
          const path = formData.get('path');

          if (!path || !file) {
            return new Response('Missing path or file', { status: 400, headers: corsHeaders });
          }

          await env.BUCKET.put(path, file);
          return Response.json({ success: true }, { headers: corsHeaders });
        }

        // Also support direct JSON body
        const path = url.searchParams.get('path');
        if (path) {
          const body = await request.arrayBuffer();
          await env.BUCKET.put(path, body);
          return Response.json({ success: true }, { headers: corsHeaders });
        }

        return new Response('Missing path parameter', { status: 400, headers: corsHeaders });
      }

      // DELETE - remove file from R2
      if (request.method === 'DELETE' && file) {
        await env.BUCKET.delete(file);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // LIST - list files in a prefix
      if (request.method === 'GET' && url.searchParams.has('list')) {
        const prefix = url.searchParams.get('prefix') || '';
        const listed = await env.BUCKET.list({ prefix });
        const files = listed.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded
        }));
        return Response.json({ files }, { headers: corsHeaders });
      }

      return new Response('Bad request', { status: 400, headers: corsHeaders });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500, headers: corsHeaders });
    }
  }
};
