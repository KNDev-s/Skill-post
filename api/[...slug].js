export default async function handler(req, res) {
  try {
    const mod = await import('../backend/dist/server.js');
    const serverHandler = mod.handler || mod.serverHandler || mod.default;
    return await serverHandler(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'CRASH_ON_IMPORT',
        message: err.message,
        stack: err.stack,
      }),
    );
  }
}
