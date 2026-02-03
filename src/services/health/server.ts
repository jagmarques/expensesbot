import http from 'http';
import { env } from '../../config/env';

export function startHealthServer(): http.Server {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'expensesbot',
      })
    );
  });

  server.listen(env.HEALTH_PORT, () => {
    console.log(`Health check server running on port ${env.HEALTH_PORT}`);
  });

  return server;
}
